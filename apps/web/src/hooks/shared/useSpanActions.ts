'use client';

/**
 * useSpanActions — Chat-side verbs that operate on a turn text span
 * rather than a single slot.
 *
 * Currently exposes removeSpan (the "sweep" counterpart to the per-slot
 * deleteSlot in useSlotActions): given a (turnHash, start, end) from
 * useTextSelection, look up every path whose LLMSource overlaps the
 * span and commit a batch of inverse YOps (`drop` for nodes, `unset`
 * for slots) through useGoldEdit.
 *
 * Chat-side Add will live here too once the LLM placement command
 * lands in its own PR.
 */

import { useCallback } from 'react';
import { buildSweepOps, findPathsOverlappingSpan } from '@/domain/spanSweep';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useGoldEdit } from './useGoldEdit';

export interface SpanTarget {
  turnHash: string;
  start: number;
  end: number;
}

export function useSpanActions() {
  const { applyEdit, enabled } = useGoldEdit();

  const previewRemoveSpan = useCallback((target: SpanTarget) => {
    const { sourceIndex } = useWorkspaceStore.getState();
    return findPathsOverlappingSpan(sourceIndex, target.turnHash, target.start, target.end);
  }, []);

  const removeSpan = useCallback(
    async (target: SpanTarget) => {
      const { sourceIndex } = useWorkspaceStore.getState();
      const matches = findPathsOverlappingSpan(
        sourceIndex,
        target.turnHash,
        target.start,
        target.end
      );
      const ops = buildSweepOps(matches);
      for (const op of ops) {
        await applyEdit(op);
      }
      return matches.length;
    },
    [applyEdit]
  );

  return { previewRemoveSpan, removeSpan, enabled };
}
