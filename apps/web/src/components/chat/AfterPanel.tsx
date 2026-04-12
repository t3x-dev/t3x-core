'use client';

import type { TreeNode } from '@t3x-dev/core';
import { Check, Play, Plus, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getSlotSource } from '@/queries/source';
import { useCommitStore } from '@/store/commitStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useGoldEdit } from './useGoldEdit';

// ── Constants ──

const MONO = { fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 11 } as const;

/** Format a slot value for display — handles strings, numbers, arrays, objects */
function formatSlotValue(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) {
    return val.map((item) => {
      if (typeof item === 'object' && item !== null) {
        return Object.entries(item).map(([k, v]) => `${k}: ${v}`).join(', ');
      }
      return String(item);
    }).join('; ');
  }
  if (typeof val === 'object') {
    return Object.entries(val).map(([k, v]) => `${k}: ${v}`).join(', ');
  }
  return String(val);
}

// ── SlotRow ──

interface SlotRowProps {
  nodeKey: string;
  nodePath: string;
  slotKey: string;
  value: string;
  diffType: 'added' | 'modified' | 'removed' | null;
  oldValue?: string;
  sourceTag?: string;
  onDelete: () => void;
  onEdit: (newValue: string) => void;
}

function SlotRow({
  nodeKey: _nodeKey,
  nodePath,
  slotKey,
  value,
  diffType,
  oldValue,
  sourceTag,
  onDelete,
  onEdit,
}: SlotRowProps) {
  const [editing, setEditing] = useState(false);
  const select = useWorkspaceStore((s) => s.select);
  const clearSelection = useWorkspaceStore((s) => s.clearSelection);
  const selectedPath = useWorkspaceStore((s) => s.selectedNodePath);
  const selectedSlot = useWorkspaceStore((s) => s.selectedSlotKey);
  const isSlotSelected = selectedPath === nodePath && selectedSlot === slotKey;
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDoubleClick = useCallback(() => {
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleSave = useCallback(() => {
    const newValue = inputRef.current?.value.trim() ?? '';
    if (newValue && newValue !== value) onEdit(newValue);
    setEditing(false);
  }, [value, onEdit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') handleSave();
      if (e.key === 'Escape') setEditing(false);
    },
    [handleSave]
  );

  const gutterColor =
    diffType === 'added'
      ? 'bg-[var(--status-success)]'
      : diffType === 'modified'
        ? 'bg-[var(--status-warning)]'
        : diffType === 'removed'
          ? 'bg-[var(--status-error)]'
          : 'bg-transparent';

  if (editing) {
    return (
      <div className="flex items-stretch" style={{ minHeight: 24 }}>
        <div className={`shrink-0 w-[3px] ${gutterColor}`} />
        <div className="flex-1 min-w-0 flex items-center gap-1 px-2 py-0.5 bg-[var(--status-warning)]/[0.06]" style={MONO}>
          <span className="shrink-0 text-[var(--yaml-key,#2563eb)]">{slotKey}:</span>
          <input
            ref={inputRef}
            defaultValue={value}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            className="flex-1 min-w-0 bg-transparent border-0 border-b-[1.5px] border-b-[var(--status-warning)] outline-none text-[var(--text-primary)]"
            style={{ fontFamily: 'inherit', fontSize: 'inherit' }}
          />
          <span className="shrink-0 text-[8px] text-[var(--text-tertiary)] whitespace-nowrap">Enter ↵ · Esc ✕</span>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-stretch" style={{ minHeight: 24 }}>
      <div className={`shrink-0 w-[3px] ${isSlotSelected ? 'bg-[var(--source)]' : gutterColor}`} />
      <div
        className={cn(
          'flex-1 min-w-0 flex items-center gap-1 px-2 py-0.5 cursor-pointer hover:bg-[var(--hover-bg)] transition-colors',
          isSlotSelected && 'bg-[var(--source-dim)]'
        )}
        style={MONO}
        onClick={() => isSlotSelected ? clearSelection() : select('after', { nodePath, slotKey })}
        onDoubleClick={handleDoubleClick}
      >
        <span className="shrink-0 text-[var(--yaml-key,#2563eb)]">{slotKey}:</span>
        {diffType === 'modified' && oldValue && (
          <span className="text-[var(--status-error)] opacity-50 line-through mr-1 truncate text-[10px]">
            {oldValue}
          </span>
        )}
        <span
          className={
            diffType === 'added'
              ? 'text-[var(--status-success)] truncate'
              : diffType === 'modified'
                ? 'text-[var(--status-warning)] truncate'
                : diffType === 'removed'
                  ? 'text-[var(--status-error)] opacity-50 line-through truncate'
                  : 'text-[var(--yaml-string,#16a34a)] truncate'
          }
        >
          {value}
        </span>
        {/* Source tag — turn reference if available */}
        {sourceTag && (
          <span
            className="text-[7px] font-bold px-1 py-px rounded-sm bg-[var(--source-dim)] text-[var(--source)] cursor-pointer hover:bg-[var(--source)]/20 shrink-0 ml-1 tracking-wide"
            title={`Source: ${sourceTag}`}
          >
            {sourceTag}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pr-1">
          <button
            type="button"
            title="Delete slot"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--status-error)] hover:bg-[var(--hover-bg)]"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── NodeRow ──

interface NodeRowProps {
  node: TreeNode;
  /** Full path for source tracing (e.g., "root/child") */
  path: string;
  depth: number;
  diffType: 'added' | 'removed' | null;
  addedSlots: string[];
  removedSlots: string[];
  modifiedSlots: Array<{ key: string; oldValue: string; newValue: string }>;
  onDismiss: () => void;
  onAccept: () => void;
  onEditSlot: (slotKey: string, newValue: string) => void;
  onDeleteSlot: (slotKey: string) => void;
}

function NodeRow({
  node,
  path,
  depth,
  diffType,
  addedSlots,
  removedSlots,
  modifiedSlots,
  onDismiss,
  onAccept,
  onEditSlot,
  onDeleteSlot,
}: NodeRowProps) {
  const selectedNodePath = useWorkspaceStore((s) => s.selectedNodePath);
  const select = useWorkspaceStore((s) => s.select);
  const clearSelection = useWorkspaceStore((s) => s.clearSelection);
  const sourceIndex = useWorkspaceStore((s) => s.sourceIndex);
  const { applyEdit } = useGoldEdit();
  const isSelected = selectedNodePath === path;

  const nodeSource = getSlotSource(sourceIndex, path);
  const sourceTag =
    nodeSource?.type === 'llm' ? 'LLM' : nodeSource?.type === 'human' ? 'human' : null;

  const handleDropNode = useCallback(() => {
    if (!window.confirm(`Remove "${node.key}" and all its children?`)) return;
    void applyEdit({ drop: { path } });
  }, [path, node.key, applyEdit]);

  const handleAddChild = useCallback(() => {
    const childKey = window.prompt('New node name (snake_case):');
    if (!childKey || !childKey.trim()) return;
    const cleanKey = childKey.trim().toLowerCase().replace(/\s+/g, '_');
    void applyEdit({ define: { path: `${path}/${cleanKey}` } });
  }, [path, applyEdit]);
  const slots = node.slots || {};
  const slotEntries = Object.entries(slots).filter(([k]) => !k.startsWith('_'));
  const hasChanges =
    diffType !== null ||
    addedSlots.length > 0 ||
    removedSlots.length > 0 ||
    modifiedSlots.length > 0;

  const nodeGutterColor =
    diffType === 'added'
      ? 'bg-[var(--status-success)]'
      : diffType === 'removed'
        ? 'bg-[var(--status-error)]'
        : hasChanges
          ? 'bg-[var(--status-warning)]'
          : 'bg-transparent';

  const nodeBg =
    diffType === 'added'
      ? 'bg-[var(--status-success)]/[0.04]'
      : diffType === 'removed'
        ? 'bg-[var(--status-error)]/[0.04]'
        : hasChanges
          ? 'bg-[var(--status-warning)]/[0.03]'
          : '';

  return (
    <>
      {/* Node header */}
      <div
        className={`group flex items-stretch ${nodeBg} ${isSelected ? 'ring-1 ring-[var(--source)]/40 bg-[var(--source-dim)]' : ''}`}
        style={{ minHeight: 26 }}
      >
        <div
          className={`shrink-0 w-[3px] ${isSelected ? 'bg-[var(--source)]' : nodeGutterColor}`}
        />
        <div
          className="flex-1 flex items-center gap-1 px-2 py-0.5 hover:bg-[var(--hover-bg)] transition-colors cursor-pointer"
          onClick={() => (isSelected ? clearSelection() : select('after', { nodePath: path }))}
          style={{ ...MONO, paddingLeft: `${8 + depth * 14}px` }}
        >
          <span
            className={
              diffType === 'added'
                ? 'text-[var(--status-success)] font-semibold'
                : diffType === 'removed'
                  ? 'text-[var(--status-error)]/60 line-through font-semibold'
                  : 'text-[var(--yaml-key,#2563eb)] font-semibold'
            }
          >
            {node.key}:
          </span>
          {diffType === 'added' && (
            <span className="text-[8px] text-[var(--status-success)] bg-[var(--status-success)]/15 px-1 py-0.5 rounded ml-1">
              new
            </span>
          )}
          {sourceTag && (
            <span
              className="text-[7px] font-bold px-1 py-px rounded-sm bg-[var(--source-dim)] text-[var(--source)] cursor-pointer hover:bg-[var(--source)]/20 shrink-0 ml-1 tracking-wide"
              onClick={(e) => {
                e.stopPropagation();
                select('after', { nodePath: path });
              }}
            >
              {sourceTag}
            </span>
          )}
          <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pr-2">
            {hasChanges && diffType !== 'removed' && (
              <>
                <button
                  type="button"
                  title="Keep changes"
                  onClick={(e) => { e.stopPropagation(); onAccept(); }}
                  className="p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--status-success)]"
                >
                  <Check className="h-2.5 w-2.5" />
                </button>
                <button
                  type="button"
                  title="Dismiss changes"
                  onClick={(e) => { e.stopPropagation(); onDismiss(); }}
                  className="p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--status-warning)]"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </>
            )}
            <button
              type="button"
              title="Add child node"
              onClick={(e) => { e.stopPropagation(); handleAddChild(); }}
              className="p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--status-success)] hover:bg-[var(--hover-bg)]"
            >
              <Plus className="h-2.5 w-2.5" />
            </button>
            <button
              type="button"
              title="Remove node and children"
              onClick={(e) => { e.stopPropagation(); handleDropNode(); }}
              className="p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--status-error)] hover:bg-[var(--hover-bg)]"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Slot rows */}
      {slotEntries.map(([key, val]) => {
        const isAdded = addedSlots.includes(key);
        const isRemoved = removedSlots.includes(key);
        const mod = modifiedSlots.find((m) => m.key === key);

        const slotDiff = isAdded
          ? 'added'
          : isRemoved
            ? 'removed'
            : mod
              ? 'modified'
              : diffType === 'added'
                ? 'added'
                : null;

        return (
          <div key={key} style={{ paddingLeft: `${8 + (depth + 1) * 14}px` }}>
            <SlotRow
              nodeKey={node.key}
              nodePath={path}
              slotKey={key}
              value={formatSlotValue(val)}
              diffType={slotDiff}
              oldValue={mod?.oldValue}
              sourceTag={sourceTag ?? undefined}
              onDelete={() => onDeleteSlot(key)}
              onEdit={(newValue) => onEditSlot(key, newValue)}
            />
          </div>
        );
      })}

      {/* Removed slots (exist in base, not in result) */}
      {removedSlots
        .filter((k) => !(k in slots))
        .map((key) => (
          <div key={`removed-${key}`} style={{ paddingLeft: `${8 + (depth + 1) * 14}px` }}>
            <div className="flex items-stretch" style={{ minHeight: 24 }}>
              <div className="shrink-0 w-[3px] bg-[var(--status-error)]" />
              <div
                className="flex-1 min-w-0 flex items-center gap-1 px-2 py-0.5 opacity-50"
                style={MONO}
              >
                <span className="text-[var(--text-secondary)] line-through">{key}: —</span>
              </div>
            </div>
          </div>
        ))}

      {/* Children */}
      {node.children?.map((child: TreeNode) => (
        <AfterNodeRecursive key={child.key} node={child} path={`${path}/${child.key}`} depth={depth + 1} />
      ))}
    </>
  );
}

// ── AfterNodeRecursive — re-uses diff from parent context ──

interface AfterNodeRecursiveProps {
  path: string;
  node: TreeNode;
  depth: number;
}

function AfterNodeRecursive({ node, path, depth }: AfterNodeRecursiveProps) {
  const slots = node.slots || {};
  const slotEntries = Object.entries(slots).filter(([k]) => !k.startsWith('_'));
  const select = useWorkspaceStore((s) => s.select);
  const clearSelection = useWorkspaceStore((s) => s.clearSelection);
  const { applyEdit } = useGoldEdit();
  const selectedPath = useWorkspaceStore((s) => s.selectedNodePath);
  const selectedSlot = useWorkspaceStore((s) => s.selectedSlotKey);
  const isNodeSelected = selectedPath === path && !selectedSlot;

  const handleEditSlot = useCallback(
    (slotKey: string, newValue: string) => {
      void applyEdit({ set: { path: `${path}/${slotKey}`, value: newValue } });
    },
    [path, applyEdit]
  );

  const handleDeleteSlot = useCallback(
    (slotKey: string) => {
      void applyEdit({ unset: { path: `${path}/${slotKey}` } });
    },
    [path, applyEdit]
  );

  const handleDropNode = useCallback(() => {
    if (!window.confirm(`Remove "${node.key}" and all its children?`)) return;
    void applyEdit({ drop: { path } });
  }, [path, node.key, applyEdit]);

  const handleAddChild = useCallback(() => {
    const childKey = window.prompt('New node name (snake_case):');
    if (!childKey || !childKey.trim()) return;
    const cleanKey = childKey.trim().toLowerCase().replace(/\s+/g, '_');
    void applyEdit({ define: { path: `${path}/${cleanKey}` } });
  }, [path, applyEdit]);

  return (
    <>
      <div className="group flex items-stretch" style={{ minHeight: 26 }}>
        <div className={`shrink-0 w-[3px] ${isNodeSelected ? 'bg-[var(--source)]' : 'bg-transparent'}`} />
        <div
          className={cn(
            'flex-1 flex items-center gap-1 py-0.5 cursor-pointer hover:bg-[var(--hover-bg)] transition-colors',
            isNodeSelected && 'bg-[var(--source-dim)]'
          )}
          style={{ ...MONO, paddingLeft: `${8 + depth * 14}px` }}
          onClick={() => isNodeSelected ? clearSelection() : select('after', { nodePath: path })}
        >
          <span className="text-[var(--yaml-key,#2563eb)] font-semibold">{node.key}:</span>
          <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pr-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleAddChild(); }}
              title="Add child node"
              className="p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--status-success)] hover:bg-[var(--hover-bg)]"
            >
              <Plus className="h-2.5 w-2.5" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleDropNode(); }}
              title="Remove node and children"
              className="p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--status-error)] hover:bg-[var(--hover-bg)]"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        </div>
      </div>
      {slotEntries.map(([key, val]) => (
        <div key={key} style={{ paddingLeft: `${8 + (depth + 1) * 14}px` }}>
          <SlotRow
            nodeKey={node.key}
            nodePath={path}
            slotKey={key}
            value={formatSlotValue(val)}
            diffType={null}
            onDelete={() => handleDeleteSlot(key)}
            onEdit={(newValue) => handleEditSlot(key, newValue)}
          />
        </div>
      ))}
      {node.children?.map((child: TreeNode) => (
        <AfterNodeRecursive key={child.key} node={child} path={`${path}/${child.key}`} depth={depth + 1} />
      ))}
    </>
  );
}

// ── AfterPanel ──

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
  const { applyEdit } = useGoldEdit();

  const isCommitting = useCommitStore((s) => s.isCommitting);

  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');

  const trees = tree.trees as TreeNode[];
  const hasResult = trees.length > 0;

  // ── Dismiss: no-op in new architecture (script ops are gone) ──
  const handleDismiss = useCallback((_nodeKey: string) => {
    // TODO(commit5-diff-display): implement dismiss via gold-edit drop op if needed
  }, []);

  // ── Accept: no-op (changes are already in the tree) ──
  const handleAccept = useCallback((_nodeKey: string) => {
    // Changes are already in the tree; accept is a visual confirmation only.
  }, []);

  // ── Edit slot inline: gold layer edit ──
  const handleEditSlot = useCallback(
    (nodeKey: string, slotKey: string, newValue: string) => {
      void applyEdit({ set: { path: `${nodeKey}/${slotKey}`, value: newValue } });
    },
    [applyEdit]
  );

  // ── Delete slot inline: gold layer edit ──
  const handleDeleteSlot = useCallback(
    (nodeKey: string, slotKey: string) => {
      void applyEdit({ unset: { path: `${nodeKey}/${slotKey}` } });
    },
    [applyEdit]
  );

  const getDefaultCommitName = useCallback(() => {
    if (!trees || trees.length === 0) return 'Knowledge Extract';
    const rootKeys = trees
      .slice(0, 3)
      .map((t) => t.key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
    return rootKeys.join(' & ');
  }, [trees]);

  // ── Commit: persist current tree ──
  const handleCommit = useCallback(async (message: string) => {
    try {
      useWorkspaceStore.getState().setMode('committing');
      await useCommitStore.getState().commitNodes(message || 'Knowledge Extract');
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
  }, []);

  return (
    <div data-testid="after-panel" className="flex flex-col h-full relative">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--stroke-default)] bg-[var(--panel-alt)] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Result
          </span>
          {showBeforeToggle && onToggleBefore && (
            <button
              type="button"
              onClick={onToggleBefore}
              className={`text-[9px] font-medium px-1.5 py-0.5 rounded transition-colors ${
                beforeVisible
                  ? 'bg-[var(--source)]/10 text-[var(--source)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'
              }`}
            >
              {beforeVisible ? 'Hide Previous' : 'Show Previous'}
            </button>
          )}
        </div>
        {/* TODO(commit5-diff-display): diff summary badges — needs base snapshot strategy */}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto py-1">
        {trees.length === 0 ? (
          // Empty state — no tree yet
          <div className="flex flex-col items-center justify-center h-full gap-2 py-8 opacity-40">
            <Play className="h-5 w-5 text-[var(--text-tertiary)]" />
            <span className="text-[10px] text-[var(--text-tertiary)] italic">
              No knowledge extracted yet
            </span>
          </div>
        ) : (
          // TODO(commit5-diff-display): diff badges hidden — no base snapshot in new arch
          trees.map((node) => (
            <NodeRow
              key={node.key}
              node={node}
              path={node.key}
              depth={0}
              diffType={null}
              addedSlots={[]}
              removedSlots={[]}
              modifiedSlots={[]}
              onDismiss={() => handleDismiss(node.key)}
              onAccept={() => handleAccept(node.key)}
              onEditSlot={(slotKey, newValue) => handleEditSlot(node.key, slotKey, newValue)}
              onDeleteSlot={(slotKey) => handleDeleteSlot(node.key, slotKey)}
            />
          ))
        )}
      </div>

      {/* Commit footer — always visible, disabled when no result */}
      <div className="flex shrink-0 items-center justify-between border-t border-[var(--stroke-default)] bg-[var(--panel-alt)] px-3 py-1.5">
        <span className="text-[9px] text-[var(--text-tertiary)]">
{' '}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setCommitMessage(getDefaultCommitName());
              setShowCommitDialog(true);
            }}
            disabled={!hasResult || isCommitting}
            className="flex items-center gap-1 rounded bg-[var(--commit)] px-2.5 py-1 text-[10px] font-semibold text-[var(--commit-text)] hover:bg-[var(--commit-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {isCommitting ? 'Committing...' : '\u2192 Commit'}
          </button>
        </div>
      </div>
      {showCommitDialog && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 backdrop-blur-sm rounded-b-lg">
          <div className="bg-[var(--panel)] border border-[var(--stroke-default)] rounded-xl p-4 mx-3 w-full max-w-[280px] shadow-lg">
            <label className="block text-[10px] font-semibold text-[var(--text-secondary)] mb-1.5">
              Name this commit
            </label>
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isCommitting) handleCommit(commitMessage);
                if (e.key === 'Escape') setShowCommitDialog(false);
              }}
              className="w-full rounded-lg border border-[var(--stroke-default)] bg-[var(--surface-elevated)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--commit)] transition-colors"
              placeholder="e.g. Budget & Attractions"
              // biome-ignore lint/a11y/noAutofocus: intentional — user just opened commit dialog
              autoFocus
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
