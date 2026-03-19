/**
 * Draft Queries (Workbench)
 *
 * CRUD operations for the drafts table using Drizzle ORM.
 * Drafts are pre-commit working areas where users compose sentences,
 * add constraints, preview output, then commit.
 *
 * Key design:
 * - Optimistic locking via `revision` column
 * - Status lifecycle: editing → committed | abandoned
 * - Auto-draft lifecycle: auto → editing → committed | abandoned
 * - Fork creates a new draft from a committed draft
 */

import type {
  CreateDraftInput,
  Draft,
  DraftConstraint,
  DraftSentence,
  ExtractionCursor,
  SemanticPoint,
} from '@t3x-dev/core';
import { generateDraftId } from '@t3x-dev/core';
import { and, desc, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type DraftRecord, drafts } from '../schema-v4';

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
    public readonly expectedRevision: number
  ) {
    super(`Conflict: draft ${draftId} has been modified (expected revision ${expectedRevision})`);
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
  sentences?: DraftSentence[];
  constraints?: DraftConstraint[];
  instructions?: string;
  preview_type?: string;
  target_branch?: string;
  extraction_mode?: 'deterministic' | 'llm';
  semantic_points?: SemanticPoint[];
  extraction_cursor?: ExtractionCursor;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Convert database row to Draft API type
 */
function rowToDraft(row: DraftRecord): Draft {
  return {
    id: row.id,
    project_id: row.projectId,
    title: row.title,
    goal: row.goal ?? undefined,
    parent_commit_hash: row.parentCommitHash ?? undefined,
    forked_from: row.forkedFrom ?? undefined,
    sentences: (row.sentencesJson ?? []) as DraftSentence[],
    constraints: (row.constraintsJson ?? []) as DraftConstraint[],
    instructions: row.instructions ?? undefined,
    preview_type: row.previewType ?? undefined,
    preview_output: row.previewOutput ?? undefined,
    preview_generated_at: row.previewGeneratedAt?.toISOString(),
    status: row.status as Draft['status'],
    committed_as: row.committedAs ?? undefined,
    committed_leaf_id: row.committedLeafId ?? undefined,
    target_branch: row.targetBranch ?? undefined,
    revision: row.revision,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    extraction_mode: (row.extractionMode as Draft['extraction_mode']) ?? undefined,
    semantic_points: (row.semanticPointsJson ?? undefined) as SemanticPoint[] | undefined,
    extraction_cursor: (row.extractionCursorJson ?? undefined) as ExtractionCursor | undefined,
  };
}

// ============================================================
// Query Functions
// ============================================================

/**
 * Create a new Draft
 */
export async function insertDraft(db: AnyDB, input: CreateDraftInput): Promise<Draft> {
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
      sentencesJson: [],
      constraintsJson: [],
      instructions: null,
      previewType: input.preview_type ?? null,
      previewOutput: null,
      previewGeneratedAt: null,
      status: 'editing',
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
  const now = new Date();
  const updateData: Record<string, unknown> = { updatedAt: now };

  if (input.title !== undefined) updateData.title = input.title;
  if (input.goal !== undefined) updateData.goal = input.goal;
  if (input.sentences !== undefined) updateData.sentencesJson = input.sentences;
  if (input.constraints !== undefined) updateData.constraintsJson = input.constraints;
  if (input.instructions !== undefined) updateData.instructions = input.instructions;
  if (input.preview_type !== undefined) updateData.previewType = input.preview_type;
  if (input.target_branch !== undefined) updateData.targetBranch = input.target_branch;
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
      sentencesJson: source.sentences as DraftRecord['sentencesJson'],
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
 * Delete a Draft
 */
export async function deleteDraft(db: AnyDB, draftId: string): Promise<void> {
  await db.delete(drafts).where(eq(drafts.id, draftId));
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
    sentences: DraftSentence[];
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
      sentencesJson: input.sentences as DraftRecord['sentencesJson'],
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
