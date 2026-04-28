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
import type { YOpsOpOrigin, YOpsRowMeta } from '@/domain/yops/rowMeta';
import { loadConversation as loadL1 } from '@/infrastructure/conversationLoader';
import { fetchCommitForInheritance } from './chatInitFetch';

export interface WorkspaceTurn {
  turn_hash: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
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
  title: string | null;
  turns: WorkspaceTurn[];
  opsLog: SourcedYOp[];
  rowsById: Record<string, YOpsRowMeta>;
  opOrigins: YOpsOpOrigin[];
  tree: SemanticContent;
  sourceIndex: Map<string, Source>;
  committedAs: string | null;
  committedAt: string | null;
  parentCommitHash: string | null;
  parentCommitBranch: string | null;
  partial?: SnapshotPartial;
}

async function loadParentCommitInfo(parentCommitHash: string | null): Promise<{
  content: SemanticContent;
  branch: string | null;
}> {
  if (!parentCommitHash) return { content: { trees: [], relations: [] }, branch: null };
  const parentCommit = await fetchCommitForInheritance(parentCommitHash);
  return {
    content: parentCommit.content ?? { trees: [], relations: [] },
    branch: parentCommit.branch ?? null,
  };
}

export async function fetchConversationSnapshot(
  projectId: string,
  convId: string
): Promise<ConversationSnapshot> {
  const { title, turns, opsLog, committedAs, committedAt, parentCommitHash } = await loadL1(
    projectId,
    convId
  );

  const workspaceTurns: WorkspaceTurn[] = turns.map((t) => ({
    turn_hash: t.turn_hash,
    role: t.role,
    content: t.content,
  }));

  // Flatten row → ops while keeping a parallel index back to the source row,
  // so the UI can map a failing flat-op-index to the yops_log row to delete.
  const flatOps: SourcedYOp[] = [];
  const rowsById: Record<string, YOpsRowMeta> = {};
  const opOrigins: YOpsOpOrigin[] = [];
  for (const entry of opsLog) {
    const ops = (entry.yops as SourcedYOp[] | undefined) ?? [];
    rowsById[entry.id] = {
      id: entry.id,
      source: entry.source,
      turnHash: entry.turn_hash ?? null,
      createdAt: entry.created_at,
      supersededAt: entry.superseded_at ?? null,
      isCommitted: Boolean(entry.is_committed),
      committedBy: entry.committed_by ?? [],
      opCount: ops.length,
    };
    for (let i = 0; i < ops.length; i++) {
      flatOps.push(ops[i]);
      opOrigins.push({ rowId: entry.id, opIndexInRow: i });
    }
  }

  const validationTurns: ValidationTurn[] = workspaceTurns;
  const parentCommitInfo = await loadParentCommitInfo(parentCommitHash);
  const parentBaseline = parentCommitInfo.content;
  const { tree, sourceIndex, partial } = replay(flatOps, validationTurns, parentBaseline);

  const snapshot: ConversationSnapshot = {
    title,
    turns: workspaceTurns,
    opsLog: flatOps,
    rowsById,
    opOrigins,
    tree,
    sourceIndex,
    committedAs,
    committedAt,
    parentCommitHash,
    parentCommitBranch: parentCommitInfo.branch,
  };

  if (partial) {
    const origin = opOrigins[partial.opIndex];
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
