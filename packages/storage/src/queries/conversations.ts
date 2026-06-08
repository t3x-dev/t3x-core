/**
 * Conversations Queries
 *
 * CRUD operations for conversations using Drizzle ORM.
 */

import { generateConversationId } from '@t3x-dev/core';
import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
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
  parentCommitHash?: string | null;
  positionX?: number;
  positionY?: number;
  metadata?: Record<string, unknown>;
  provider?: string | null;
  model?: string | null;
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
 * Find a conversation by either its conversationId (e.g. `conv_abc123`) or
 * its alias scoped to a project. ID lookup wins; alias is the fallback.
 *
 * Returns null when neither form matches inside the given project.
 */
export async function findConversationByAliasOrId(
  db: AnyDB,
  projectId: string,
  valueOrAlias: string
): Promise<Conversation | null> {
  // ID-shaped lookup first (cheap and unambiguous)
  if (valueOrAlias.startsWith('conv_')) {
    const [byId] = await db
      .select()
      .from(conversations)
      .where(
        and(eq(conversations.conversationId, valueOrAlias), eq(conversations.projectId, projectId))
      )
      .limit(1);
    if (byId) return byId;
  }

  // Alias fallback — scoped to project
  const [byAlias] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.alias, valueOrAlias), eq(conversations.projectId, projectId)))
    .limit(1);

  return byAlias ?? null;
}

const ALIAS_FORMAT = /^[a-z][a-z0-9_]{0,63}$/;
const MAX_COLLISION_SUFFIX = 99;

function isUniqueViolation(err: unknown): boolean {
  // postgres.js exposes `code`; Drizzle 0.45 wraps that error as `cause`.
  const seen = new Set<unknown>();
  let current: unknown = err;

  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    seen.add(current);
    if ((current as { code?: unknown }).code === '23505') return true;
    current = (current as { cause?: unknown }).cause;
  }

  return false;
}

/**
 * Atomically set conversation.alias only when it is currently NULL. On unique
 * violation against another conversation in the same project, retries with
 * suffixes `_2`, `_3`, …, up to `_99`.
 *
 * Returns:
 *   - the alias actually written, on success
 *   - the alias another worker had already written, when the row's alias is
 *     no longer NULL by the time the UPDATE reaches the database
 *   - null when all 99 candidates collide
 */
export async function setAliasIfNull(
  db: AnyDB,
  conversationId: string,
  baseAlias: string
): Promise<string | null> {
  if (!ALIAS_FORMAT.test(baseAlias)) {
    throw new Error(`Invalid alias format: ${baseAlias}`);
  }

  for (let i = 1; i <= MAX_COLLISION_SUFFIX; i++) {
    const candidate = i === 1 ? baseAlias : `${baseAlias}_${i}`;
    try {
      const updated = await db
        .update(conversations)
        .set({ alias: candidate })
        .where(and(eq(conversations.conversationId, conversationId), isNull(conversations.alias)))
        .returning({ alias: conversations.alias });

      if (updated.length > 0) {
        return updated[0].alias ?? null;
      }

      // No row updated → either conversation does not exist OR alias was
      // already set by another worker. Re-fetch to distinguish and return.
      const [existing] = await db
        .select({ alias: conversations.alias })
        .from(conversations)
        .where(eq(conversations.conversationId, conversationId))
        .limit(1);
      return existing?.alias ?? null;
    } catch (err) {
      if (isUniqueViolation(err)) continue; // try next suffix
      throw err;
    }
  }

  return null;
}

/**
 * Manual rename — overwrites the current alias unconditionally.
 *
 * Throws:
 *   - "Invalid alias format" when newAlias does not match the canonical regex
 *   - the underlying postgres unique-violation error when the alias is taken
 *     in the same project (caller should translate to HTTP 409)
 */
export async function renameConversation(
  db: AnyDB,
  conversationId: string,
  newAlias: string
): Promise<void> {
  if (!ALIAS_FORMAT.test(newAlias)) {
    throw new Error(`Invalid alias format: ${newAlias}`);
  }

  await db
    .update(conversations)
    .set({ alias: newAlias })
    .where(eq(conversations.conversationId, conversationId));
}

/**
 * Mark a conversation as committed exactly once.
 *
 * Returns the updated conversation when this call wins the guard, or null
 * when the conversation is missing or was already committed by another writer.
 */
export async function markConversationCommitted(
  db: AnyDB,
  conversationId: string,
  commitHash: string,
  committedAt = new Date()
): Promise<Conversation | null> {
  const [updated] = await db
    .update(conversations)
    .set({ committedAs: commitHash, committedAt })
    .where(and(eq(conversations.conversationId, conversationId), isNull(conversations.committedAs)))
    .returning();

  return updated ?? null;
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
  if (updates.parentCommitHash !== undefined) {
    updateData.parentCommitHash = updates.parentCommitHash;
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
  if (updates.provider !== undefined) {
    updateData.provider = updates.provider;
  }
  if (updates.model !== undefined) {
    updateData.model = updates.model;
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
