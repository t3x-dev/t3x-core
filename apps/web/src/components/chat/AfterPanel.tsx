'use client';

import type { TreeNode, YOp } from '@t3x-dev/core';
import { Check, Play, X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { computeTreeDiff } from '@/lib/treeDiff';
import { useCommitStore } from '@/store/commitStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

// ── Constants ──

const MONO = { fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 11 } as const;

// ── Helpers ──

/** Extract the node-level key from an op's path (before first slash). */
function opNodeKey(op: YOp): string | null {
  if ('set' in op) return op.set.path.split('/')[0] ?? null;
  if ('unset' in op) return op.unset.path.split('/')[0] ?? null;
  if ('drop' in op) return op.drop.path.split('/')[0] ?? null;
  if ('define' in op) return op.define.path.split('/')[0] ?? null;
  if ('populate' in op) return op.populate.path.split('/')[0] ?? null;
  if ('rename' in op) return op.rename.path.split('/')[0] ?? null;
  return null;
}

// ── SlotRow ──

interface SlotRowProps {
  nodeKey: string;
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
  slotKey,
  value,
  diffType,
  oldValue,
  sourceTag,
  onDelete,
  onEdit,
}: SlotRowProps) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDoubleClick = useCallback(() => {
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleSave = useCallback(() => {
    const newValue = inputRef.current?.value.trim() ?? '';
    if (newValue && newValue !== value) {
      onEdit(newValue);
    }
    setEditing(false);
  }, [value, onEdit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') handleSave();
      if (e.key === 'Escape') setEditing(false);
    },
    [handleSave]
  );

  // Gutter color
  const gutterColor =
    diffType === 'added'
      ? 'bg-[var(--status-success)]'
      : diffType === 'modified'
        ? 'bg-[var(--status-warning)]'
        : diffType === 'removed'
          ? 'bg-[var(--status-error)]'
          : 'bg-transparent';

  // Editing state
  if (editing) {
    return (
      <div className="flex items-stretch" style={{ minHeight: 24 }}>
        <div className={`shrink-0 w-[3px] ${gutterColor}`} />
        <div
          className="flex-1 min-w-0 flex items-center gap-1 px-2 py-0.5 bg-[var(--status-warning)]/[0.06]"
          style={MONO}
        >
          <span className="shrink-0 text-[var(--text-secondary)]">{slotKey}: </span>
          <input
            ref={inputRef}
            defaultValue={value}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            className="flex-1 min-w-0 bg-transparent border-0 border-b-[1.5px] border-b-[var(--status-warning)] outline-none text-[var(--text-primary)]"
            style={{ fontFamily: 'inherit', fontSize: 'inherit' }}
          />
          <span className="shrink-0 text-[8px] text-[var(--text-tertiary)] whitespace-nowrap">
            Enter ↵ · Esc ✕
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-stretch" style={{ minHeight: 24 }}>
      <div className={`shrink-0 w-[3px] ${gutterColor}`} />
      <div
        className="flex-1 min-w-0 flex items-center gap-1 px-2 py-0.5 cursor-text hover:bg-[var(--hover-bg)] transition-colors"
        style={MONO}
        onDoubleClick={handleDoubleClick}
      >
        <span className="shrink-0 text-[var(--text-secondary)]">{slotKey}: </span>
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
                  : 'text-[var(--text-primary)] truncate'
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
        <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            title="Accept slot"
            onClick={(e) => {
              e.stopPropagation();
            }}
            className="text-[var(--text-tertiary)] hover:text-[var(--status-success)] cursor-pointer"
          >
            <Check className="h-2.5 w-2.5" />
          </button>
          <button
            type="button"
            title="Delete slot"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-[var(--text-tertiary)] hover:text-[var(--status-error)] cursor-pointer"
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
  const isSelected = selectedNodePath === node.key;
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
          onClick={() => (isSelected ? clearSelection() : select('after', { nodePath: node.key }))}
          style={{ ...MONO, paddingLeft: `${8 + depth * 14}px` }}
        >
          <span className="w-3 h-3 rounded flex items-center justify-center text-[7px] font-bold bg-[var(--source-dim)] text-[var(--source)] shrink-0">
            ◆
          </span>
          <span
            className={
              diffType === 'added'
                ? 'text-[var(--status-success)] font-semibold'
                : diffType === 'removed'
                  ? 'text-[var(--status-error)]/60 line-through font-semibold'
                  : 'text-[var(--text-primary)] font-semibold'
            }
          >
            {node.key}:
          </span>
          {diffType === 'added' && (
            <span className="text-[8px] text-[var(--status-success)] bg-[var(--status-success)]/15 px-1 py-0.5 rounded ml-1">
              new
            </span>
          )}
          {node.source && (
            <span
              className="text-[7px] font-bold px-1 py-px rounded-sm bg-[var(--source-dim)] text-[var(--source)] cursor-pointer hover:bg-[var(--source)]/20 shrink-0 ml-1 tracking-wide"
              onClick={(e) => {
                e.stopPropagation();
                select('after', { nodePath: node.key });
              }}
            >
              {node.source}
            </span>
          )}
          {hasChanges && diffType !== 'removed' && (
            <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                title="Keep changes"
                onClick={(e) => {
                  e.stopPropagation();
                  onAccept();
                }}
                className="text-[var(--text-tertiary)] hover:text-[var(--status-success)] cursor-pointer"
              >
                <Check className="h-2.5 w-2.5" />
              </button>
              <button
                type="button"
                title="Dismiss changes"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss();
                }}
                className="text-[var(--text-tertiary)] hover:text-[var(--status-error)] cursor-pointer"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          )}
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
          <div key={key} style={{ paddingLeft: `${depth * 14}px` }}>
            <SlotRow
              nodeKey={node.key}
              slotKey={key}
              value={String(val)}
              diffType={slotDiff}
              oldValue={mod?.oldValue}
              sourceTag={node.source}
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
          <div key={`removed-${key}`} style={{ paddingLeft: `${depth * 14}px` }}>
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
        <AfterNodeRecursive key={child.key} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

// ── AfterNodeRecursive — re-uses diff from parent context ──

interface AfterNodeRecursiveProps {
  node: TreeNode;
  depth: number;
}

function AfterNodeRecursive({ node, depth }: AfterNodeRecursiveProps) {
  // Children don't need full diff context — just render slots plainly
  const slots = node.slots || {};
  const slotEntries = Object.entries(slots).filter(([k]) => !k.startsWith('_'));

  return (
    <>
      <div className="group flex items-stretch" style={{ minHeight: 26 }}>
        <div className="shrink-0 w-[3px] bg-transparent" />
        <div
          className="flex-1 flex items-center gap-1 py-0.5 hover:bg-[var(--hover-bg)] transition-colors"
          style={{ ...MONO, paddingLeft: `${8 + depth * 14}px` }}
        >
          <span className="w-3 h-3 rounded flex items-center justify-center text-[7px] font-bold bg-[var(--source-dim)] text-[var(--source)] shrink-0">
            ◆
          </span>
          <span className="text-[var(--text-primary)] font-semibold">{node.key}:</span>
        </div>
      </div>
      {slotEntries.map(([key, val]) => (
        <div key={key} style={{ paddingLeft: `${depth * 14}px` }}>
          <div className="flex items-stretch" style={{ minHeight: 24 }}>
            <div className="shrink-0 w-[3px] bg-transparent" />
            <div className="flex-1 min-w-0 flex items-center gap-1 px-2 py-0.5" style={MONO}>
              <span className="shrink-0 text-[var(--text-secondary)]">{key}: </span>
              <span className="text-[var(--text-primary)] truncate">{String(val)}</span>
            </div>
          </div>
        </div>
      ))}
      {node.children?.map((child: TreeNode) => (
        <AfterNodeRecursive key={child.key} node={child} depth={depth + 1} />
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
  const base = useWorkspaceStore((s) => s.base);
  const result = useWorkspaceStore((s) => s.result);
  const scriptOps = useWorkspaceStore((s) => s.scriptOps);
  const disabledOpIndices = useWorkspaceStore((s) => s.disabledOpIndices);
  const toggleOp = useWorkspaceStore((s) => s.toggleOp);
  const appendOp = useWorkspaceStore((s) => s.appendOp);
  const execute = useWorkspaceStore((s) => s.execute);

  const isCommitting = useCommitStore((s) => s.isCommitting);

  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');

  const trees = result?.trees as TreeNode[] | undefined;
  const hasResult = !!(result && trees && trees.length > 0);

  const diff = useMemo(() => {
    if (!result || !trees) return null;
    return computeTreeDiff(base.trees as TreeNode[], trees);
  }, [base.trees, result, trees]);

  // ── Dismiss a node: disable all ops that target that node key ──
  const handleDismiss = useCallback(
    (nodeKey: string) => {
      scriptOps.forEach((op, i) => {
        if (disabledOpIndices.has(i)) return;
        const key = opNodeKey(op);
        if (key === nodeKey) {
          toggleOp(i);
        }
      });
      execute();
    },
    [scriptOps, disabledOpIndices, toggleOp, execute]
  );

  // ── Accept: no-op for now (changes are already applied) ──
  const handleAccept = useCallback((_nodeKey: string) => {
    // Changes are already in the result; accept is a visual confirmation only.
  }, []);

  // ── Edit slot inline: generate a set YOp ──
  const handleEditSlot = useCallback(
    (nodeKey: string, slotKey: string, newValue: string) => {
      const op: YOp = { set: { path: `${nodeKey}/${slotKey}`, value: newValue } };
      appendOp(op);
      execute();
    },
    [appendOp, execute]
  );

  // ── Delete slot inline: generate an unset YOp ──
  const handleDeleteSlot = useCallback(
    (nodeKey: string, slotKey: string) => {
      const op: YOp = { unset: { path: `${nodeKey}/${slotKey}` } };
      appendOp(op);
      execute();
    },
    [appendOp, execute]
  );

  const getDefaultCommitName = useCallback(() => {
    if (!trees || trees.length === 0) return 'Knowledge Extract';
    const rootKeys = trees
      .slice(0, 3)
      .map((t) => t.key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
    return rootKeys.join(' & ');
  }, [trees]);

  // ── Commit: persist current result ──
  const handleCommit = useCallback(async (message: string) => {
    try {
      useWorkspaceStore.getState().setMode('committing');
      await useCommitStore.getState().commitNodes(message || 'Knowledge Extract');
      if (result) {
        useWorkspaceStore.getState().snapshotBase(result, useCommitStore.getState().lastCommitHash);
      }
      useWorkspaceStore.getState().setMode('idle');
      useWorkspaceStore.getState().setScriptText('');
      setShowCommitDialog(false);
      toast.success('Committed successfully');
      try {
        new BroadcastChannel('t3x-commits').postMessage({ type: 'commit.created' });
      } catch {
        // BroadcastChannel not supported
      }
    } catch (err: unknown) {
      useWorkspaceStore.getState().setMode('executed');
      toast.error(`Commit failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [result]);

  // ── Discard: reset workspace ──
  const handleClear = useCallback(() => {
    useWorkspaceStore.getState().setMode('idle');
    useWorkspaceStore.getState().setScriptText('');
  }, []);

  return (
    <div className="flex flex-col h-full relative">
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
        {diff && (
          <div className="flex items-center gap-1">
            {diff.summary.nodesAdded > 0 && (
              <span className="text-[8px] font-semibold px-1 py-0.5 rounded bg-[var(--status-success)]/15 text-[var(--status-success)]">
                +{diff.summary.nodesAdded}n
              </span>
            )}
            {diff.summary.slotsAdded > 0 && (
              <span className="text-[8px] font-semibold px-1 py-0.5 rounded bg-[var(--status-success)]/15 text-[var(--status-success)]">
                +{diff.summary.slotsAdded}s
              </span>
            )}
            {diff.summary.slotsModified > 0 && (
              <span className="text-[8px] font-semibold px-1 py-0.5 rounded bg-[var(--status-warning)]/15 text-[var(--status-warning)]">
                ~{diff.summary.slotsModified}
              </span>
            )}
            {diff.summary.nodesRemoved > 0 && (
              <span className="text-[8px] font-semibold px-1 py-0.5 rounded bg-[var(--status-error)]/15 text-[var(--status-error)]">
                -{diff.summary.nodesRemoved}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto py-1">
        {!result ? (
          // Empty state
          <div className="flex flex-col items-center justify-center h-full gap-2 py-8 opacity-40">
            <Play className="h-5 w-5 text-[var(--text-tertiary)]" />
            <span className="text-[10px] text-[var(--text-tertiary)] italic">
              Click Run to apply
            </span>
          </div>
        ) : trees && trees.length === 0 ? (
          <div className="text-center text-[10px] text-[var(--text-tertiary)] opacity-40 italic py-5">
            No nodes in result
          </div>
        ) : (
          trees?.map((node) => {
            const nodePath = node.key;
            const nodeIsAdded = diff?.added.includes(nodePath) ?? false;
            const nodeIsRemoved = diff?.removed.includes(nodePath) ?? false;
            const addedSlots = diff?.addedSlots[nodePath] ?? [];
            const removedSlots = diff?.removedSlots[nodePath] ?? [];
            const modifiedSlots = diff?.modifiedSlots[nodePath] ?? [];

            return (
              <NodeRow
                key={node.key}
                node={node}
                depth={0}
                diffType={nodeIsAdded ? 'added' : nodeIsRemoved ? 'removed' : null}
                addedSlots={addedSlots}
                removedSlots={removedSlots}
                modifiedSlots={modifiedSlots}
                onDismiss={() => handleDismiss(node.key)}
                onAccept={() => handleAccept(node.key)}
                onEditSlot={(slotKey, newValue) => handleEditSlot(node.key, slotKey, newValue)}
                onDeleteSlot={(slotKey) => handleDeleteSlot(node.key, slotKey)}
              />
            );
          })
        )}
      </div>

      {/* Commit footer — always visible, disabled when no result */}
      <div className="flex shrink-0 items-center justify-between border-t border-[var(--stroke-default)] bg-[var(--panel-alt)] px-3 py-1.5">
        <span className="text-[9px] text-[var(--text-tertiary)]">
          {hasResult && diff ? `${diff.summary.nodesAdded + diff.summary.slotsAdded} changes` : hasResult ? 'Ready' : 'Run to preview'}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleClear}
            disabled={!hasResult}
            className="rounded px-2 py-1 text-[10px] font-medium text-[var(--text-tertiary)] border border-[var(--stroke-default)] hover:bg-[var(--hover-bg)] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Discard
          </button>
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
