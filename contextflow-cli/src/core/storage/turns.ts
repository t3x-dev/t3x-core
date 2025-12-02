/**
 * Turns V2 CRUD operations (with hash chain)
 */

import { getDb } from '../db';
import type {
  TurnV2Record,
  CreateTurnV2Input,
  ListTurnsV2Options,
} from './types';
import { computeTurnHash, isoNow } from './utils';

export function createTurnV2(input: CreateTurnV2Input): TurnV2Record {
  const db = getDb();
  const created_at = isoNow();

  // Get parent turn hash (last turn in conversation)
  const lastTurn = db
    .prepare(
      `SELECT turn_hash FROM turns_v2
       WHERE conversation_id = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(input.conversation_id) as { turn_hash: string } | undefined;

  const parent_turn_hash = lastTurn?.turn_hash ?? null;
  const language = input.language ?? null;
  const rings_json = input.rings ? JSON.stringify(input.rings) : null;

  // Compute turn hash
  const turn_hash = computeTurnHash({
    parent_turn_hash,
    project_id: input.project_id,
    conversation_id: input.conversation_id,
    role: input.role,
    content: input.content,
    language,
    rings_json,
    created_at,
  });

  db.prepare(
    `INSERT INTO turns_v2
     (turn_hash, parent_turn_hash, project_id, conversation_id, role, content, language, rings_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    turn_hash,
    parent_turn_hash,
    input.project_id,
    input.conversation_id,
    input.role,
    input.content,
    language,
    rings_json,
    created_at
  );

  return {
    turn_hash,
    parent_turn_hash,
    project_id: input.project_id,
    conversation_id: input.conversation_id,
    role: input.role,
    content: input.content,
    language,
    rings_json,
    created_at,
  };
}

export function getTurnV2(turn_hash: string): TurnV2Record | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM turns_v2 WHERE turn_hash = ?`)
    .get(turn_hash) as TurnV2Record | undefined;
  return row ?? null;
}

export function listTurnsV2(options: ListTurnsV2Options): TurnV2Record[] {
  const db = getDb();
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  return db
    .prepare(
      `SELECT * FROM turns_v2
       WHERE conversation_id = ?
       ORDER BY created_at ASC
       LIMIT ? OFFSET ?`
    )
    .all(options.conversation_id, limit, offset) as TurnV2Record[];
}

export function listTurnsV2ByProject(project_id: string, limit = 100, offset = 0): TurnV2Record[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM turns_v2
       WHERE project_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(project_id, limit, offset) as TurnV2Record[];
}

export function getLastTurnInConversation(conversation_id: string): TurnV2Record | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM turns_v2
       WHERE conversation_id = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(conversation_id) as TurnV2Record | undefined;
  return row ?? null;
}

export function getTurnChain(end_turn_hash: string, limit = 50): TurnV2Record[] {
  const db = getDb();
  const chain: TurnV2Record[] = [];
  let current_hash: string | null = end_turn_hash;

  while (current_hash && chain.length < limit) {
    const turn = getTurnV2(current_hash);
    if (!turn) break;
    chain.unshift(turn); // Add to beginning to maintain order
    current_hash = turn.parent_turn_hash;
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

export function getTurnsInWindow(
  start_turn_hash: string,
  end_turn_hash: string
): TurnV2Record[] {
  // Verify end turn exists
  const endTurn = getTurnV2(end_turn_hash);
  if (!endTurn) {
    throw new TurnWindowError(
      `End turn ${end_turn_hash} not found`,
      'END_NOT_FOUND'
    );
  }

  // Get the chain ending at end_turn_hash
  const chain = getTurnChain(end_turn_hash, 1000);

  // Find the start index - it MUST be in the chain
  const startIndex = chain.findIndex((t) => t.turn_hash === start_turn_hash);
  if (startIndex === -1) {
    throw new TurnWindowError(
      `Start turn ${start_turn_hash} is not an ancestor of end turn ${end_turn_hash}`,
      'START_NOT_IN_CHAIN'
    );
  }

  return chain.slice(startIndex);
}
