/**
 * Turns Queries
 *
 * CRUD operations for turns using Drizzle ORM.
 */

import { eq, desc, asc } from 'drizzle-orm';
import { turns, type Turn, type NewTurn } from '../schema';
import { computeTurnHash } from '@t3x/core';
import type { AnyDB } from '../adapters';

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
}

export interface ListTurnsByProjectOptions {
  projectId: string;
  limit?: number;
  offset?: number;
}

/**
 * Insert a new turn
 */
export async function insertTurn(
  db: AnyDB,
  input: CreateTurnInput
): Promise<Turn> {
  const createdAt = new Date();

  // Get parent turn hash (last turn in conversation)
  const lastTurn = await findLastTurnInConversation(db, input.conversationId);
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

  const [turn] = await db.insert(turns).values({
    turnHash,
    parentTurnHash,
    projectId: input.projectId,
    conversationId: input.conversationId,
    role: input.role,
    content: input.content,
    language: input.language ?? null,
    ringsJson,
    createdAt,
  }).returning();

  return turn;
}

/**
 * Find turn by hash
 */
export async function findTurnByHash(
  db: AnyDB,
  turnHash: string
): Promise<Turn | null> {
  const [turn] = await db
    .select()
    .from(turns)
    .where(eq(turns.turnHash, turnHash))
    .limit(1);

  return turn ?? null;
}

/**
 * Find turns by conversation
 */
export async function findTurnsByConversation(
  db: AnyDB,
  options: ListTurnsOptions
): Promise<Turn[]> {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;
  const orderFn = options.order === 'desc' ? desc : asc;

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
    .orderBy(desc(turns.createdAt))
    .limit(1);

  return turn ?? null;
}

/**
 * Get turn chain (walk back through parent hashes)
 */
export async function findTurnChain(
  db: AnyDB,
  endTurnHash: string,
  limit = 50
): Promise<Turn[]> {
  const chain: Turn[] = [];
  let currentHash: string | null = endTurnHash;

  while (currentHash && chain.length < limit) {
    const turn = await findTurnByHash(db, currentHash);
    if (!turn) break;
    chain.unshift(turn); // Add to beginning to maintain order
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
    throw new TurnWindowError(
      `End turn ${endTurnHash} not found`,
      'END_NOT_FOUND'
    );
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
