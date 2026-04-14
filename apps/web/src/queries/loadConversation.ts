/**
 * L3 read — bridge between L1 persistence and the workspace view.
 *
 * Per v2 §2.3, queries return data; they do not write to store.
 *
 * `fetchConversationSnapshot` loads a conversation's turns + yops log,
 * runs the deterministic replay, and returns the full derived snapshot.
 * `replayAppended` is a pure append-and-replay helper for optimistic-
 * update flows (used by useGoldEdit). Neither function touches any
 * Zustand store — callers (useChatInit, useGoldEdit, useDriftResolver)
 * own the store writes.
 */

import type { SemanticContent, Source, SourcedYOp, ValidationTurn } from '@t3x-dev/core';
import { replay } from '@/domain/replay';
import { loadConversation as loadL1 } from '@/infrastructure/conversationLoader';

export interface WorkspaceTurn {
  turn_hash: string;
  content: string;
}

export interface ConversationSnapshot {
  turns: WorkspaceTurn[];
  opsLog: SourcedYOp[];
  tree: SemanticContent;
  sourceIndex: Map<string, Source>;
}

export async function fetchConversationSnapshot(
  projectId: string,
  convId: string
): Promise<ConversationSnapshot> {
  const { turns, opsLog } = await loadL1(projectId, convId);

  const workspaceTurns: WorkspaceTurn[] = turns.map((t) => ({
    turn_hash: t.turn_hash,
    content: t.content,
  }));
  const flatOps: SourcedYOp[] = opsLog.flatMap((e) => e.yops as SourcedYOp[]);
  const validationTurns: ValidationTurn[] = workspaceTurns;

  const { tree, sourceIndex } = replay(flatOps, validationTurns);

  return { turns: workspaceTurns, opsLog: flatOps, tree, sourceIndex };
}

export interface AppendedReplay {
  tree: SemanticContent;
  sourceIndex: Map<string, Source>;
  opsLog: SourcedYOp[];
}

/**
 * Pure: merge `newOps` onto `prevOps`, replay against the current
 * turns, return the next derived slice. Returns `null` when `newOps`
 * is empty so callers can short-circuit writes.
 */
export function replayAppended(
  prevOps: SourcedYOp[],
  turns: WorkspaceTurn[],
  newOps: SourcedYOp[]
): AppendedReplay | null {
  if (newOps.length === 0) return null;
  const next = [...prevOps, ...newOps];
  const validationTurns: ValidationTurn[] = turns;
  const { tree, sourceIndex } = replay(next, validationTurns);
  return { tree, sourceIndex, opsLog: next };
}
