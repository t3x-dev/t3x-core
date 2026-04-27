/**
 * L3 read — bridge between L1 persistence and the workspace view.
 *
 * Per v2 §2.3, queries return data; they do not write to store.
 *
 * `fetchConversationSnapshot` loads a conversation's turns + yops log,
 * runs the deterministic replay, and returns the full derived snapshot —
 * including a `partial` field when one of the persisted ops failed to
 * replay. Callers (useChatInit) write the partial tree to the store and
 * render a banner; they do *not* drop the rest of the conversation.
 *
 * `replayAppended` is the optimistic-update helper used by useGoldEdit.
 * It keeps fail-fast semantics: a bad append throws YOpsReplayError so
 * the caller can roll back before persisting.
 */

import type { SemanticContent, Source, SourcedYOp, ValidationTurn } from '@t3x-dev/core';
import { YOpsReplayError } from '@/commands/yops/errors';
import { type ReplayPartial, replay } from '@/domain/replay';
import { loadConversation as loadL1 } from '@/infrastructure/conversationLoader';

export interface WorkspaceTurn {
  turn_hash: string;
  content: string;
}

export interface SnapshotPartial extends ReplayPartial {
  /**
   * yops_log row that contains the failing op. Populated for the initial
   * snapshot path so the banner can offer a one-click "Delete this op"
   * action that maps back to a real persisted row.
   */
  rowId: string;
  /** Index of the failing op within its yops_log row's `yops` array. */
  opIndexInRow: number;
}

export interface ConversationSnapshot {
  turns: WorkspaceTurn[];
  opsLog: SourcedYOp[];
  tree: SemanticContent;
  sourceIndex: Map<string, Source>;
  committedAs: string | null;
  committedAt: string | null;
  partial?: SnapshotPartial;
}

export async function fetchConversationSnapshot(
  projectId: string,
  convId: string
): Promise<ConversationSnapshot> {
  const { turns, opsLog, committedAs, committedAt } = await loadL1(projectId, convId);

  const workspaceTurns: WorkspaceTurn[] = turns.map((t) => ({
    turn_hash: t.turn_hash,
    content: t.content,
  }));

  // Flatten row → ops while keeping a parallel index back to the source row,
  // so the UI can map a failing flat-op-index to the yops_log row to delete.
  const flatOps: SourcedYOp[] = [];
  const flatToRow: Array<{ rowId: string; opIndexInRow: number }> = [];
  for (const entry of opsLog) {
    const ops = (entry.yops as SourcedYOp[] | undefined) ?? [];
    for (let i = 0; i < ops.length; i++) {
      flatOps.push(ops[i]);
      flatToRow.push({ rowId: entry.id, opIndexInRow: i });
    }
  }

  const validationTurns: ValidationTurn[] = workspaceTurns;
  const { tree, sourceIndex, partial } = replay(flatOps, validationTurns);

  const snapshot: ConversationSnapshot = {
    turns: workspaceTurns,
    opsLog: flatOps,
    tree,
    sourceIndex,
    committedAs,
    committedAt,
  };

  if (partial) {
    const origin = flatToRow[partial.opIndex];
    snapshot.partial = {
      ...partial,
      rowId: origin?.rowId ?? '',
      opIndexInRow: origin?.opIndexInRow ?? 0,
    };
  }

  return snapshot;
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
 *
 * Throws `YOpsReplayError` when the appended ops produce a structurally
 * invalid tree — callers (useGoldEdit) rely on this to roll back the
 * optimistic update before persisting.
 */
export function replayAppended(
  prevOps: SourcedYOp[],
  turns: WorkspaceTurn[],
  newOps: SourcedYOp[]
): AppendedReplay | null {
  if (newOps.length === 0) return null;
  const next = [...prevOps, ...newOps];
  const validationTurns: ValidationTurn[] = turns;
  const { tree, sourceIndex, partial } = replay(next, validationTurns);
  if (partial) {
    throw new YOpsReplayError(
      partial.opIndex,
      partial.code,
      `replay failed at op ${partial.opIndex}: ${partial.message}`
    );
  }
  return { tree, sourceIndex, opsLog: next };
}
