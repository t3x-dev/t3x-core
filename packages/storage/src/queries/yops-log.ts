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
 * Return commit hashes grouped by yops_log id for the current project.
 *
 * This is the API/WebUI row-facts source of truth: callers should not
 * infer committed state from local UI state. The lookup is intentionally
 * scoped by project_id and by the requested row IDs so large histories do
 * not require scanning unrelated commits.
 */
export async function findCommitHashesByYOpsLogIds(
  db: AnyDB,
  projectId: string,
  yopsLogIds: string[]
): Promise<Map<string, string[]>> {
  const committedBy = new Map<string, string[]>();
  if (yopsLogIds.length === 0) return committedBy;

  const idList = sql.join(
    yopsLogIds.map((id) => sql`${id}`),
    sql`, `
  );
  const containsAnyId = sql.join(
    yopsLogIds.map((id) => sql`c.yops_log_ids @> jsonb_build_array(${id}::text)`),
    sql` OR `
  );
  const result = await db.execute<{ yops_log_id: string; commit_hash: string }>(sql`
    SELECT DISTINCT refs.yops_log_id, c.hash AS commit_hash, c.committed_at
    FROM commits c
    CROSS JOIN LATERAL jsonb_array_elements_text(
      COALESCE(c.yops_log_ids, '[]'::jsonb)
    ) AS refs(yops_log_id)
    WHERE c.project_id = ${projectId}
      AND (${containsAnyId})
      AND refs.yops_log_id IN (${idList})
    ORDER BY c.committed_at ASC, c.hash ASC
  `);

  const rows: Array<{ yops_log_id: string; commit_hash: string }> = Array.isArray(result)
    ? (result as Array<{ yops_log_id: string; commit_hash: string }>)
    : ((result as { rows?: Array<{ yops_log_id: string; commit_hash: string }> }).rows ?? []);
  for (const row of rows) {
    const existing = committedBy.get(row.yops_log_id);
    if (existing) {
      existing.push(row.commit_hash);
    } else {
      committedBy.set(row.yops_log_id, [row.commit_hash]);
    }
  }

  return committedBy;
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
 * Advisory-lock key namespace for the suggestion-vs-baseline serial
 * section. Both `supersedeActiveLLMSuggestions` and `createCommit`
 * acquire `pg_advisory_xact_lock(SUPERSEDE_LOCK_NAMESPACE, projectKey)`
 * under their respective transactions. The namespace tag ensures the
 * key space doesn't collide with any other advisory-lock user.
 */
const SUPERSEDE_LOCK_NAMESPACE = 0x7373_7362; // 'ssvb' (suggestion-vs-baseline)

/**
 * Acquire the per-project transaction-scoped advisory lock that
 * serialises supersede + commit-with-yops-log-ids on the same
 * project. Auto-released when the surrounding transaction ends.
 *
 * Used by `supersedeActiveLLMSuggestions` and `createCommit`. Must
 * be called inside a transaction; outside a transaction the lock
 * is a no-op (held only for the single statement) and the
 * serialisation guarantee is lost.
 *
 * The reason this is the *correct* fix and not a row-level FOR SHARE:
 * under PostgreSQL READ COMMITTED, a waiting UPDATE's WHERE
 * predicate is re-evaluated only for the row being locked, not for
 * subqueries over other tables (per PG docs: "an updating command
 * ... does not see effects of those commands on other rows in the
 * database"). So an UPDATE that hits a `FOR SHARE`-locked yops_log
 * row would, after waking, fail to see the newly-inserted commits
 * row in its `NOT EXISTS (... commits ...)` subquery and would still
 * mark the row superseded. Advisory lock takes that ambiguity off
 * the table by serialising the entire critical section.
 */
export async function acquireProjectSupersedeLock(db: AnyDB, projectId: string): Promise<void> {
  // Hash the projectId to a stable int4 key; (namespace, key) gives
  // us the bigint advisory-lock space pg_advisory_xact_lock expects.
  await db.execute(
    sql`SELECT pg_advisory_xact_lock(${SUPERSEDE_LOCK_NAMESPACE}::int, hashtext(${projectId})::int)`
  );
}

// Drizzle's tx vs db types vary by adapter; the runtime contract
// (transaction(fn)) is uniform and callers narrow tx to AnyDB.
type TxRunner = { transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown> };

/**
 * Mark active-draft, **all-LLM** entries for the conversation as
 * superseded. Called atomically with the new extract entry's insert
 * so the workspace flips from "old suggestion + new suggestion" to
 * just "new suggestion" in a single transaction.
 *
 * The function **always wraps its work in a database transaction**
 * (or, when the caller already passes a `tx`, opens a savepoint).
 * The wrap is what makes `pg_advisory_xact_lock` meaningful:
 * `_xact_` advisory locks live for the surrounding transaction, so
 * if this ran outside a tx the lock would be released after the
 * SELECT statement that acquired it and the subsequent UPDATE would
 * race. Enforcing the wrap here makes the advisory-lock contract a
 * property of the function, not a discipline the caller has to
 * remember.
 *
 * When called from inside an existing transaction (the
 * `yopsApplyOp` case: supersede + insert + tree sync share one tx),
 * Drizzle creates a savepoint here. The advisory lock acquired
 * during the savepoint is bound to the *enclosing* top-level tx
 * per PostgreSQL semantics, so it stays held across the subsequent
 * insert + tree sync — the atomicity guarantee the caller wants is
 * preserved.
 *
 * Sequence inside the wrapping tx:
 *
 *   1. Look up project_id from conversations (immutable mapping).
 *   2. `pg_advisory_xact_lock(SUPERSEDE_LOCK_NAMESPACE, hashtext(projectId))`
 *      blocks any concurrent createCommit on the same project.
 *   3. Single SQL UPDATE filters by:
 *      - `conversation_id` and `superseded_at IS NULL` (idempotent)
 *      - **Every** op has `source.type === 'llm'` (mixed rows with a
 *        HumanSource op are preserved — Extract has no authority to
 *        overwrite manual edits).
 *      - Row is NOT referenced by any commit in the project (NOT
 *        EXISTS against `commits.yops_log_ids`). Combined with the
 *        advisory lock, the subquery sees a stable view of `commits`
 *        for the duration of the critical section.
 *
 * Returns the ids that were marked.
 */
export async function supersedeActiveLLMSuggestions(
  db: AnyDB,
  conversationId: string
): Promise<string[]> {
  return (await (db as unknown as TxRunner).transaction(async (tx) => {
    // Look up project_id (immutable mapping). Reading inside the tx
    // (vs. before opening it) keeps the function self-contained.
    const projectRow = await (tx as AnyDB).execute<{ project_id: string }>(
      sql`SELECT project_id FROM conversations WHERE conversation_id = ${conversationId}`
    );
    const projectRows: Array<{ project_id: string }> = Array.isArray(projectRow)
      ? (projectRow as Array<{ project_id: string }>)
      : ((projectRow as { rows?: Array<{ project_id: string }> }).rows ?? []);
    const projectId = projectRows[0]?.project_id;
    if (!projectId) return []; // conversation doesn't exist; nothing to supersede

    await acquireProjectSupersedeLock(tx as AnyDB, projectId);

    const result = await (tx as AnyDB).execute<{ id: string }>(sql`
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

    const rows: Array<{ id: string }> = Array.isArray(result)
      ? (result as Array<{ id: string }>)
      : ((result as { rows?: Array<{ id: string }> }).rows ?? []);
    return rows.map((r) => r.id);
  })) as string[];
}

/**
 * Mark every active, uncommitted yops_log row for a conversation as
 * superseded. This is the Script editor's full-replacement path: when the
 * user edits the already-applied active script mirror, Apply must replace
 * that active script instead of appending the whole script on top of itself.
 *
 * Unlike `supersedeActiveLLMSuggestions`, this intentionally supersedes
 * manual and mixed rows too because the user is editing the full active
 * script as the new source of truth. Committed rows are immutable and are
 * excluded by the same commits.yops_log_ids guard used elsewhere.
 */
export async function supersedeActiveUncommittedYOpsLogEntries(
  db: AnyDB,
  conversationId: string
): Promise<string[]> {
  return (await (db as unknown as TxRunner).transaction(async (tx) => {
    const projectRow = await (tx as AnyDB).execute<{ project_id: string }>(
      sql`SELECT project_id FROM conversations WHERE conversation_id = ${conversationId}`
    );
    const projectRows: Array<{ project_id: string }> = Array.isArray(projectRow)
      ? (projectRow as Array<{ project_id: string }>)
      : ((projectRow as { rows?: Array<{ project_id: string }> }).rows ?? []);
    const projectId = projectRows[0]?.project_id;
    if (!projectId) return [];

    await acquireProjectSupersedeLock(tx as AnyDB, projectId);

    const result = await (tx as AnyDB).execute<{ id: string }>(sql`
      UPDATE ${yopsLog}
      SET superseded_at = NOW()
      WHERE conversation_id = ${conversationId}
        AND superseded_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM commits c
          WHERE c.project_id = ${projectId}
            AND c.yops_log_ids @> jsonb_build_array(${yopsLog.id})
        )
      RETURNING ${yopsLog.id}
    `);

    const rows: Array<{ id: string }> = Array.isArray(result)
      ? (result as Array<{ id: string }>)
      : ((result as { rows?: Array<{ id: string }> }).rows ?? []);
    return rows.map((r) => r.id);
  })) as string[];
}

/**
 * Explicit repair path for a replay-failing yops_log row.
 *
 * Unlike `supersedeActiveLLMSuggestions`, this is allowed to supersede
 * manual/mixed rows: the user is editing the Script editor specifically to
 * repair a replay-failing row. Because the editor shows the active script as
 * one source-of-truth YAML document, the repair replaces every active,
 * uncommitted row for the conversation after proving the selected failing row
 * itself is repairable. Committed rows remain immutable and are excluded by
 * the same commits.yops_log_ids guard used by the LLM-suggestion replacement
 * path.
 */
export async function supersedeYOpsLogEntryForRepair(
  db: AnyDB,
  conversationId: string,
  yopsLogId: string
): Promise<string[]> {
  return (await (db as unknown as TxRunner).transaction(async (tx) => {
    const projectRow = await (tx as AnyDB).execute<{ project_id: string }>(sql`
      SELECT project_id
      FROM ${yopsLog}
      WHERE id = ${yopsLogId}
        AND conversation_id = ${conversationId}
      LIMIT 1
    `);
    const projectRows: Array<{ project_id: string }> = Array.isArray(projectRow)
      ? (projectRow as Array<{ project_id: string }>)
      : ((projectRow as { rows?: Array<{ project_id: string }> }).rows ?? []);
    const projectId = projectRows[0]?.project_id;
    if (!projectId) return [];

    await acquireProjectSupersedeLock(tx as AnyDB, projectId);

    const result = await (tx as AnyDB).execute<{ id: string }>(sql`
      UPDATE ${yopsLog}
      SET superseded_at = NOW()
      WHERE conversation_id = ${conversationId}
        AND superseded_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM ${yopsLog} target
          WHERE target.id = ${yopsLogId}
            AND target.conversation_id = ${conversationId}
            AND target.superseded_at IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM commits c
              WHERE c.project_id = ${projectId}
                AND c.yops_log_ids @> jsonb_build_array(target.id)
            )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM commits c
          WHERE c.project_id = ${projectId}
            AND c.yops_log_ids @> jsonb_build_array(${yopsLog.id})
        )
      RETURNING ${yopsLog.id}
    `);

    const rows: Array<{ id: string }> = Array.isArray(result)
      ? (result as Array<{ id: string }>)
      : ((result as { rows?: Array<{ id: string }> }).rows ?? []);
    return rows.map((r) => r.id);
  })) as string[];
}
