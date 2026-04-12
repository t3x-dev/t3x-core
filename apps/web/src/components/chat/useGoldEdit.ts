/**
 * Authorized adapter hook — only file in components/ allowed (alongside
 * useExtraction) to import from @/commands/yops.
 *
 * Wraps gold-edit YOps with optimistic update semantics: applies the op
 * locally via appendOpsAndReplay, then commits to server via commitGoldEdit.
 *
 * On failure, rolls back the optimistic update by reverting to the pre-edit
 * opsLog and re-replaying from there.
 */

import type { YOp } from '@t3x-dev/core';
import { useCallback } from 'react';
import { buildHumanSource, commitGoldEdit } from '@/commands/yops/goldEditBuilder';
import { appendOpsAndReplay } from '@/queries/loadConversation';
import { replay } from '@/queries/replay';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function useGoldEdit() {
  const convId = useWorkspaceStore((s) => s.conversationId);

  const applyEdit = useCallback(
    async (op: YOp) => {
      if (!convId) return;
      // Attach human source before committing
      const sourced = { ...op, source: buildHumanSource() };
      // Snapshot pre-edit state for rollback
      const prevOps = useWorkspaceStore.getState().opsLog;
      try {
        // Optimistic: apply locally first so UI updates instantly
        await appendOpsAndReplay([sourced]);
        // Persist to server
        await commitGoldEdit(convId, op);
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
