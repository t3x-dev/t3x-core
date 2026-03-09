/**
 * Conversations Queries
 *
 * CRUD operations for conversations using Drizzle ORM.
 */

import { generateConversationId } from '@t3x/core';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type Conversation, conversations, type NewConversation, turns } from '../schema';
import { type CursorPage, decodeCursor, toCursorPage } from './pagination';

export interface CreateConversationInput {
  projectId: string;
  title?: string;
  parentCommitHash?: string;
  positionX?: number;
  positionY?: number;
  metadata?: Record<string, unknown>;
}

export interface ListConversationsOptions {
  projectId: string;
  limit?: number;
  offset?: number;
  /** Opaque cursor for keyset pagination. Empty string = first page in cursor mode. */
  cursor?: string;
}

export interface UpdateConversationInput {
  title?: string;
  positionX?: number;
  positionY?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Insert a new conversation
 */
export async function insertConversation(
  db: AnyDB,
  input: CreateConversationInput
): Promise<Conversation> {
  const conversationId = generateConversationId();
  const createdAt = new Date();
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

  const [conversation] = await db
    .insert(conversations)
    .values({
      conversationId,
      projectId: input.projectId,
      title: input.title ?? null,
      parentCommitHash: input.parentCommitHash ?? null,
      positionX: input.positionX ?? null,
      positionY: input.positionY ?? null,
      createdAt,
      metadataJson,
    })
    .returning();

  return conversation;
}

/**
 * Find conversation by ID
 */
export async function findConversationById(
  db: AnyDB,
  conversationId: string
): Promise<Conversation | null> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.conversationId, conversationId))
    .limit(1);

  return conversation ?? null;
}

/**
 * Find conversations by project
 *
 * Supports two pagination modes:
 * - **Offset mode** (default): pass limit/offset, returns Conversation[]
 * - **Cursor mode**: pass cursor (empty string for first page), returns CursorPage<Conversation>
 */
export async function findConversationsByProject(
  db: AnyDB,
  options: ListConversationsOptions & { cursor: string }
): Promise<CursorPage<Conversation>>;
export async function findConversationsByProject(
  db: AnyDB,
  options: Omit<ListConversationsOptions, 'cursor'>
): Promise<Conversation[]>;
export async function findConversationsByProject(
  db: AnyDB,
  options: ListConversationsOptions
): Promise<Conversation[] | CursorPage<Conversation>> {
  const limit = options.limit ?? 100;

  if (options.cursor !== undefined) {
    // Cursor pagination mode
    const conditions = [eq(conversations.projectId, options.projectId)];

    if (options.cursor !== '') {
      const { t, k } = decodeCursor(options.cursor);
      const cursorDate = new Date(t);
      // Keyset: (created_at < t) OR (created_at = t AND conversation_id < k)
      conditions.push(
        or(
          lt(conversations.createdAt, cursorDate),
          and(eq(conversations.createdAt, cursorDate), lt(conversations.conversationId, k))
        )!
      );
    }

    const rows = await db
      .select()
      .from(conversations)
      .where(and(...conditions))
      .orderBy(desc(conversations.createdAt), desc(conversations.conversationId))
      .limit(limit + 1);

    return toCursorPage(rows, limit, (c) => ({
      t: c.createdAt.toISOString(),
      k: c.conversationId,
    }));
  }

  // Legacy offset/limit mode
  const offset = options.offset ?? 0;

  return db
    .select()
    .from(conversations)
    .where(eq(conversations.projectId, options.projectId))
    .orderBy(desc(conversations.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Update a conversation
 *
 * Fix 8: Removed the preliminary read (TOCTOU). The UPDATE itself returns the
 * updated row; if 0 rows are returned the conversation does not exist.
 */
export async function updateConversation(
  db: AnyDB,
  conversationId: string,
  updates: UpdateConversationInput
): Promise<Conversation | null> {
  const updateData: Partial<NewConversation> = {};
  if (updates.title !== undefined) {
    updateData.title = updates.title;
  }
  if (updates.positionX !== undefined) {
    updateData.positionX = updates.positionX;
  }
  if (updates.positionY !== undefined) {
    updateData.positionY = updates.positionY;
  }
  if (updates.metadata !== undefined) {
    updateData.metadataJson = JSON.stringify(updates.metadata);
  }

  const [updated] = await db
    .update(conversations)
    .set(updateData)
    .where(eq(conversations.conversationId, conversationId))
    .returning();

  return updated ?? null;
}

/**
 * Delete a conversation
 */
export async function deleteConversation(db: AnyDB, conversationId: string): Promise<boolean> {
  const result = await db
    .delete(conversations)
    .where(eq(conversations.conversationId, conversationId))
    .returning();

  return result.length > 0;
}

/**
 * Get turn count for a conversation
 */
export async function getConversationTurnCount(db: AnyDB, conversationId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(turns)
    .where(eq(turns.conversationId, conversationId));

  return Number(result?.count ?? 0);
}
