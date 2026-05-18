/**
 * Source Text Revision Queries
 *
 * Turns are immutable. These rows persist controlled human edits to source
 * text so clients can derive an effective source layer without rewriting
 * the original turn.
 */

import { computeTextHash } from '@t3x-dev/core';
import { randomUUID } from 'crypto';
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import {
  type NewSourceTextRevision,
  type SourceTextRevision,
  sourceTextRevisions,
} from '../schema';

export type SourceTextRevisionStatus =
  | 'saved'
  | 'patched'
  | 'no_patch'
  | 'patch_failed'
  | 'synced'
  | 'discarded';

export type SourceTextRevisionAction = 'add' | 'edit' | 'delete';
export type SourceTextRevisionTurnRole = 'user' | 'assistant' | 'system' | 'tool';

export interface SourceTextRevisionSpan {
  id: string;
  action: SourceTextRevisionAction;
  start: number;
  end: number;
  text: string;
  originalText: string;
}

export interface InsertSourceTextRevisionInput {
  projectId: string;
  conversationId: string;
  turnHash: string;
  turnRole: SourceTextRevisionTurnRole;
  action: SourceTextRevisionAction;
  startChar: number;
  endChar: number;
  selectedText: string;
  replacementText: string;
  baseContent: string;
  content: string;
  spans: SourceTextRevisionSpan[];
  baseContentHash?: string;
  status?: SourceTextRevisionStatus;
}

export interface UpdateSourceTextRevisionInput {
  status?: SourceTextRevisionStatus;
  patchOps?: unknown[] | null;
  patchError?: string | null;
}

function generateSourceTextRevisionId(): string {
  return `str_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function hashSourceText(text: string): string {
  return computeTextHash(text);
}

export async function insertSourceTextRevision(
  db: AnyDB,
  input: InsertSourceTextRevisionInput
): Promise<SourceTextRevision> {
  const now = new Date();
  const row: NewSourceTextRevision = {
    revisionId: generateSourceTextRevisionId(),
    projectId: input.projectId,
    conversationId: input.conversationId,
    turnHash: input.turnHash,
    turnRole: input.turnRole,
    action: input.action,
    startChar: input.startChar,
    endChar: input.endChar,
    selectedText: input.selectedText,
    replacementText: input.replacementText,
    baseContent: input.baseContent,
    content: input.content,
    spans: input.spans,
    baseContentHash: input.baseContentHash ?? hashSourceText(input.baseContent),
    status: input.status ?? 'saved',
    patchOps: null,
    patchError: null,
    createdAt: now,
    updatedAt: now,
  };

  const [revision] = await db.insert(sourceTextRevisions).values(row).returning();
  return revision;
}

export async function listSourceTextRevisionsByConversation(
  db: AnyDB,
  conversationId: string
): Promise<SourceTextRevision[]> {
  return db
    .select()
    .from(sourceTextRevisions)
    .where(
      and(
        eq(sourceTextRevisions.conversationId, conversationId),
        ne(sourceTextRevisions.status, 'discarded'),
        ne(sourceTextRevisions.baseContentHash, 'sha256:legacy'),
        ne(sourceTextRevisions.content, '')
      )
    )
    .orderBy(asc(sourceTextRevisions.updatedAt), asc(sourceTextRevisions.revisionId));
}

export async function findLatestSourceTextRevisionByTurn(
  db: AnyDB,
  turnHash: string
): Promise<SourceTextRevision | null> {
  const [revision] = await db
    .select()
    .from(sourceTextRevisions)
    .where(
      and(
        eq(sourceTextRevisions.turnHash, turnHash),
        ne(sourceTextRevisions.status, 'discarded'),
        ne(sourceTextRevisions.baseContentHash, 'sha256:legacy'),
        ne(sourceTextRevisions.content, '')
      )
    )
    .orderBy(desc(sourceTextRevisions.updatedAt), desc(sourceTextRevisions.revisionId))
    .limit(1);

  return revision ?? null;
}

export async function findSourceTextRevisionById(
  db: AnyDB,
  revisionId: string
): Promise<SourceTextRevision | null> {
  const [revision] = await db
    .select()
    .from(sourceTextRevisions)
    .where(eq(sourceTextRevisions.revisionId, revisionId))
    .limit(1);

  return revision ?? null;
}

export async function updateSourceTextRevision(
  db: AnyDB,
  revisionId: string,
  input: UpdateSourceTextRevisionInput
): Promise<SourceTextRevision | null> {
  const patch: Partial<NewSourceTextRevision> = {
    updatedAt: new Date(),
  };
  if (input.status !== undefined) patch.status = input.status;
  if (input.patchOps !== undefined) patch.patchOps = input.patchOps;
  if (input.patchError !== undefined) patch.patchError = input.patchError;

  const [revision] = await db
    .update(sourceTextRevisions)
    .set(patch)
    .where(eq(sourceTextRevisions.revisionId, revisionId))
    .returning();

  return revision ?? null;
}
