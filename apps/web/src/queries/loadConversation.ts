/**
 * L3 — bridge between L1 persistence and the store.
 *
 * `hydrateConversation` loads a conversation's turns + yops log and pushes
 * the replayed state into the store. The single entry point for "hydrate
 * this conversation" (called on mount / conversation switch).
 *
 * `appendOpsAndReplay` is the optimistic-update hook called by command
 * handlers (extraction worker / gold edit builder) after a successful
 * commit. It merges ops into the local log and re-replays to update the
 * derived view.
 */

import type { SourcedYOp, ValidationTurn } from '@t3x-dev/core';
import { loadConversation as loadL1 } from '@/infrastructure/conversationLoader';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { replay } from '@/domain/replay';

export async function hydrateConversation(projectId: string, convId: string): Promise<void> {
  const store = useWorkspaceStore.getState();
  store.setConversation(convId);
  store.setError(null);

  const { turns, opsLog } = await loadL1(projectId, convId);

  const workspaceTurns = turns.map((t) => ({
    turn_hash: t.turn_hash,
    content: t.content,
  }));
  const flatOps: SourcedYOp[] = opsLog.flatMap((e) => e.yops as SourcedYOp[]);
  const validationTurns: ValidationTurn[] = workspaceTurns;

  const { tree, sourceIndex } = replay(flatOps, validationTurns);

  store.setTurns(workspaceTurns);
  store.setDerived({ tree, sourceIndex, opsLog: flatOps });
  store.setMode('idle');
}

export async function appendOpsAndReplay(ops: SourcedYOp[]): Promise<void> {
  if (ops.length === 0) return;
  const store = useWorkspaceStore.getState();
  const current = store.opsLog;
  const next = [...current, ...ops];
  const validationTurns: ValidationTurn[] = store.turns.map((t) => ({
    turn_hash: t.turn_hash,
    content: t.content,
  }));
  const { tree, sourceIndex } = replay(next, validationTurns);
  store.setDerived({ tree, sourceIndex, opsLog: next });
}
