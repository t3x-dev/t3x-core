/**
 * YOps Log Queries
 *
 * CRUD operations for the yops_log table (Phase 2 — semantic yops tracking).
 */

import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type YOpsLogInsert, type YOpsLogRecord, yopsLog } from '../schema-trees';

// ============================================================
// Types
// ============================================================

export interface InsertYOpsLogInput {
  conversationId: string;
  projectId: string;
  source: string;
  turnHash?: string;
  yops: unknown;
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
 * Insert a new yops log entry.
 */
export async function insertYOpsLogEntry(
  db: AnyDB,
  input: InsertYOpsLogInput
): Promise<YOpsLogRecord> {
  const id = `yl_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const row: YOpsLogInsert = {
    id,
    conversationId: input.conversationId,
    projectId: input.projectId,
    source: input.source,
    turnHash: input.turnHash ?? null,
    yops: input.yops,
    version: input.version ?? null,
    pipelineState: input.pipelineState ?? null,
    gateResultJson: input.gateResultJson ?? null,
    metadata: input.metadata ?? null,
    topicId: input.topicId ?? null,
  };

  const [result] = await db.insert(yopsLog).values(row).returning();
  return result;
}

/**
 * Get a single yops log entry by ID.
 */
export async function getYOpsLogEntry(db: AnyDB, id: string): Promise<YOpsLogRecord | undefined> {
  const [result] = await db.select().from(yopsLog).where(eq(yopsLog.id, id));
  return result;
}

/**
 * List all yops log entries for a conversation, ordered by created_at ASC.
 */
export async function listYOpsLogByConversation(
  db: AnyDB,
  conversationId: string
): Promise<YOpsLogRecord[]> {
  return db
    .select()
    .from(yopsLog)
    .where(eq(yopsLog.conversationId, conversationId))
    .orderBy(asc(yopsLog.createdAt));
}

/**
 * Delete a yops log entry by ID (for undo).
 */
export async function deleteYOpsLogEntry(
  db: AnyDB,
  id: string
): Promise<YOpsLogRecord | undefined> {
  const [result] = await db.delete(yopsLog).where(eq(yopsLog.id, id)).returning();
  return result;
}

/**
 * List yops log entries filtered by conversation AND topic.
 */
export async function listYOpsLogByTopic(
  db: AnyDB,
  conversationId: string,
  topicId: string
): Promise<YOpsLogRecord[]> {
  return db
    .select()
    .from(yopsLog)
    .where(and(eq(yopsLog.conversationId, conversationId), eq(yopsLog.topicId, topicId)))
    .orderBy(asc(yopsLog.createdAt));
}
