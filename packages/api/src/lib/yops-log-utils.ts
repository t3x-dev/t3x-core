/**
 * Utility for converting storage YOpsLogRecord to core YOpsLogEntry.
 *
 * Storage uses camelCase (turnHash, createdAt), core uses snake_case (turn_hash, created_at).
 * The `source` and `yops` fields need type assertions since storage stores them as generic JSON.
 */

import {
  replayYOpsLog as replayCoreYOpsLog,
  type SemanticContent,
  type YOpsLogEntry,
} from '@t3x-dev/core';
import {
  type AnyDB,
  findConversationById,
  listCommits,
  listYOpsLogByConversation,
} from '@t3x-dev/storage';

/** Storage YOpsLogRecord shape (subset of fields we need) */
interface YOpsLogRecord {
  id: string;
  source: unknown;
  turnHash: string | null;
  yops: unknown;
  createdAt: Date | string;
  metadata?: unknown;
}

/**
 * Convert a single storage YOpsLogRecord to a core YOpsLogEntry.
 */
export function toYOpsLogEntry(record: YOpsLogRecord): YOpsLogEntry {
  return {
    id: record.id,
    source: record.source as YOpsLogEntry['source'],
    turn_hash: record.turnHash ?? undefined,
    yops: record.yops,
    created_at:
      record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt,
    metadata: (record.metadata as Record<string, unknown>) ?? undefined,
  };
}

/**
 * Convert an array of storage YOpsLogRecords to core YOpsLogEntries.
 */
export function toYOpsLogEntries(records: YOpsLogRecord[]): YOpsLogEntry[] {
  return records.map(toYOpsLogEntry);
}

export const replayYOpsLog = (entries: YOpsLogEntry[]): SemanticContent =>
  replayCoreYOpsLog(entries);

const EMPTY_CONTENT: SemanticContent = { trees: [], relations: [] };

/**
 * Replay only the *committed* yops_log entries for a conversation —
 * i.e. those whose ids appear in some `commits.yops_log_ids` for the
 * conversation's project. Returns the immutable baseline that
 * Extract should compute incrementally against. Active draft entries
 * (uncommitted, regardless of `superseded_at`) are intentionally
 * excluded — see `replayActiveDraftOnBaseline` if you need both.
 *
 * Returns an empty `{ trees: [], relations: [] }` when:
 *   - the conversation doesn't exist,
 *   - the conversation has no committed entries yet (a fresh project).
 */
export async function replayCommittedBaseline(
  db: AnyDB,
  conversationId: string
): Promise<SemanticContent> {
  const conv = await findConversationById(db, conversationId);
  if (!conv) return EMPTY_CONTENT;

  const allEntries = await listYOpsLogByConversation(db, conversationId);
  if (allEntries.length === 0) return EMPTY_CONTENT;

  // The committed-id set is per-project, not per-conversation: a commit
  // never holds yops from another project, but it may hold yops from
  // multiple conversations within the same project. We still filter by
  // conversation_id at the entry level above, so the union of project
  // commit ids is safe to intersect against.
  //
  // `limit: 10_000` matches the `listCommits` pagination ceiling and is
  // far above any realistic per-project commit count today; bump if a
  // project ever exceeds it.
  const projectCommits = await listCommits(db, {
    projectId: conv.projectId,
    limit: 10_000,
  });
  const committedIds = new Set<string>();
  for (const commit of projectCommits) {
    for (const id of commit.yops_log_ids ?? []) committedIds.add(id);
  }

  const committedEntries = allEntries.filter((entry) => committedIds.has(entry.id));
  if (committedEntries.length === 0) return EMPTY_CONTENT;

  return replayCoreYOpsLog(toYOpsLogEntries(committedEntries));
}
