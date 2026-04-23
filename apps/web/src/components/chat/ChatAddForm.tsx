'use client';

/**
 * ChatAddForm — add selected chat text as a gold-layer slot on an existing node.
 *
 * Writes flow through useGoldEdit → commitGoldEdit → yopsService.commitOps,
 * giving every submitted op a HumanSource (author + timestamp) per the
 * architecture doc §3.3.
 */

import type { YOp } from '@t3x-dev/core';
import { Minus, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useGoldEdit } from '@/hooks/shared/useGoldEdit';
import { useSpanActions } from '@/hooks/shared/useSpanActions';
import type { TextSelectionResult } from '@/hooks/shared/useTextSelection';
import { useWorkspaceStore } from '@/store/workspaceStore';

interface ChatAddFormProps {
  selection: TextSelectionResult;
  onDone: () => void;
}

export function ChatAddForm({ selection, onDone }: ChatAddFormProps) {
  const draft = useWorkspaceStore((s) => s.tree);
  const { applyEdit, enabled } = useGoldEdit();
  const { previewRemoveSpan, removeSpan } = useSpanActions();

  const nodeOptions = useMemo(() => draft.trees.map((t) => t.key), [draft.trees]);

  const [targetNode, setTargetNode] = useState(nodeOptions[0] ?? '');
  const [slotKey, setSlotKey] = useState('');
  const [slotValue, setSlotValue] = useState(selection.text.slice(0, 80));
  const [submitting, setSubmitting] = useState(false);
  const [removing, setRemoving] = useState(false);

  const overlappingMatches = useMemo(
    () =>
      previewRemoveSpan({
        turnHash: selection.turnHash,
        start: selection.startChar,
        end: selection.endChar,
      }),
    [previewRemoveSpan, selection.turnHash, selection.startChar, selection.endChar]
  );
  const hasOverlap = overlappingMatches.length > 0;

  const canSubmit = !!targetNode && !!slotKey && enabled && !submitting;
  const canRemove = enabled && hasOverlap && !removing;

  async function handleAdd() {
    if (!canSubmit) return;
    const op: YOp = {
      set: { path: `${targetNode}/${slotKey}`, value: slotValue },
    };
    setSubmitting(true);
    try {
      await applyEdit(op);
      onDone();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Add failed';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove() {
    if (!canRemove) return;
    setRemoving(true);
    try {
      const removed = await removeSpan({
        turnHash: selection.turnHash,
        start: selection.startChar,
        end: selection.endChar,
      });
      toast.success(`Removed ${removed} mapping${removed === 1 ? '' : 's'}`);
      onDone();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Remove failed';
      toast.error(msg);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="mx-3 my-2 p-2.5 bg-[var(--surface-panel)] border border-[var(--status-info)]/30 rounded-lg">
      {/* Remove sweep — appears only when selection overlaps existing mappings */}
      {hasOverlap && (
        <div className="mb-2 pb-2 border-b border-[var(--stroke-default)]/40">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] text-[var(--text-tertiary)]">
              This span maps to{' '}
              <span className="font-semibold text-[var(--text-primary)]">
                {overlappingMatches.length}
              </span>{' '}
              slot{overlappingMatches.length === 1 ? '' : 's'} in the tree.
            </div>
            <button
              type="button"
              onClick={handleRemove}
              disabled={!canRemove}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[var(--status-error)]/40 text-[var(--status-error)] text-[10px] font-semibold hover:bg-[var(--status-error)]/10 disabled:opacity-50"
            >
              <Minus className="w-3 h-3" />
              {removing ? 'Removing…' : 'Remove'}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-1 text-[10px] font-semibold text-[var(--status-info)] mb-1.5">
        <Plus className="w-3 h-3" />
        Add to extraction
      </div>

      {/* Selected text preview */}
      <div className="text-[10px] text-[var(--text-tertiary)] mb-1.5 p-1 px-1.5 bg-[var(--surface-panel-alt)] rounded font-mono truncate">
        &quot;{selection.text.slice(0, 60)}
        {selection.text.length > 60 ? '...' : ''}&quot;
      </div>

      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[9px] text-[var(--text-tertiary)] w-10 text-right">Node:</span>
        <select
          value={targetNode}
          onChange={(e) => setTargetNode(e.target.value)}
          disabled={submitting}
          className="flex-1 px-2 py-1 border border-[var(--stroke-default)] rounded bg-[var(--surface-panel-alt)] text-[10px] font-mono text-[var(--text-primary)] outline-none focus:border-[var(--status-info)] disabled:opacity-50"
        >
          {nodeOptions.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[9px] text-[var(--text-tertiary)] w-10 text-right">Key:</span>
        <input
          value={slotKey}
          onChange={(e) => setSlotKey(e.target.value)}
          placeholder="slot_key"
          disabled={submitting}
          className="flex-1 px-2 py-1 border border-[var(--stroke-default)] rounded bg-[var(--surface-panel-alt)] text-[10px] font-mono text-[var(--text-primary)] outline-none focus:border-[var(--status-info)] disabled:opacity-50"
        />
      </div>

      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[9px] text-[var(--text-tertiary)] w-10 text-right">Value:</span>
        <input
          value={slotValue}
          onChange={(e) => setSlotValue(e.target.value)}
          disabled={submitting}
          className="flex-1 px-2 py-1 border border-[var(--stroke-default)] rounded bg-[var(--surface-panel-alt)] text-[10px] font-mono text-[var(--text-primary)] outline-none focus:border-[var(--status-info)] disabled:opacity-50"
        />
      </div>

      <div className="flex justify-end gap-1">
        <button
          type="button"
          onClick={onDone}
          disabled={submitting}
          className="px-2.5 py-1 rounded border border-[var(--stroke-default)] text-[9px] font-semibold text-[var(--text-tertiary)] disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleAdd}
          disabled={!canSubmit}
          className="px-2.5 py-1 rounded bg-[var(--status-info)] text-white text-[9px] font-semibold disabled:opacity-50"
        >
          {submitting ? 'Adding...' : 'Add'}
        </button>
      </div>
    </div>
  );
}
