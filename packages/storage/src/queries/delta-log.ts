/**
 * Delta Log Queries
 *
 * CRUD operations for the delta_log table (Phase 2 — semantic delta tracking).
 */

import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type DeltaLogInsert, type DeltaLogRecord, deltaLog } from '../schema-frames';

// ============================================================
// Types
// ============================================================

export interface InsertDeltaLogInput {
  conversationId: string;
  projectId: string;
  source: string;
  turnHash?: string;
  delta: unknown;
  /** V2: per-conversation version (caller computes) */
  version?: number;
  /** V2: pipeline state */
  pipelineState?: string;
  /** V2: gate check result */
  gateResultJson?: unknown;
  /** V2: extensible metadata */
  metadata?: unknown;
  /** Topic ID for multi-topic conversations */
  topicId?: string;
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
    version: input.version ?? null,
    pipelineState: input.pipelineState ?? null,
    gateResultJson: input.gateResultJson ?? null,
    metadata: input.metadata ?? null,
    topicId: input.topicId ?? null,
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

/**
 * List delta log entries filtered by conversation AND topic.
 */
export async function listDeltaLogByTopic(
  db: AnyDB,
  conversationId: string,
  topicId: string
): Promise<DeltaLogRecord[]> {
  return db
    .select()
    .from(deltaLog)
    .where(and(eq(deltaLog.conversationId, conversationId), eq(deltaLog.topicId, topicId)))
    .orderBy(asc(deltaLog.createdAt));
}
