/**
 * Conversations CRUD operations
 */

import { getDb } from '../db';
import type {
  ConversationRecord,
  CreateConversationInput,
  ListConversationsOptions,
} from './types';
import { generateConversationId, isoNow } from './utils';

export function createConversation(input: CreateConversationInput): ConversationRecord {
  const db = getDb();
  const conversation_id = generateConversationId();
  const created_at = isoNow();
  const metadata_json = input.metadata ? JSON.stringify(input.metadata) : null;
  const parent_commit_hash = input.parent_commit_hash ?? null;
  const position_x = input.position_x ?? null;
  const position_y = input.position_y ?? null;

  db.prepare(
    `INSERT INTO conversations (conversation_id, project_id, title, parent_commit_hash, position_x, position_y, created_at, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(conversation_id, input.project_id, input.title ?? null, parent_commit_hash, position_x, position_y, created_at, metadata_json);

  return {
    conversation_id,
    project_id: input.project_id,
    title: input.title ?? null,
    parent_commit_hash,
    position_x,
    position_y,
    created_at,
    metadata_json,
  };
}

export function getConversation(conversation_id: string): ConversationRecord | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM conversations WHERE conversation_id = ?`)
    .get(conversation_id) as ConversationRecord | undefined;
  return row ?? null;
}

export function listConversations(options: ListConversationsOptions): ConversationRecord[] {
  const db = getDb();
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  return db
    .prepare(
      `SELECT * FROM conversations
       WHERE project_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(options.project_id, limit, offset) as ConversationRecord[];
}

export function deleteConversation(conversation_id: string): boolean {
  const db = getDb();
  const result = db
    .prepare(`DELETE FROM conversations WHERE conversation_id = ?`)
    .run(conversation_id);
  return result.changes > 0;
}

export function updateConversation(
  conversation_id: string,
  updates: { title?: string; position_x?: number; position_y?: number; metadata?: Record<string, unknown> }
): ConversationRecord | null {
  const db = getDb();
  const existing = getConversation(conversation_id);
  if (!existing) return null;

  const title = updates.title !== undefined ? updates.title : existing.title;
  const position_x = updates.position_x !== undefined ? updates.position_x : existing.position_x;
  const position_y = updates.position_y !== undefined ? updates.position_y : existing.position_y;
  const metadata_json = updates.metadata
    ? JSON.stringify(updates.metadata)
    : existing.metadata_json;

  db.prepare(
    `UPDATE conversations SET title = ?, position_x = ?, position_y = ?, metadata_json = ? WHERE conversation_id = ?`
  ).run(title, position_x, position_y, metadata_json, conversation_id);

  return getConversation(conversation_id);
}

export function getConversationTurnCount(conversation_id: string): number {
  const db = getDb();
  const result = db
    .prepare(`SELECT COUNT(*) as c FROM turns_v2 WHERE conversation_id = ?`)
    .get(conversation_id) as { c: number };
  return result.c;
}
