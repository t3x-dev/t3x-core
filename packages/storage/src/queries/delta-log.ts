/**
 * Delta Log Queries
 *
 * CRUD operations for the delta_log table (Phase 2 — semantic delta tracking).
 */

import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type DeltaLogInsert, type DeltaLogRecord, deltaLog } from '../schema-v4';

// ============================================================
// Types
// ============================================================

export interface InsertDeltaLogInput {
  conversationId: string;
  projectId: string;
  source: string;
  turnHash?: string;
  delta: unknown;
}

// ============================================================
// Queries
// ============================================================

/**
 * Insert a new delta log entry.
 */
export async function insertDeltaLogEntry(
  db: AnyDB,
  input: InsertDeltaLogInput
): Promise<DeltaLogRecord> {
  const id = `dl_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const row: DeltaLogInsert = {
    id,
    conversationId: input.conversationId,
    projectId: input.projectId,
    source: input.source,
    turnHash: input.turnHash ?? null,
    delta: input.delta,
  };

  const [result] = await db.insert(deltaLog).values(row).returning();
  return result;
}

/**
 * Get a single delta log entry by ID.
 */
export async function getDeltaLogEntry(db: AnyDB, id: string): Promise<DeltaLogRecord | undefined> {
  const [result] = await db.select().from(deltaLog).where(eq(deltaLog.id, id));
  return result;
}

/**
 * List all delta log entries for a conversation, ordered by created_at ASC.
 */
export async function listDeltaLogByConversation(
  db: AnyDB,
  conversationId: string
): Promise<DeltaLogRecord[]> {
  return db
    .select()
    .from(deltaLog)
    .where(eq(deltaLog.conversationId, conversationId))
    .orderBy(asc(deltaLog.createdAt));
}

/**
 * Delete a delta log entry by ID (for undo).
 */
export async function deleteDeltaLogEntry(
  db: AnyDB,
  id: string
): Promise<DeltaLogRecord | undefined> {
  const [result] = await db.delete(deltaLog).where(eq(deltaLog.id, id)).returning();
  return result;
}
