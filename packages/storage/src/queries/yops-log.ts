/**
 * YOps Log Queries
 *
 * CRUD operations for the yops_log table (Phase 2 — semantic yops tracking).
 */

import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
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

/**
 * Retrieve YOps log entries by their IDs (for commit operations lookup).
 * Returns entries ordered by createdAt ASC.
 */
export async function getYOpsForCommit(db: AnyDB, yopsLogIds: string[]): Promise<YOpsLogRecord[]> {
  if (yopsLogIds.length === 0) return [];
  return db
    .select()
    .from(yopsLog)
    .where(inArray(yopsLog.id, yopsLogIds))
    .orderBy(asc(yopsLog.createdAt));
}

/**
 * Active-draft slice: entries for the conversation whose `superseded_at`
 * is NULL. The workspace's visible draft replays this list on top of
 * the committed baseline (see `replayCommittedBaseline` in the api
 * package). Distinct from `listYOpsLogByConversation`, which returns
 * every entry (used by audit / GET /yops endpoints).
 *
 * See: docs/2026-04-26-extract-suggestion-vs-baseline-rfc.md §6.1
 */
export async function listActiveYOpsLogByConversation(
  db: AnyDB,
  conversationId: string
): Promise<YOpsLogRecord[]> {
  return db
    .select()
    .from(yopsLog)
    .where(and(eq(yopsLog.conversationId, conversationId), isNull(yopsLog.supersededAt)))
    .orderBy(asc(yopsLog.createdAt));
}

/**
 * Mark every active-draft, LLM-sourced entry for the conversation as
 * superseded. Called atomically with the new extract entry's insert
 * so the workspace flips from "old suggestion + new suggestion" to
 * just "new suggestion" in a single transaction.
 *
 * Filters at three layers:
 *
 *   1. `conversation_id = $1` — never touch other conversations.
 *   2. `superseded_at IS NULL` — idempotent: a row already marked
 *      stays at its original timestamp.
 *   3. `excludeIds` — caller passes the set of `yops_log` ids that
 *      are referenced by any project commit. Committed entries are
 *      part of the immutable baseline and must never be marked
 *      superseded, even if their per-op source.type is 'llm'.
 *
 * Then in app code: filter by per-op `source.type === 'llm'`. Manual
 * edits (HumanSource ops) are explicitly preserved — that's the
 * v1 contract from the RFC.
 *
 * Returns the ids that were marked, for caller observability / audit.
 */
export async function supersedeActiveLLMSuggestions(
  db: AnyDB,
  conversationId: string,
  excludeIds: readonly string[]
): Promise<string[]> {
  const active = await db
    .select()
    .from(yopsLog)
    .where(and(eq(yopsLog.conversationId, conversationId), isNull(yopsLog.supersededAt)));

  const exclude = new Set(excludeIds);
  const targets: string[] = [];
  for (const entry of active) {
    if (exclude.has(entry.id)) continue;
    const ops = (entry.yops as Array<{ source?: { type?: string } }> | null) ?? [];
    if (ops.some((op) => op?.source?.type === 'llm')) {
      targets.push(entry.id);
    }
  }

  if (targets.length === 0) return [];

  await db.update(yopsLog).set({ supersededAt: new Date() }).where(inArray(yopsLog.id, targets));

  return targets;
}
