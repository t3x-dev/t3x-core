/**
 * Agent Drafts Queries
 *
 * CRUD operations for agent drafts using Drizzle ORM.
 */

import { computeTextHash, generateAgentDraftId } from '@t3x-dev/core';
import { and, desc, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type AgentDraft, agentDrafts, type NewAgentDraft } from '../schema';

/** @deprecated Use AgentDraft instead */
type Draft = AgentDraft;
const drafts = agentDrafts;

export type AgentDraftStatus = 'ephemeral' | 'adopted' | 'superseded';

export interface CreateAgentDraftInput {
  projectId: string;
  conversationId: string;
  baseCommitHash?: string;
  turnAnchorHash?: string;
  bridgeId: string;
  bridgePayload: unknown;
  mustHave?: unknown[];
  mustntHave?: unknown[];
  llmConfig: unknown;
  text: string;
}

export interface ListAgentDraftsOptions {
  projectId: string;
  status?: AgentDraftStatus;
  limit?: number;
  offset?: number;
}

/**
 * Insert a new draft
 */
export async function insertAgentDraft(db: AnyDB, input: CreateAgentDraftInput): Promise<Draft> {
  const draftId = generateAgentDraftId();
  const createdAt = new Date();

  const bridgePayloadJson = JSON.stringify(input.bridgePayload);
  const mustHaveJson = input.mustHave ? JSON.stringify(input.mustHave) : null;
  const mustntHaveJson = input.mustntHave ? JSON.stringify(input.mustntHave) : null;
  const llmConfigJson = JSON.stringify(input.llmConfig);

  const [draft] = await db
    .insert(drafts)
    .values({
      draftId,
      projectId: input.projectId,
      conversationId: input.conversationId,
      baseCommitHash: input.baseCommitHash ?? null,
      turnAnchorHash: input.turnAnchorHash ?? null,
      bridgeId: input.bridgeId,
      bridgePayloadJson,
      mustHaveJson,
      mustntHaveJson,
      llmConfigJson,
      text: input.text,
      status: 'ephemeral',
      createdAt,
      completedAt: null,
    })
    .returning();

  return draft;
}

/**
 * Find draft by ID
 */
export async function findAgentDraftById(db: AnyDB, draftId: string): Promise<Draft | null> {
  const [draft] = await db.select().from(drafts).where(eq(drafts.draftId, draftId)).limit(1);

  return draft ?? null;
}

/**
 * Find drafts by project
 */
export async function findAgentDraftsByProject(
  db: AnyDB,
  options: ListAgentDraftsOptions
): Promise<Draft[]> {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  if (options.status) {
    return db
      .select()
      .from(drafts)
      .where(and(eq(drafts.projectId, options.projectId), eq(drafts.status, options.status)))
      .orderBy(desc(drafts.createdAt))
      .limit(limit)
      .offset(offset);
  }

  return db
    .select()
    .from(drafts)
    .where(eq(drafts.projectId, options.projectId))
    .orderBy(desc(drafts.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Update draft content
 */
export interface UpdateAgentDraftInput {
  text?: string;
  mustHave?: unknown[];
  bridgePayload?: unknown;
  completedAt?: Date;
}

export async function updateAgentDraft(
  db: AnyDB,
  draftId: string,
  input: UpdateAgentDraftInput
): Promise<Draft | null> {
  const updates: Partial<NewAgentDraft> = {};
  if (input.text !== undefined) updates.text = input.text;
  if (input.mustHave !== undefined) updates.mustHaveJson = JSON.stringify(input.mustHave);
  if (input.bridgePayload !== undefined)
    updates.bridgePayloadJson = JSON.stringify(input.bridgePayload);
  if (input.completedAt !== undefined) updates.completedAt = input.completedAt;

  const [updated] = await db
    .update(drafts)
    .set(updates)
    .where(eq(drafts.draftId, draftId))
    .returning();

  return updated ?? null;
}

/**
 * Update draft status
 */
export async function updateAgentDraftStatus(
  db: AnyDB,
  draftId: string,
  status: AgentDraftStatus
): Promise<Draft | null> {
  // Set completedAt when transitioning to adopted/superseded
  const completedAt = status !== 'ephemeral' ? new Date() : null;

  const [updated] = await db
    .update(drafts)
    .set({ status, completedAt })
    .where(eq(drafts.draftId, draftId))
    .returning();

  return updated ?? null;
}

/**
 * Adopt a draft
 */
export async function adoptAgentDraft(db: AnyDB, draftId: string): Promise<Draft | null> {
  return updateAgentDraftStatus(db, draftId, 'adopted');
}

/**
 * Supersede a draft
 */
export async function supersedeAgentDraft(db: AnyDB, draftId: string): Promise<Draft | null> {
  return updateAgentDraftStatus(db, draftId, 'superseded');
}

/**
 * Get draft text hash
 */
export async function getAgentDraftTextHash(db: AnyDB, draftId: string): Promise<string | null> {
  const draft = await findAgentDraftById(db, draftId);
  if (!draft) return null;
  return computeTextHash(draft.text);
}

/**
 * Delete a draft
 */
export async function deleteAgentDraft(db: AnyDB, draftId: string): Promise<boolean> {
  const result = await db.delete(drafts).where(eq(drafts.draftId, draftId)).returning();

  return result.length > 0;
}
