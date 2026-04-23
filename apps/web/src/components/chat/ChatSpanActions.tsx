'use client';

/**
 * ChatSpanActions — the two-verb popover that appears when the user
 * selects text in a chat turn during the review phase.
 *
 * - **Add**: fires the extraction LLM on the selected span and appends
 *   the returned SourcedYOps to the draft (placement is LLM-decided —
 *   no target/key picker). Uses the incremental-mode server endpoint
 *   so the LLM sees the existing tree snapshot.
 * - **Remove**: only enabled when the selection overlaps existing
 *   mappings; sweeps every path derived from that span via inverse
 *   unset/drop ops.
 *
 * Replaces the older ChatAddForm which asked the user to pick node +
 * slot + value manually. The "lazy user" principle: one click Add,
 * one click Remove, LLM does the structural thinking.
 */

import { Minus, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAddSpan } from '@/hooks/shared/useAddSpan';
import { useSpanActions } from '@/hooks/shared/useSpanActions';
import type { TextSelectionResult } from '@/hooks/shared/useTextSelection';

interface ChatSpanActionsProps {
  selection: TextSelectionResult;
  onDone: () => void;
}

export function ChatSpanActions({ selection, onDone }: ChatSpanActionsProps) {
  const { addSpan, adding, enabled: addEnabled } = useAddSpan();
  const { previewRemoveSpan, removeSpan, enabled: removeEnabled } = useSpanActions();
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

  const canAdd = addEnabled && !adding && selection.text.trim().length > 0;
  const canRemove = removeEnabled && hasOverlap && !removing;

  async function handleAdd() {
    if (!canAdd) return;
    try {
      const n = await addSpan({
        turnHash: selection.turnHash,
        text: selection.text,
        start: selection.startChar,
        end: selection.endChar,
      });
      toast.success(n === 0 ? 'Nothing to add' : `Added ${n} op${n === 1 ? '' : 's'}`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Add failed');
    }
  }

  async function handleRemove() {
    if (!canRemove) return;
    setRemoving(true);
    try {
      const n = await removeSpan({
        turnHash: selection.turnHash,
        start: selection.startChar,
        end: selection.endChar,
      });
      toast.success(`Removed ${n} mapping${n === 1 ? '' : 's'}`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Remove failed');
    } finally {
      setRemoving(false);
    }
  }

  const preview = selection.text.length > 80 ? `${selection.text.slice(0, 80)}…` : selection.text;

  return (
    <div
      data-testid="chat-span-actions"
      className="mx-3 my-2 p-2.5 bg-[var(--surface-panel)] border border-[var(--status-info)]/30 rounded-lg space-y-2"
    >
      <div className="text-[10px] text-[var(--text-tertiary)] font-mono bg-[var(--surface-panel-alt)] rounded px-1.5 py-1 truncate">
        &ldquo;{preview}&rdquo;
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleAdd}
          disabled={!canAdd}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--status-success)] text-white text-[10px] font-semibold disabled:opacity-50"
        >
          <Plus className="w-3 h-3" />
          {adding ? 'Adding…' : 'Add'}
        </button>

        {hasOverlap && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={!canRemove}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[var(--status-error)]/40 text-[var(--status-error)] text-[10px] font-semibold hover:bg-[var(--status-error)]/10 disabled:opacity-50"
            title={`Remove ${overlappingMatches.length} mapping${overlappingMatches.length === 1 ? '' : 's'}`}
          >
            <Minus className="w-3 h-3" />
            {removing ? 'Removing…' : `Remove ${overlappingMatches.length}`}
          </button>
        )}

        <button
          type="button"
          onClick={onDone}
          disabled={adding || removing}
          className="ml-auto px-2 py-1 rounded text-[10px] text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] disabled:opacity-50"
        >
          Cancel
        </button>
      </div>

      <div className="text-[9px] text-[var(--text-tertiary)]">
        Add lets t3x decide where this fits in the tree. Remove undoes whatever this span already
        produced.
      </div>
    </div>
  );
}
