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

export const replayYOpsLog = (entries: YOpsLogEntry[]): SemanticContent => replayCoreYOpsLog(entries);
