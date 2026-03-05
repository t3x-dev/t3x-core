/**
 * Turns Queries
 *
 * CRUD operations for turns using Drizzle ORM.
 */

import { computeTurnHash } from '@t3x/core';
import { and, asc, desc, eq, gt, lt, or } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type Turn, turns } from '../schema';
import { type CursorPage, decodeCursor, toCursorPage } from './pagination';

export interface CreateTurnInput {
  projectId: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  language?: string;
  rings?: unknown;
}

export interface ListTurnsOptions {
  conversationId: string;
  limit?: number;
  offset?: number;
  order?: 'asc' | 'desc';
  /** Opaque cursor for keyset pagination. Empty string = first page in cursor mode. */
  cursor?: string;
}

export interface ListTurnsByProjectOptions {
  projectId: string;
  limit?: number;
  offset?: number;
}

/**
 * Insert a new turn
 *
 * Wrapped in a transaction to prevent concurrent calls from forking the hash
 * chain. Both the "find last turn" read and the insert happen atomically.
 * Fix 1: Add transaction around insertTurn.
 */
export async function insertTurn(db: AnyDB, input: CreateTurnInput): Promise<Turn> {
  return db.transaction(async (tx) => {
    const createdAt = new Date();

    // Get parent turn hash (last turn in conversation) — inside the transaction
    const lastTurn = await findLastTurnInConversation(tx as AnyDB, input.conversationId);
    const parentTurnHash = lastTurn?.turnHash ?? null;

    const ringsJson = input.rings ? JSON.stringify(input.rings) : null;

    // Compute turn hash
    const turnHash = computeTurnHash({
      parent_turn_hash: parentTurnHash,
      project_id: input.projectId,
      conversation_id: input.conversationId,
      role: input.role,
      content: input.content,
      language: input.language ?? null,
      rings_json: ringsJson,
      created_at: createdAt.toISOString(),
    });

    const [turn] = await tx
      .insert(turns)
      .values({
        turnHash,
        parentTurnHash,
        projectId: input.projectId,
        conversationId: input.conversationId,
        role: input.role,
        content: input.content,
        language: input.language ?? null,
        ringsJson,
        createdAt,
      })
      .returning();

    return turn;
  });
}

/**
 * Find turn by hash
 */
export async function findTurnByHash(db: AnyDB, turnHash: string): Promise<Turn | null> {
  const [turn] = await db.select().from(turns).where(eq(turns.turnHash, turnHash)).limit(1);

  return turn ?? null;
}

/**
 * Find turns by conversation (cursor mode)
 *
 * Returns a CursorPage when `cursor` is provided (empty string = first page).
 */
export async function findTurnsByConversation(
  db: AnyDB,
  options: ListTurnsOptions & { cursor: string }
): Promise<CursorPage<Turn>>;
/**
 * Find turns by conversation (offset mode)
 */
export async function findTurnsByConversation(
  db: AnyDB,
  options: Omit<ListTurnsOptions, 'cursor'>
): Promise<Turn[]>;
export async function findTurnsByConversation(
  db: AnyDB,
  options: ListTurnsOptions
): Promise<Turn[] | CursorPage<Turn>> {
  const limit = options.limit ?? 100;
  const orderDir = options.order ?? 'asc';
  const orderFn = orderDir === 'desc' ? desc : asc;

  // Cursor mode: keyset pagination
  if (options.cursor !== undefined) {
    const conditions = [eq(turns.conversationId, options.conversationId)];

    if (options.cursor !== '') {
      const { t, k } = decodeCursor(options.cursor);
      if (orderDir === 'asc') {
        // ORDER BY createdAt ASC, turnHash ASC → keyset: (created_at > t) OR (created_at = t AND turn_hash > k)
        conditions.push(
          or(
            gt(turns.createdAt, new Date(t)),
            and(eq(turns.createdAt, new Date(t)), gt(turns.turnHash, k))
          )!
        );
      } else {
        // ORDER BY createdAt DESC, turnHash DESC → keyset: (created_at < t) OR (created_at = t AND turn_hash < k)
        conditions.push(
          or(
            lt(turns.createdAt, new Date(t)),
            and(eq(turns.createdAt, new Date(t)), lt(turns.turnHash, k))
          )!
        );
      }
    }

    const rows = await db
      .select()
      .from(turns)
      .where(and(...conditions))
      .orderBy(orderFn(turns.createdAt), orderFn(turns.turnHash))
      .limit(limit + 1);

    return toCursorPage(rows, limit, (turn) => ({
      t: turn.createdAt.toISOString(),
      k: turn.turnHash,
    }));
  }

  // Offset mode (existing behavior)
  const offset = options.offset ?? 0;

  return db
    .select()
    .from(turns)
    .where(eq(turns.conversationId, options.conversationId))
    .orderBy(orderFn(turns.createdAt), orderFn(turns.turnHash))
    .limit(limit)
    .offset(offset);
}

/**
 * Find turns by project
 */
export async function findTurnsByProject(
  db: AnyDB,
  options: ListTurnsByProjectOptions
): Promise<Turn[]> {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  return db
    .select()
    .from(turns)
    .where(eq(turns.projectId, options.projectId))
    .orderBy(desc(turns.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Find last turn in conversation
 */
export async function findLastTurnInConversation(
  db: AnyDB,
  conversationId: string
): Promise<Turn | null> {
  const [turn] = await db
    .select()
    .from(turns)
    .where(eq(turns.conversationId, conversationId))
    .orderBy(desc(turns.createdAt), desc(turns.turnHash))
    .limit(1);

  return turn ?? null;
}

/**
 * Get turn chain (walk back through parent hashes)
 *
 * Fix 4: Reduce N+1 queries. Pre-fetches all turns for the conversation in a
 * single query, builds a Map by hash, then walks the chain in memory.
 * This is O(1) queries instead of the previous O(N) per-turn queries.
 */
export async function findTurnChain(db: AnyDB, endTurnHash: string, limit = 50): Promise<Turn[]> {
  // Derive the conversation ID from the end turn so we can bulk-fetch
  const endTurn = await findTurnByHash(db, endTurnHash);
  if (!endTurn) return [];

  // Fetch all turns for the conversation in one query (capped at a reasonable ceiling)
  const allTurns = await db
    .select()
    .from(turns)
    .where(eq(turns.conversationId, endTurn.conversationId))
    .limit(10000);

  // Build O(1) lookup map by hash
  const byHash = new Map<string, Turn>();
  for (const t of allTurns) {
    byHash.set(t.turnHash, t);
  }

  // Walk the chain in memory
  const chain: Turn[] = [];
  let currentHash: string | null = endTurnHash;

  while (currentHash && chain.length < limit) {
    const turn = byHash.get(currentHash);
    if (!turn) break;
    chain.unshift(turn); // maintain chronological order
    currentHash = turn.parentTurnHash;
  }

  return chain;
}

/**
 * Error thrown when turn window is invalid
 */
export class TurnWindowError extends Error {
  constructor(
    message: string,
    public code: 'START_NOT_IN_CHAIN' | 'END_NOT_FOUND'
  ) {
    super(message);
    this.name = 'TurnWindowError';
  }
}

/**
 * Get turns in a window (from start to end hash)
 */
export async function findTurnsInWindow(
  db: AnyDB,
  startTurnHash: string,
  endTurnHash: string
): Promise<Turn[]> {
  // Verify end turn exists
  const endTurn = await findTurnByHash(db, endTurnHash);
  if (!endTurn) {
    throw new TurnWindowError(`End turn ${endTurnHash} not found`, 'END_NOT_FOUND');
  }

  // Get the chain ending at end_turn_hash
  const chain = await findTurnChain(db, endTurnHash, 1000);

  // Find the start index - it MUST be in the chain
  const startIndex = chain.findIndex((t) => t.turnHash === startTurnHash);
  if (startIndex === -1) {
    throw new TurnWindowError(
      `Start turn ${startTurnHash} is not an ancestor of end turn ${endTurnHash}`,
      'START_NOT_IN_CHAIN'
    );
  }

  return chain.slice(startIndex);
}
