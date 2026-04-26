/**
 * YOps Log Queries
 *
 * CRUD operations for the yops_log table (Phase 2 — semantic yops tracking).
 */

import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
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
 * Mark active-draft, **all-LLM** entries for the conversation as
 * superseded. Called atomically with the new extract entry's insert
 * so the workspace flips from "old suggestion + new suggestion" to
 * just "new suggestion" in a single transaction.
 *
 * Single-statement SQL UPDATE with three filters in the WHERE clause
 * — all evaluated atomically against the snapshot at UPDATE time:
 *
 *   1. `conversation_id = $1` and `superseded_at IS NULL`
 *      — never touch other conversations; idempotent on already-
 *      superseded rows.
 *
 *   2. **Every** op in the row has `source.type === 'llm'`. Mixed
 *      rows (e.g. the drift `keep_both_together` handler that bundles
 *      LLM-extracted ops with a deterministic HumanSource `relate` op
 *      in the same yops_log row) are preserved unchanged. The
 *      load-bearing rule — Extract has no authority to overwrite
 *      HumanSource ops — applies at the row granularity. Implemented
 *      via `NOT jsonb_path_exists(... @.source.type != "llm")`: the
 *      row qualifies only when no op has a non-LLM source.
 *
 *   3. The row is NOT referenced by any commit in the conversation's
 *      project at UPDATE time. Inline NOT EXISTS subquery against
 *      `commits.yops_log_ids` — committed entries are part of the
 *      immutable baseline and never get marked superseded.
 *
 * Concurrency: this query is internally atomic, but it does NOT
 * serialize against concurrent commit creation. A commit caller that
 * snapshotted the active-draft id set just before this UPDATE runs
 * may then write a now-superseded id into `commits.yops_log_ids`.
 * That residual race is closed at the commit boundary itself by
 * `createCommit`, which rejects superseded ids at insert time.
 *
 * Returns the ids that were marked, for caller observability / audit.
 */
export async function supersedeActiveLLMSuggestions(
  db: AnyDB,
  conversationId: string
): Promise<string[]> {
  const result = await db.execute<{ id: string }>(sql`
    UPDATE ${yopsLog}
    SET superseded_at = NOW()
    WHERE ${yopsLog.id} IN (
      SELECT yl.id
      FROM ${yopsLog} yl
      WHERE yl.conversation_id = ${conversationId}
        AND yl.superseded_at IS NULL
        AND jsonb_typeof(yl.yops) = 'array'
        AND NOT jsonb_path_exists(
          yl.yops,
          '$[*] ? (@.source.type != "llm")'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM commits c
          INNER JOIN conversations conv ON conv.project_id = c.project_id
          WHERE conv.conversation_id = ${conversationId}
            AND c.yops_log_ids @> jsonb_build_array(yl.id)
        )
    )
    RETURNING ${yopsLog.id}
  `);

  // Drizzle returns either an array of rows or a `{ rows: [...] }` shape
  // depending on adapter (postgres-js vs node-postgres). Normalize both.
  const rows: Array<{ id: string }> = Array.isArray(result)
    ? (result as Array<{ id: string }>)
    : ((result as { rows?: Array<{ id: string }> }).rows ?? []);
  return rows.map((r) => r.id);
}
