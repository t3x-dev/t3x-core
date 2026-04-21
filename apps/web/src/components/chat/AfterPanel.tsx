'use client';

import type { TreeNode } from '@t3x-dev/core';
import { AlertCircle, Play, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  TREE_BASE_PADDING,
  TREE_FOOTER_HEIGHT,
  TREE_INDENT_STEP,
  TREE_ROW_HEIGHT,
  TREE_TRAILING_WIDTH,
} from '@/components/chat/treeRowMetrics';
import { deriveSlotTag } from '@/domain/diff/deriveSlotTag';
import { computeTreeDiff, type TreeDiffResult } from '@/domain/diff/treeDiff';
import { useCommitActions } from '@/hooks/commits/useCommitActions';
import { useParentCommit } from '@/hooks/commits/useParentCommit';
import { hydrateConversationToStore } from '@/hooks/conversations/hydrateConversationToStore';
import { useGoldEdit } from '@/hooks/shared/useGoldEdit';
import { useCommitStore } from '@/store/commitStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { cn } from '@/utils/cn';

const MONO = { fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 11 } as const;
type SlotDiffType = 'added' | 'modified' | 'removed' | null;

function formatSlotValue(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean')
    return String(val);
  if (Array.isArray(val)) {
    return val
      .map((item) => {
        if (typeof item === 'object' && item !== null) {
          return Object.entries(item)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
        }
        return String(item);
      })
      .join('; ');
  }
  if (typeof val === 'object') {
    return Object.entries(val)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
  }
  return String(val);
}

function summarizeVisibleDiff(diff: TreeDiffResult | null): {
  addedRows: number;
  modifiedRows: number;
  removedRows: number;
} {
  if (!diff) return { addedRows: 0, modifiedRows: 0, removedRows: 0 };
  return {
    addedRows: Object.values(diff.addedSlots).reduce((n, slots) => n + slots.length, 0),
    modifiedRows: Object.values(diff.modifiedSlots).reduce((n, slots) => n + slots.length, 0),
    removedRows:
      Object.values(diff.removedSlots).reduce((n, slots) => n + slots.length, 0) +
      diff.removed.length,
  };
}

interface RenderRowBase {
  key: string;
  depth: number;
}

interface NodeRenderRow extends RenderRowBase {
  kind: 'node';
  path: string;
  nodeKey: string;
  beforeNode: TreeNode | null;
  afterNode: TreeNode | null;
  isAdded: boolean;
  isRemoved: boolean;
}

interface SlotRenderRow extends RenderRowBase {
  kind: 'slot';
  path: string;
  slotKey: string;
  beforeValue: string | null;
  afterValue: string | null;
  diffType: SlotDiffType;
  oldValue?: string;
}

type RenderRow = NodeRenderRow | SlotRenderRow;

function buildRenderRows(
  baseNode: TreeNode | null,
  resultNode: TreeNode | null,
  path: string,
  depth: number,
  diff: TreeDiffResult | null
): RenderRow[] {
  if (!baseNode && !resultNode) return [];
  const isRemovedNode = !!baseNode && !resultNode;
  const nodeKey = resultNode?.key ?? baseNode?.key ?? path.split('/').pop() ?? path;
  const rows: RenderRow[] = [
    {
      kind: 'node',
      key: `node:${path}`,
      path,
      nodeKey,
      depth,
      beforeNode: baseNode,
      afterNode: resultNode,
      isAdded: !!resultNode && !baseNode,
      isRemoved: isRemovedNode,
    },
  ];

  if (isRemovedNode) return rows;

  const baseSlots = baseNode?.slots || {};
  const resultSlots = resultNode?.slots || {};
  const resultSlotKeys = Object.keys(resultSlots).filter((key) => !key.startsWith('_'));
  const baseOnlySlotKeys = Object.keys(baseSlots).filter(
    (key) => !key.startsWith('_') && !(key in resultSlots)
  );
  const orderedSlotKeys = [...resultSlotKeys, ...baseOnlySlotKeys];

  const modifiedByKey = new Map(
    (diff?.modifiedSlots[path] ?? []).map((entry) => [entry.key, entry])
  );
  const addedSlotSet = new Set(diff?.addedSlots[path] ?? []);
  const removedSlotSet = new Set(diff?.removedSlots[path] ?? []);

  for (const slotKey of orderedSlotKeys) {
    const inBase = slotKey in baseSlots;
    const inResult = slotKey in resultSlots;
    const beforeValue = inBase ? formatSlotValue(baseSlots[slotKey]) : null;
    const afterValue = inResult ? formatSlotValue(resultSlots[slotKey]) : null;
    let diffType: SlotDiffType = null;
    let oldValue: string | undefined;

    if (!inBase && inResult) {
      diffType = 'added';
    } else if (inBase && !inResult) {
      diffType = 'removed';
    } else if (addedSlotSet.has(slotKey)) {
      diffType = 'added';
    } else if (removedSlotSet.has(slotKey)) {
      diffType = 'removed';
    } else if (modifiedByKey.has(slotKey)) {
      diffType = 'modified';
      oldValue = modifiedByKey.get(slotKey)?.oldValue;
    } else if (resultNode && !baseNode) {
      diffType = 'added';
    }

    rows.push({
      kind: 'slot',
      key: `slot:${path}:${slotKey}`,
      path,
      slotKey,
      depth: depth + 1,
      beforeValue,
      afterValue,
      diffType,
      oldValue,
    });
  }

  const baseChildren = new Map((baseNode?.children ?? []).map((child) => [child.key, child]));
  const resultChildren = new Map((resultNode?.children ?? []).map((child) => [child.key, child]));
  const childOrder = [
    ...resultChildren.keys(),
    ...Array.from(baseChildren.keys()).filter((key) => !resultChildren.has(key)),
  ];

  for (const childKey of childOrder) {
    const nextBase = baseChildren.get(childKey) ?? null;
    const nextResult = resultChildren.get(childKey) ?? null;
    rows.push(...buildRenderRows(nextBase, nextResult, `${path}/${childKey}`, depth + 1, diff));
  }

  return rows;
}

interface SlotCellProps {
  side: 'before' | 'after';
  row: SlotRenderRow;
  parentMessage: string | null;
  selected: boolean;
  onSelect: () => void;
  onClear: () => void;
  onDelete?: () => void;
  onEdit?: (newValue: string) => void;
}

function SlotCell({
  side,
  row,
  parentMessage,
  selected,
  onSelect,
  onClear,
  onDelete,
  onEdit,
}: SlotCellProps) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const displayValue = side === 'before' ? row.beforeValue : row.afterValue;
  const isInteractive = side === 'after';
  const tag = side === 'after' ? deriveSlotTag({ diffType: row.diffType, parentMessage }) : null;
  const isRemoved = row.diffType === 'removed';
  const isModified = row.diffType === 'modified';
  const isAdded = row.diffType === 'added';
  const paddingLeft = TREE_BASE_PADDING + row.depth * TREE_INDENT_STEP;

  const handleStartEdit = useCallback(() => {
    if (!isInteractive || !onEdit || isRemoved) return;
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [isInteractive, isRemoved, onEdit]);

  const handleSave = useCallback(() => {
    if (!onEdit) {
      setEditing(false);
      return;
    }
    const newValue = inputRef.current?.value.trim() ?? '';
    if (newValue && newValue !== displayValue) onEdit(newValue);
    setEditing(false);
  }, [displayValue, onEdit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') handleSave();
      if (e.key === 'Escape') setEditing(false);
    },
    [handleSave]
  );

  const rowBg =
    side === 'after'
      ? isAdded
        ? 'bg-[var(--status-success)]/[0.04]'
        : isModified
          ? 'bg-[var(--status-warning)]/[0.05]'
          : isRemoved
            ? 'bg-[var(--status-error)]/[0.035] opacity-50'
            : ''
      : '';

  const gutterColor =
    side === 'after'
      ? isAdded
        ? 'bg-[var(--status-success)]'
        : isModified
          ? 'bg-[var(--status-warning)]'
          : isRemoved
            ? 'bg-[var(--status-error)]'
            : 'bg-transparent'
      : 'bg-transparent';

  return (
    <div className="h-full w-full">
      <div className={cn('flex h-full w-full items-stretch', rowBg)}>
        <div className={`shrink-0 w-[3px] ${selected ? 'bg-[var(--source)]' : gutterColor}`} />
        <div
          className={cn(
            'group flex min-w-0 flex-1 items-center gap-1 px-2 transition-colors',
            isInteractive && 'cursor-pointer hover:bg-[var(--hover-bg)]',
            selected && 'bg-[var(--source-dim)]'
          )}
          style={{ ...MONO, paddingLeft }}
          onClick={() => (selected ? onClear() : onSelect())}
          onDoubleClick={handleStartEdit}
        >
          <span
            className={cn('shrink-0 text-[var(--text-secondary)]', isRemoved && 'line-through')}
          >
            {row.slotKey}
          </span>
          <span className="shrink-0 text-[var(--text-tertiary)]">:</span>
          {editing ? (
            <input
              ref={inputRef}
              defaultValue={displayValue ?? ''}
              onKeyDown={handleKeyDown}
              onBlur={handleSave}
              className="flex-1 min-w-0 bg-transparent border-0 border-b-[1.5px] border-b-[var(--status-warning)] outline-none text-[var(--text-primary)]"
              style={{ fontFamily: 'inherit', fontSize: 'inherit' }}
            />
          ) : (
            <>
              {side === 'after' && isModified && row.oldValue && (
                <span className="text-[var(--status-error)] opacity-50 line-through truncate mr-1">
                  {row.oldValue}
                </span>
              )}
              <span
                className={cn('truncate text-[var(--text-primary)]', isRemoved && 'line-through')}
              >
                {displayValue ?? ''}
              </span>
            </>
          )}
          {side === 'after' && tag && (
            <span className="ml-auto shrink-0" style={{ width: TREE_TRAILING_WIDTH }}>
              <span
                className={cn(
                  'inline-flex max-w-full items-center justify-end overflow-hidden text-ellipsis whitespace-nowrap rounded-full px-1.5 py-px text-[7px] font-semibold',
                  tag.kind === 'inherited' && 'text-[var(--text-tertiary)] bg-black/[0.03]',
                  tag.kind === 'new' &&
                    'text-[var(--status-success)] bg-[var(--status-success)]/10',
                  tag.kind === 'modified' &&
                    'text-[var(--status-warning)] bg-[var(--status-warning)]/10',
                  tag.kind === 'removed' && 'text-[var(--status-error)] bg-[var(--status-error)]/10'
                )}
              >
                {tag.label}
              </span>
            </span>
          )}
          {side === 'after' && onDelete && (
            <div className="ml-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                data-testid="slot-delete"
                title="Delete slot"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--status-error)] hover:bg-[var(--hover-bg)]"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface NodeCellProps {
  side: 'before' | 'after';
  row: NodeRenderRow;
  selected: boolean;
  onSelect: () => void;
  onClear: () => void;
  onAddChild?: () => void;
  onDeleteNode?: () => void;
}

function NodeCell({
  side,
  row,
  selected,
  onSelect,
  onClear,
  onAddChild,
  onDeleteNode,
}: NodeCellProps) {
  const isRemoved = row.isRemoved && side === 'after';
  const isAdded = row.isAdded && side === 'after';
  const hasNode = side === 'before' ? !!row.beforeNode : !!row.afterNode || row.isRemoved;
  const paddingLeft = TREE_BASE_PADDING + row.depth * TREE_INDENT_STEP;
  const nodeBg =
    side === 'after'
      ? isAdded
        ? 'bg-[var(--status-success)]/[0.04]'
        : isRemoved
          ? 'bg-[var(--status-error)]/[0.035] opacity-50'
          : ''
      : '';
  const gutterColor =
    side === 'after'
      ? isAdded
        ? 'bg-[var(--status-success)]'
        : isRemoved
          ? 'bg-[var(--status-error)]'
          : 'bg-transparent'
      : 'bg-transparent';

  return (
    <div className="h-full w-full">
      <div className={cn('group flex h-full w-full items-stretch', nodeBg)}>
        <div className={`shrink-0 w-[3px] ${selected ? 'bg-[var(--source)]' : gutterColor}`} />
        <div
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1 px-2 transition-colors',
            hasNode && 'cursor-pointer hover:bg-[var(--hover-bg)]',
            selected && 'bg-[var(--source-dim)]'
          )}
          style={{ ...MONO, paddingLeft }}
          onClick={() => (hasNode ? (selected ? onClear() : onSelect()) : undefined)}
        >
          {hasNode && <span className="text-[8px] text-[var(--text-tertiary)] mr-1">◆</span>}
          <span
            className={cn(
              'text-[var(--text-secondary)] font-semibold',
              isRemoved && 'line-through'
            )}
          >
            {row.nodeKey}
          </span>
          <span className="text-[var(--text-tertiary)]">:</span>
          {side === 'after' && (
            <>
              <span className="ml-auto shrink-0" style={{ width: TREE_TRAILING_WIDTH }}>
                {isAdded && (
                  <span className="inline-flex max-w-full items-center justify-end overflow-hidden text-ellipsis whitespace-nowrap rounded-full bg-[var(--status-success)]/10 px-1.5 py-px text-[7px] font-semibold text-[var(--status-success)]">
                    New node
                  </span>
                )}
                {isRemoved && (
                  <span className="inline-flex max-w-full items-center justify-end overflow-hidden text-ellipsis whitespace-nowrap rounded-full bg-[var(--status-error)]/10 px-1.5 py-px text-[7px] font-semibold text-[var(--status-error)]">
                    Removed node
                  </span>
                )}
              </span>
              {row.afterNode && (
                <div className="ml-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    data-testid="add-child-button"
                    title="Add child node"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddChild?.();
                    }}
                    className="p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--status-success)] hover:bg-[var(--hover-bg)]"
                  >
                    <Plus className="h-2.5 w-2.5" />
                  </button>
                  <button
                    type="button"
                    title="Remove node and children"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteNode?.();
                    }}
                    className="p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--status-error)] hover:bg-[var(--hover-bg)]"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function AfterPanel({
  showBeforeToggle,
  onToggleBefore,
  beforeVisible,
}: {
  showBeforeToggle?: boolean;
  onToggleBefore?: () => void;
  beforeVisible?: boolean;
}) {
  const tree = useWorkspaceStore((s) => s.tree);
  const isCommitted = useWorkspaceStore((s) => s.isCommitted);
  const opsCount = useWorkspaceStore((s) => s.opsLog.length);
  const lastError = useWorkspaceStore((s) => s.lastError);
  const selectedNodePath = useWorkspaceStore((s) => s.selectedNodePath);
  const selectedSlotKey = useWorkspaceStore((s) => s.selectedSlotKey);
  const select = useWorkspaceStore((s) => s.select);
  const clearSelection = useWorkspaceStore((s) => s.clearSelection);
  const { applyEdit } = useGoldEdit();
  const parent = useParentCommit();

  const isCommitting = useCommitStore((s) => s.isCommitting);
  const projectId = useCommitStore((s) => s.projectId);
  const { commit: commitTrees } = useCommitActions();
  const commitInputRef = useRef<HTMLInputElement | null>(null);

  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');

  const trees = tree.trees as TreeNode[];
  const parentTrees = parent?.trees ?? [];
  const hasResult = trees.length > 0;
  const hasParent = !!parent;
  const showBefore = !!beforeVisible && hasParent;

  const diff = useMemo<TreeDiffResult | null>(() => {
    if (!parent) return null;
    return computeTreeDiff(parent.trees, tree.trees);
  }, [parent, tree.trees]);

  const summary = useMemo(() => summarizeVisibleDiff(diff), [diff]);
  const parentMessage = parent?.message ?? null;

  useEffect(() => {
    if (!showCommitDialog) return;
    commitInputRef.current?.focus();
    commitInputRef.current?.select();
  }, [showCommitDialog]);

  const rows = useMemo<RenderRow[]>(() => {
    const baseRoots = new Map(parentTrees.map((node) => [node.key, node]));
    const resultRoots = new Map(trees.map((node) => [node.key, node]));
    const rootOrder = [
      ...resultRoots.keys(),
      ...Array.from(baseRoots.keys()).filter((key) => !resultRoots.has(key)),
    ];
    return rootOrder.flatMap((key) =>
      buildRenderRows(baseRoots.get(key) ?? null, resultRoots.get(key) ?? null, key, 0, diff)
    );
  }, [diff, parentTrees, trees]);

  const handleEditSlot = useCallback(
    (nodePath: string, slotKey: string, newValue: string) => {
      void applyEdit({ set: { path: `${nodePath}/${slotKey}`, value: newValue } });
    },
    [applyEdit]
  );

  const handleDeleteSlot = useCallback(
    (nodePath: string, slotKey: string) => {
      void applyEdit({ unset: { path: `${nodePath}/${slotKey}` } });
    },
    [applyEdit]
  );

  const handleAddChild = useCallback(
    (nodePath: string) => {
      const childKey = window.prompt('New node name (snake_case):');
      if (!childKey || !childKey.trim()) return;
      const cleanKey = childKey.trim().toLowerCase().replace(/\s+/g, '_');
      void applyEdit({ define: { path: `${nodePath}/${cleanKey}` } });
    },
    [applyEdit]
  );

  const handleDeleteNode = useCallback(
    (nodePath: string, nodeKey: string) => {
      if (!window.confirm(`Remove "${nodeKey}" and all its children?`)) return;
      void applyEdit({ drop: { path: nodePath } });
    },
    [applyEdit]
  );

  const getDefaultCommitName = useCallback(() => {
    if (!trees.length) return 'Knowledge Extract';
    return trees
      .slice(0, 3)
      .map((t) => t.key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
      .join(' & ');
  }, [trees]);

  const handleCommit = useCallback(
    async (message: string) => {
      try {
        useWorkspaceStore.getState().setMode('committing');
        await commitTrees(message || 'Knowledge Extract');
        useWorkspaceStore.getState().setMode('idle');
        useWorkspaceStore.getState().setCommitted(true);
        setShowCommitDialog(false);
        toast.success('Committed successfully');
        try {
          new BroadcastChannel('t3x-commits').postMessage({ type: 'commit.created' });
        } catch {
          // BroadcastChannel not supported
        }
      } catch (err: unknown) {
        useWorkspaceStore.getState().setMode('idle');
        toast.error(`Commit failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    },
    [commitTrees]
  );

  const handleDiscard = useCallback(async () => {
    const convId = useWorkspaceStore.getState().conversationId;
    if (!projectId || !convId || isCommitting) return;
    await hydrateConversationToStore(projectId, convId);
    useWorkspaceStore.getState().clearSelection();
    useWorkspaceStore.getState().setMode('idle');
    toast.success('Workspace reverted to last commit');
  }, [isCommitting, projectId]);

  return (
    <div data-testid="after-panel" className="relative flex h-full min-h-0 w-full flex-1 flex-col">
      <div
        className={cn(
          'grid shrink-0 border-b border-[var(--stroke-default)] bg-[var(--panel-alt)]',
          showBefore ? 'grid-cols-2' : 'grid-cols-1'
        )}
      >
        {showBefore && (
          <div className="flex items-center justify-between px-3 py-1.5 border-r border-[var(--stroke-default)]">
            <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Before <span className="opacity-80">🔒</span>
            </span>
            <span className="text-[9px] font-mono text-[var(--text-tertiary)] opacity-60 truncate max-w-[150px]">
              {parentMessage ??
                (parent ? parent.hash.replace(/^sha256:/, '').slice(0, 6) : 'empty')}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between px-3 py-1.5 min-w-0">
          <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Result
          </span>
          {showBeforeToggle && onToggleBefore && hasParent && (
            <button
              type="button"
              onClick={onToggleBefore}
              className={`text-[9px] font-medium px-1.5 py-0.5 rounded transition-colors ${
                showBefore
                  ? 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'
                  : 'bg-[var(--source)]/10 text-[var(--source)]'
              }`}
            >
              {showBefore ? 'Hide Previous' : 'Show Previous'}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto bg-[var(--panel)]">
        {rows.length === 0 && lastError ? (
          <div className="flex h-full min-h-[160px] items-center justify-center px-6">
            <div className="flex max-w-[280px] flex-col items-center gap-2 text-center">
              <AlertCircle className="h-5 w-5 text-[var(--status-error)] opacity-80" />
              <span className="text-[11px] leading-5 text-[var(--status-error)]">{lastError}</span>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-full min-h-[160px] items-center justify-center opacity-40">
            <div className="flex flex-col items-center gap-2">
              <Play className="h-5 w-5 text-[var(--text-tertiary)]" />
              <span className="text-[10px] text-[var(--text-tertiary)] italic">
                No knowledge extracted yet
              </span>
            </div>
          </div>
        ) : (
          <div className="flex min-h-full flex-col">
            {rows.map((row) => {
              const rowSelected =
                selectedNodePath === row.path &&
                (row.kind === 'node' ? !selectedSlotKey : selectedSlotKey === row.slotKey);

              const beforeCell =
                row.kind === 'node' ? (
                  <NodeCell
                    key={`${row.key}:before-node`}
                    side="before"
                    row={row}
                    selected={rowSelected}
                    onSelect={() => select('before', { nodePath: row.path })}
                    onClear={clearSelection}
                  />
                ) : (
                  <SlotCell
                    key={`${row.key}:before-slot`}
                    side="before"
                    row={row}
                    parentMessage={parentMessage}
                    selected={rowSelected}
                    onSelect={() => select('before', { nodePath: row.path, slotKey: row.slotKey })}
                    onClear={clearSelection}
                  />
                );

              const afterCell =
                row.kind === 'node' ? (
                  <NodeCell
                    key={`${row.key}:after-node`}
                    side="after"
                    row={row}
                    selected={rowSelected}
                    onSelect={() => select('after', { nodePath: row.path })}
                    onClear={clearSelection}
                    onAddChild={row.afterNode ? () => handleAddChild(row.path) : undefined}
                    onDeleteNode={
                      row.afterNode ? () => handleDeleteNode(row.path, row.nodeKey) : undefined
                    }
                  />
                ) : (
                  <SlotCell
                    key={`${row.key}:after-slot`}
                    side="after"
                    row={row}
                    parentMessage={parentMessage}
                    selected={rowSelected}
                    onSelect={() => select('after', { nodePath: row.path, slotKey: row.slotKey })}
                    onClear={clearSelection}
                    onDelete={
                      row.afterValue !== null
                        ? () => handleDeleteSlot(row.path, row.slotKey)
                        : undefined
                    }
                    onEdit={
                      row.afterValue !== null
                        ? (newValue) => handleEditSlot(row.path, row.slotKey, newValue)
                        : undefined
                    }
                  />
                );

              return showBefore ? (
                <div
                  key={row.key}
                  className="grid w-full grid-cols-2"
                  style={{ minHeight: TREE_ROW_HEIGHT }}
                >
                  <div
                    className="border-r border-[var(--stroke-default)] border-b border-black/[0.025]"
                    style={{ height: TREE_ROW_HEIGHT }}
                  >
                    {beforeCell}
                  </div>
                  <div
                    className="border-b border-black/[0.025]"
                    style={{ height: TREE_ROW_HEIGHT }}
                  >
                    {afterCell}
                  </div>
                </div>
              ) : (
                <div
                  key={row.key}
                  className="w-full border-b border-black/[0.025]"
                  style={{ height: TREE_ROW_HEIGHT }}
                >
                  {afterCell}
                </div>
              );
            })}
            {showBefore && rows.length === 0 && (
              <div className="border-r border-[var(--stroke-default)] flex items-center justify-center text-[10px] text-[var(--text-tertiary)] opacity-40 italic">
                {parent ? 'Parent commit is empty' : 'No prior commits'}
              </div>
            )}
          </div>
        )}
      </div>

      <div
        className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--stroke-default)] bg-[var(--panel-alt)] px-3"
        style={{ height: TREE_FOOTER_HEIGHT }}
      >
        <span className="text-[9px] font-mono text-[var(--text-tertiary)] truncate">
          {opsCount} ops
          {diff && (
            <>
              {' · '}
              {summary.addedRows > 0 && (
                <span className="text-[var(--status-success)]">+{summary.addedRows}</span>
              )}
              {summary.modifiedRows > 0 && (
                <span className="text-[var(--status-warning)]"> ~{summary.modifiedRows}</span>
              )}
              {summary.removedRows > 0 && (
                <span className="text-[var(--status-error)]"> −{summary.removedRows}</span>
              )}
            </>
          )}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void handleDiscard()}
            disabled={!projectId || !hasResult || isCommitting || isCommitted}
            className="flex min-w-[88px] items-center justify-center rounded border border-[var(--stroke-default)] bg-transparent px-3 py-2 text-[11px] font-semibold text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Discard
          </button>
          <button
            type="button"
            data-testid="commit-button"
            onClick={() => {
              setCommitMessage(getDefaultCommitName());
              setShowCommitDialog(true);
            }}
            disabled={!hasResult || isCommitting || isCommitted}
            className="flex min-w-[96px] items-center justify-center gap-1 rounded bg-[var(--commit)] px-3 py-2 text-[11px] font-semibold text-[var(--commit-text)] hover:bg-[var(--commit-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {isCommitting ? 'Committing...' : '\u2192 Commit'}
          </button>
        </div>
      </div>

      {showCommitDialog && (
        <div
          data-testid="commit-dialog"
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 backdrop-blur-sm rounded-b-lg"
        >
          <div className="bg-[var(--panel)] border border-[var(--stroke-default)] rounded-xl p-4 mx-3 w-full max-w-[280px] shadow-lg">
            <label
              htmlFor="after-panel-commit-message"
              className="block text-[10px] font-semibold text-[var(--text-secondary)] mb-1.5"
            >
              Name this commit
            </label>
            <input
              id="after-panel-commit-message"
              ref={commitInputRef}
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isCommitting) handleCommit(commitMessage);
                if (e.key === 'Escape') setShowCommitDialog(false);
              }}
              className="w-full rounded-lg border border-[var(--stroke-default)] bg-[var(--surface-elevated)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--commit)] transition-colors"
              placeholder="e.g. Budget & Attractions"
            />
            <div className="flex justify-end gap-1.5 mt-3">
              <button
                type="button"
                onClick={() => setShowCommitDialog(false)}
                className="rounded px-2.5 py-1 text-[10px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)]"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="commit-dialog-confirm"
                onClick={() => handleCommit(commitMessage)}
                disabled={isCommitting}
                className="rounded bg-[var(--commit)] px-2.5 py-1 text-[10px] font-semibold text-[var(--commit-text)] hover:bg-[var(--commit-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {isCommitting ? 'Committing...' : 'Commit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
