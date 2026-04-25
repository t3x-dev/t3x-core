/**
 * useGoldEdit — adapter hook for human-authored YOps edits.
 *
 * Wraps gold-edit YOps with optimistic update semantics: applies the op
 * locally via replayAppended, then commits to server via commitGoldEdit.
 *
 * On failure, rolls back the optimistic update by reverting to the pre-edit
 * opsLog and re-replaying from there.
 *
 * Invariant (see goldEditBuilder.ts): the SourcedYOp built for the
 * optimistic replay is the same value passed to the commit. Source is
 * built exactly once per edit; the persist path never re-derives it.
 */

import type { YOp } from '@t3x-dev/core';
import { useCallback } from 'react';
import { commitGoldEdit, sourceGoldEdit } from '@/commands/yops/goldEditBuilder';
import { replay } from '@/domain/replay';
import { replayAppended } from '@/queries/loadConversation';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function useGoldEdit() {
  const convId = useWorkspaceStore((s) => s.conversationId);

  const applyEdit = useCallback(
    async (op: YOp) => {
      if (!convId) return;
      // Build the SourcedYOp once. Same value flows through optimistic
      // replay AND the server commit — no provenance drift between the
      // pre-refresh local state and the post-refresh server hydrate.
      const sourced = sourceGoldEdit(op);
      // Snapshot pre-edit state for rollback
      const pre = useWorkspaceStore.getState();
      const prevOps = pre.opsLog;
      try {
        // Optimistic: apply locally first so UI updates instantly.
        const nextDerived = replayAppended(prevOps, pre.turns, [sourced]);
        if (nextDerived) {
          useWorkspaceStore.getState().setDerived(nextDerived);
        }
        // Persist the same sourced op to the server.
        await commitGoldEdit(convId, sourced);
      } catch (err) {
        // Roll back on persistence failure
        const store = useWorkspaceStore.getState();
        const turns = store.turns;
        const { tree, sourceIndex } = replay(prevOps, turns);
        store.setDerived({ tree, sourceIndex, opsLog: prevOps });
        store.setError(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [convId]
  );

  return { applyEdit, enabled: !!convId };
}
