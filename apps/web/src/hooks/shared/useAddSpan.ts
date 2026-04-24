'use client';

/**
 * useAddSpan — chat-side Add verb backed by the extraction LLM.
 *
 * The user selects a span in a chat turn and clicks Add. The hook calls
 * the extractor with a synthetic one-turn payload containing just the
 * selected text (the server endpoint already loads the committed
 * yops_log snapshot and runs in `mode='incremental'`, so the LLM sees
 * the existing tree when it decides placement). Returned ops are
 * replayed into the workspace store as draft ops — no yops_log write
 * until the user commits.
 */

import { useCallback, useState } from 'react';
import { addSpanAsYOps } from '@/commands/yops/addSpanCommand';
import { replayAppended } from '@/queries/loadConversation';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useUndoTracker } from './useUndo';

export interface AddSpanTarget {
  turnHash: string;
  text: string;
  start: number;
  end: number;
}

export function useAddSpan() {
  const convId = useWorkspaceStore((s) => s.conversationId);
  const { trackAction } = useUndoTracker();
  const [adding, setAdding] = useState(false);

  const addSpan = useCallback(
    async (target: AddSpanTarget): Promise<number> => {
      if (!convId) throw new Error('No active conversation');

      setAdding(true);
      try {
        const ops = await addSpanAsYOps({
          conversationId: convId,
          turnHash: target.turnHash,
          text: target.text,
          start: target.start,
          end: target.end,
        });

        if (ops.length === 0) return 0;

        // Snapshot BEFORE we mutate the store so undo rolls back this batch.
        const preview = target.text.length > 40 ? `${target.text.slice(0, 40)}…` : target.text;
        trackAction(`Add "${preview}"`);

        const state = useWorkspaceStore.getState();
        const next = replayAppended(state.opsLog, state.turns, ops);
        if (next) {
          state.setDerived(next);
        }
        return ops.length;
      } finally {
        setAdding(false);
      }
    },
    [convId, trackAction]
  );

  return { addSpan, adding, enabled: !!convId };
}
