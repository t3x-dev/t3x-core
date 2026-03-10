/**
 * Utility for converting storage DeltaLogRecord to core DeltaLogEntry.
 *
 * Storage uses camelCase (turnHash, createdAt), core uses snake_case (turn_hash, created_at).
 * The `source` and `delta` fields need type assertions since storage stores them as generic JSON.
 */

import type { DeltaLogEntry } from '@t3x-dev/core';

/** Storage DeltaLogRecord shape (subset of fields we need) */
interface DeltaLogRecord {
  id: string;
  source: unknown;
  turnHash: string | null;
  delta: unknown;
  createdAt: Date | string;
}

/**
 * Convert a single storage DeltaLogRecord to a core DeltaLogEntry.
 */
export function toDeltaLogEntry(record: DeltaLogRecord): DeltaLogEntry {
  return {
    id: record.id,
    source: record.source as DeltaLogEntry['source'],
    turn_hash: record.turnHash ?? undefined,
    delta: record.delta as DeltaLogEntry['delta'],
    created_at:
      record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt,
  };
}

/**
 * Convert an array of storage DeltaLogRecords to core DeltaLogEntries.
 */
export function toDeltaLogEntries(records: DeltaLogRecord[]): DeltaLogEntry[] {
  return records.map(toDeltaLogEntry);
}
