/**
 * Draft Queries (Workbench)
 *
 * CRUD operations for the drafts table using Drizzle ORM.
 * Drafts are pre-commit working areas where users compose nodes,
 * add constraints, preview output, then commit.
 *
 * Key design:
 * - Optimistic locking via `revision` column
 * - Status lifecycle: editing → committed | abandoned
 * - Auto-draft lifecycle: auto → editing → committed | abandoned
 * - Fork creates a new draft from a committed draft
 */

import { isDeepStrictEqual } from 'node:util';
import type { CreateDraftInput, Draft, DraftConstraint, DraftStatus } from '@t3x-dev/core';
import { generateDraftId } from '@t3x-dev/core';
import { and, desc, eq, isNotNull, ne, sql } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { branches } from '../schema';
import { type DraftRecord, drafts } from '../schema-trees';

// ============================================================
// Error Types
// ============================================================

/**
 * Thrown when an optimistic lock conflict occurs.
 * The draft was modified between read and update (revision mismatch).
 */
export class ConflictError extends Error {
  constructor(
    public readonly draftId: string,
    public readonly expectedRevision?: number
  ) {
    super(
      expectedRevision === undefined
        ? `Conflict: draft ${draftId} requires a revision before it can be updated`
        : `Conflict: draft ${draftId} has been modified (expected revision ${expectedRevision})`
    );
    this.name = 'ConflictError';
  }
}

/**
 * Thrown when the target draft does not exist (e.g. deleted before update).
 *
 * Fix 9: Distinguish "deleted" from "concurrent write conflict".
 */
export class NotFoundError extends Error {
  constructor(public readonly draftId: string) {
    super(`Draft not found: ${draftId}`);
    this.name = 'NotFoundError';
  }
}

// ============================================================
// Types
// ============================================================

export interface ListDraftOptions {
  status?: string;
  limit?: number;
  offset?: number;
}

export interface UpdateDraftInput {
  title?: string;
  goal?: string;
  parent_commit_hash?: string;
  nodes?: unknown[];
  constraints?: DraftConstraint[];
  instructions?: string;
  preview_type?: string;
  target_branch?: string;
  status?: DraftStatus;
  workspace_state?: Record<string, unknown>;
  extraction_mode?: 'deterministic' | 'llm';
  semantic_points?: unknown[];
  extraction_cursor?: unknown;
}

export interface WorkspaceDraftInput {
  project_id: string;
  workspace_id: string;
  title: string;
  parent_commit_hash?: string | null;
  target_branch?: string | null;
  workspace_state: Record<string, unknown>;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Convert database row to Draft API type
 */
export function rowToDraft(row: DraftRecord): Draft {
  return {
    id: row.id,
    project_id: row.projectId,
    title: row.title,
    goal: row.goal ?? undefined,
    parent_commit_hash: row.parentCommitHash ?? undefined,
    forked_from: row.forkedFrom ?? undefined,
    nodes: (row.nodesJson ?? []) as unknown[],
    constraints: (row.constraintsJson ?? []) as DraftConstraint[],
    instructions: row.instructions ?? undefined,
    preview_type: row.previewType ?? undefined,
    preview_output: row.previewOutput ?? undefined,
    preview_generated_at: row.previewGeneratedAt?.toISOString(),
    status: row.status as Draft['status'],
    committed_as: row.committedAs ?? undefined,
    committed_leaf_id: row.committedLeafId ?? undefined,
    target_branch: row.targetBranch ?? undefined,
    workspace_id: row.workspaceId ?? undefined,
    workspace_state: (row.workspaceStateJson ?? undefined) as Record<string, unknown> | undefined,
    revision: row.revision,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    extraction_mode: (row.extractionMode as Draft['extraction_mode']) ?? undefined,
    semantic_points: (row.semanticPointsJson ?? undefined) as unknown[] | undefined,
    extraction_cursor: (row.extractionCursorJson ?? undefined) as unknown | undefined,
  };
}

// ============================================================
// Query Functions
// ============================================================

/**
 * Create a new Draft
 */
export async function insertDraft(db: AnyDB, input: CreateDraftInput): Promise<Draft> {
  if (
    input.workspace_state?.authoringLedger !== undefined ||
    input.workspace_state?.authoringBasis !== undefined
  )
    throw new DraftAuthoringConflictError('Authoring state requires the command service');
  const id = generateDraftId();
  const now = new Date();

  const [row] = await db
    .insert(drafts)
    .values({
      id,
      projectId: input.project_id,
      title: input.title,
      goal: input.goal ?? null,
      parentCommitHash: input.parent_commit_hash ?? null,
      forkedFrom: null,
      nodesJson: [],
      constraintsJson: [],
      instructions: null,
      previewType: input.preview_type ?? null,
      previewOutput: null,
      previewGeneratedAt: null,
      status: 'editing',
      committedAs: null,
      committedLeafId: null,
      targetBranch: input.target_branch ?? 'main',
      workspaceId: input.workspace_id ?? null,
      workspaceStateJson: input.workspace_state ?? null,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return rowToDraft(row);
}

/**
 * Find a Draft by ID
 */
export async function findDraftById(db: AnyDB, draftId: string): Promise<Draft | null> {
  const [row] = await db.select().from(drafts).where(eq(drafts.id, draftId)).limit(1);

  return row ? rowToDraft(row) : null;
}

/**
 * List Drafts by project
 *
 * Fix 10: No default status filter. When status is provided it is applied;
 * when omitted all statuses are returned so callers can request committed,
 * abandoned, auto, etc. without having to know the 'editing' default.
 */
export async function listDraftsByProject(
  db: AnyDB,
  projectId: string,
  options: ListDraftOptions = {}
): Promise<Draft[]> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  const status = options.status; // no default

  const conditions = [eq(drafts.projectId, projectId)];
  if (status) {
    conditions.push(eq(drafts.status, status));
  }

  const rows = await db
    .select()
    .from(drafts)
    .where(and(...conditions))
    .orderBy(desc(drafts.updatedAt))
    .limit(limit)
    .offset(offset);

  return rows.map(rowToDraft);
}

/**
 * Update a Draft with optimistic locking
 *
 * Fix 9: After 0-row update, SELECT to distinguish "deleted" from "concurrent
 * write conflict". If row no longer exists → NotFoundError. If it exists with
 * a different revision → ConflictError (concurrent write).
 *
 * @throws NotFoundError if the draft no longer exists
 * @throws ConflictError if revision doesn't match (concurrent modification, 409)
 */
export async function updateDraft(
  db: AnyDB,
  draftId: string,
  input: UpdateDraftInput,
  ifRevision: number
): Promise<Draft> {
  const previous = await findDraftById(db, draftId);
  if (!previous) throw new NotFoundError(draftId);
  assertLegacyDraftWrite(previous, input);
  const now = new Date();
  const updateData: Record<string, unknown> = { updatedAt: now };

  if (input.title !== undefined) updateData.title = input.title;
  if (input.goal !== undefined) updateData.goal = input.goal;
  if (input.parent_commit_hash !== undefined)
    updateData.parentCommitHash = input.parent_commit_hash;
  if (input.nodes !== undefined) updateData.nodesJson = input.nodes;
  if (input.constraints !== undefined) updateData.constraintsJson = input.constraints;
  if (input.instructions !== undefined) updateData.instructions = input.instructions;
  if (input.preview_type !== undefined) updateData.previewType = input.preview_type;
  if (input.target_branch !== undefined) updateData.targetBranch = input.target_branch;
  if (input.status !== undefined) updateData.status = input.status;
  if (input.workspace_state !== undefined) updateData.workspaceStateJson = input.workspace_state;
  if (input.extraction_mode !== undefined) updateData.extractionMode = input.extraction_mode;
  if (input.semantic_points !== undefined) updateData.semanticPointsJson = input.semantic_points;
  if (input.extraction_cursor !== undefined)
    updateData.extractionCursorJson = input.extraction_cursor;

  // Increment revision
  // Note: Drizzle doesn't support SQL expressions in set(), so we use ifRevision + 1
  updateData.revision = ifRevision + 1;

  const rows = await db
    .update(drafts)
    .set(updateData)
    .where(and(eq(drafts.id, draftId), eq(drafts.revision, ifRevision)))
    .returning();

  if (rows.length === 0) {
    // Distinguish "deleted" from "concurrent write with revision mismatch"
    const existing = await findDraftById(db, draftId);
    if (!existing) {
      throw new NotFoundError(draftId);
    }
    throw new ConflictError(draftId, ifRevision);
  }

  return rowToDraft(rows[0]);
}

/**
 * Update preview output cache
 */
export async function updateDraftPreview(
  db: AnyDB,
  draftId: string,
  output: string
): Promise<void> {
  await db
    .update(drafts)
    .set({
      previewOutput: output,
      previewGeneratedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(drafts.id, draftId));
}

/**
 * Mark a Draft as committed
 */
export async function commitDraft(
  db: AnyDB,
  draftId: string,
  commitHash: string,
  leafId?: string
): Promise<boolean> {
  const result = await db
    .update(drafts)
    .set({
      status: 'committed',
      committedAs: commitHash,
      committedLeafId: leafId ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(drafts.id, draftId), eq(drafts.status, 'editing')))
    .returning();
  return result.length > 0;
}

/**
 * Mark a Draft as abandoned
 */
export async function abandonDraft(db: AnyDB, draftId: string): Promise<void> {
  await db
    .update(drafts)
    .set({
      status: 'abandoned',
      updatedAt: new Date(),
    })
    .where(eq(drafts.id, draftId));
}

/**
 * Fork a committed Draft into a new editing Draft
 *
 * @throws Error if source draft is not committed
 */
export async function forkDraft(db: AnyDB, sourceDraftId: string): Promise<Draft> {
  const source = await findDraftById(db, sourceDraftId);
  if (!source) {
    throw new Error(`Draft not found: ${sourceDraftId}`);
  }
  if (source.status !== 'committed') {
    throw new Error(`Cannot fork draft with status '${source.status}' (must be 'committed')`);
  }

  const id = generateDraftId();
  const now = new Date();

  const [row] = await db
    .insert(drafts)
    .values({
      id,
      projectId: source.project_id,
      title: `${source.title} (fork)`,
      goal: source.goal ?? null,
      parentCommitHash: source.committed_as ?? null,
      forkedFrom: source.id,
      nodesJson: source.nodes as DraftRecord['nodesJson'],
      constraintsJson: source.constraints as DraftRecord['constraintsJson'],
      instructions: source.instructions ?? null,
      previewType: source.preview_type ?? null,
      previewOutput: null,
      previewGeneratedAt: null,
      status: 'editing',
      committedAs: null,
      committedLeafId: null,
      targetBranch: source.target_branch ?? 'main',
      revision: 1,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return rowToDraft(row);
}

/**
 * Find the Draft that backs a Project Workspaces staged state.
 */
export async function findWorkspaceDraft(
  db: AnyDB,
  projectId: string,
  workspaceId: string
): Promise<Draft | null> {
  const [row] = await db
    .select()
    .from(drafts)
    .where(and(eq(drafts.projectId, projectId), eq(drafts.workspaceId, workspaceId)))
    .limit(1);

  return row ? rowToDraft(row) : null;
}

/**
 * List Drafts that back Project Workspaces staged states.
 */
export async function listWorkspaceDrafts(db: AnyDB, projectId: string): Promise<Draft[]> {
  const rows = await db
    .select()
    .from(drafts)
    .where(
      and(
        eq(drafts.projectId, projectId),
        isNotNull(drafts.workspaceId),
        ne(drafts.status, 'abandoned')
      )
    )
    .orderBy(desc(drafts.updatedAt));

  return rows.map(rowToDraft);
}

/**
 * Create or update the Draft that backs a Workspace staged state.
 */
export async function upsertWorkspaceDraft(
  db: AnyDB,
  input: WorkspaceDraftInput,
  ifRevision?: number
): Promise<Draft> {
  const targetBranch = input.target_branch?.trim() || 'main';
  const existing = await findWorkspaceDraft(db, input.project_id, input.workspace_id);

  if (!existing) {
    if (ifRevision !== undefined) {
      throw new ConflictError(input.workspace_id, ifRevision);
    }
    return insertDraft(db, {
      project_id: input.project_id,
      title: input.title,
      parent_commit_hash: input.parent_commit_hash ?? undefined,
      target_branch: targetBranch,
      preview_type: 'workspace',
      workspace_id: input.workspace_id,
      workspace_state: input.workspace_state,
    });
  }

  if (ifRevision === undefined) {
    throw new ConflictError(existing.id);
  }

  return updateDraft(
    db,
    existing.id,
    {
      title: input.title,
      parent_commit_hash: input.parent_commit_hash ?? undefined,
      target_branch: targetBranch,
      status: 'editing',
      workspace_state: input.workspace_state,
    },
    ifRevision
  );
}

/**
 * Delete a Draft
 */
export async function deleteDraft(db: AnyDB, draftId: string): Promise<void> {
  // Authoring history is retained when a workspace is removed from active lists.
  // A single conditional DELETE also prevents racing initial ledger publication.
  const rows = await db
    .delete(drafts)
    .where(
      and(eq(drafts.id, draftId), sql`${drafts.workspaceStateJson}->'authoringLedger' IS NULL`)
    )
    .returning();
  if (rows.length === 0 && (await findDraftById(db, draftId))?.workspace_state?.authoringLedger)
    throw new DraftAuthoringConflictError(
      'Authoring history must be retained; abandon the Draft instead'
    );
}

// ============================================================
// Auto-Draft Functions (Upgrade #7)
// ============================================================

/**
 * Create an auto-draft for a conversation.
 *
 * Auto-drafts are created with status='auto' and store the conversation_id
 * in the `goal` field for reverse lookup.
 */
export async function insertAutoDraft(
  db: AnyDB,
  input: {
    project_id: string;
    conversation_id: string;
    title: string;
    nodes: unknown[];
    parent_commit_hash?: string;
    target_branch?: string;
  }
): Promise<Draft> {
  const id = generateDraftId();
  const now = new Date();

  const [row] = await db
    .insert(drafts)
    .values({
      id,
      projectId: input.project_id,
      title: input.title,
      goal: `auto:${input.conversation_id}`,
      parentCommitHash: input.parent_commit_hash ?? null,
      forkedFrom: null,
      nodesJson: input.nodes as DraftRecord['nodesJson'],
      constraintsJson: [],
      instructions: null,
      previewType: null,
      previewOutput: null,
      previewGeneratedAt: null,
      status: 'auto',
      committedAs: null,
      committedLeafId: null,
      targetBranch: input.target_branch ?? 'main',
      revision: 1,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return rowToDraft(row);
}

/**
 * Find auto-drafts for a conversation.
 *
 * Uses the `goal` field pattern `auto:<conversation_id>` for lookup.
 *
 * Fix 18 (index note): The equality filter `eq(drafts.goal, 'auto:<id>')` performs a
 * full scan of drafts filtered to the project. For workloads with many
 * drafts per project, consider adding a partial index on (project_id, goal)
 * WHERE status = 'auto'. Example migration:
 *   CREATE INDEX IF NOT EXISTS idx_drafts_auto_goal
 *   ON drafts (project_id, goal) WHERE status = 'auto';
 */
export async function findAutoDraftsByConversation(
  db: AnyDB,
  projectId: string,
  conversationId: string
): Promise<Draft[]> {
  const rows = await db
    .select()
    .from(drafts)
    .where(
      and(
        eq(drafts.projectId, projectId),
        eq(drafts.status, 'auto'),
        eq(drafts.goal, `auto:${conversationId}`)
      )
    )
    .orderBy(desc(drafts.updatedAt));

  return rows.map(rowToDraft);
}

/**
 * Promote an auto-draft to editing status (for user review before commit).
 *
 * @throws Error if draft is not in 'auto' status
 */
export async function promoteDraft(db: AnyDB, draftId: string): Promise<Draft> {
  // Atomic check-and-update: WHERE id AND status='auto' prevents TOCTOU race
  const rows = await db
    .update(drafts)
    .set({
      status: 'editing',
      updatedAt: new Date(),
    })
    .where(and(eq(drafts.id, draftId), eq(drafts.status, 'auto')))
    .returning();

  if (rows.length === 0) {
    // Distinguish "not found" from "wrong status"
    const existing = await findDraftById(db, draftId);
    if (!existing) {
      throw new Error(`Draft not found: ${draftId}`);
    }
    throw new Error(`Cannot promote draft with status '${existing.status}' (must be 'auto')`);
  }

  return rowToDraft(rows[0]);
}

export class DraftAuthoringConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DraftAuthoringConflictError';
  }
}

const EDITABLE_WORKSPACE_METADATA = new Set([
  'title',
  'description',
  'sourceBundle',
  'updatedAt',
  'outputTargets',
]);
function withoutMetadata(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !EDITABLE_WORKSPACE_METADATA.has(key))
  );
}

/** All legacy writers pass this guard before the same row revision CAS. */
export function assertLegacyDraftWrite(previous: Draft, input: UpdateDraftInput) {
  const stored = previous.workspace_state ?? {};
  const incoming = input.workspace_state;
  if (!stored.authoringLedger) {
    if (incoming?.authoringLedger !== undefined || incoming?.authoringBasis !== undefined)
      throw new DraftAuthoringConflictError('Authoring state requires the command service');
    return;
  }
  if (
    (incoming && !isDeepStrictEqual(withoutMetadata(stored), withoutMetadata(incoming))) ||
    (input.target_branch !== undefined && input.target_branch !== previous.target_branch) ||
    (input.parent_commit_hash !== undefined &&
      input.parent_commit_hash !== previous.parent_commit_hash) ||
    input.nodes !== undefined ||
    input.constraints !== undefined ||
    input.semantic_points !== undefined ||
    (input.status !== undefined && input.status !== previous.status)
  )
    throw new DraftAuthoringConflictError('This Draft is managed by immutable authoring commands');
}

type AuthoringLedgerStorage = {
  base: unknown;
  schema: string;
  version: number;
  compositionRevision: number;
  actions: unknown[];
  receipts?: unknown[];
};
function assertAppendOnlyWorkspace(
  previous: Record<string, unknown>,
  next: Record<string, unknown>
) {
  const before = previous.authoringLedger as AuthoringLedgerStorage | undefined;
  const after = next.authoringLedger as AuthoringLedgerStorage | undefined;
  if (
    !after ||
    !Array.isArray(after.actions) ||
    !Number.isInteger(after.compositionRevision) ||
    after.compositionRevision !== after.actions.length
  )
    throw new DraftAuthoringConflictError('Invalid authoring publication');
  if (!before) return;
  if (
    !isDeepStrictEqual(previous.authoringBasis, next.authoringBasis) ||
    !isDeepStrictEqual(before.base, after.base) ||
    before.schema !== after.schema ||
    before.version !== after.version ||
    after.actions.length < before.actions.length ||
    !isDeepStrictEqual(before.actions, after.actions.slice(0, before.actions.length)) ||
    !isDeepStrictEqual(
      before.receipts ?? [],
      (after.receipts ?? []).slice(0, (before.receipts ?? []).length)
    )
  )
    throw new DraftAuthoringConflictError('Published authoring facts cannot be changed');
}

/** Internal application transaction, never a client-selected write bypass.
 * Locks the target ref before the Draft. The callback must revalidate basis and
 * permissions; a callback failure rolls back both publication and outcome.
 */
export async function transactWorkspaceAuthoring<T>(
  db: AnyDB,
  input: { projectId: string; workspaceId: string; refName: string },
  command: (
    tx: AnyDB,
    draft: Draft
  ) => Promise<{ workspace: Record<string, unknown> | null; value: T }>
): Promise<{ draft: Draft; value: T }> {
  type TxRunner = { transaction<R>(fn: (tx: unknown) => Promise<R>): Promise<R> };
  return (db as unknown as TxRunner).transaction(async (rawTx) => {
    const tx = rawTx as AnyDB;
    const [branch] = await tx
      .select()
      .from(branches)
      .where(and(eq(branches.projectId, input.projectId), eq(branches.name, input.refName)))
      .for('update');
    if (!branch) throw new DraftAuthoringConflictError('Target ref does not exist');
    const [row] = await tx
      .select()
      .from(drafts)
      .where(and(eq(drafts.projectId, input.projectId), eq(drafts.workspaceId, input.workspaceId)))
      .for('update');
    if (!row) throw new NotFoundError(input.workspaceId);
    const draft = rowToDraft(row);
    const result = await command(tx, draft);
    if (!result.workspace) return { draft, value: result.value };
    if (draft.status !== 'editing') throw new DraftAuthoringConflictError('Draft is not editable');
    assertAppendOnlyWorkspace(draft.workspace_state ?? {}, result.workspace);
    const [saved] = await tx
      .update(drafts)
      .set({
        workspaceStateJson: result.workspace,
        revision: draft.revision + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(drafts.id, draft.id), eq(drafts.revision, draft.revision)))
      .returning();
    if (!saved) throw new ConflictError(draft.id, draft.revision);
    return { draft: rowToDraft(saved), value: result.value };
  });
}

/** Used only inside the authorized canonical Commit transaction, after graph persistence. */
export async function sealWorkspaceAuthoring(
  db: AnyDB,
  input: { draft: Draft; commitDigest: string; workspace: Record<string, unknown> }
): Promise<Draft> {
  if (
    !input.draft.workspace_state?.authoringLedger ||
    !isDeepStrictEqual(
      input.draft.workspace_state.authoringLedger,
      input.workspace.authoringLedger
    ) ||
    !isDeepStrictEqual(input.draft.workspace_state.authoringBasis, input.workspace.authoringBasis)
  )
    throw new DraftAuthoringConflictError('Commit must retain the exact frozen authoring manifest');
  const [saved] = await db
    .update(drafts)
    .set({
      workspaceStateJson: input.workspace,
      status: 'committed',
      committedAs: input.commitDigest,
      revision: input.draft.revision + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(drafts.id, input.draft.id),
        eq(drafts.projectId, input.draft.project_id),
        eq(drafts.revision, input.draft.revision),
        eq(drafts.status, 'editing')
      )
    )
    .returning();
  if (!saved) throw new ConflictError(input.draft.id, input.draft.revision);
  return rowToDraft(saved);
}
