/**
 * Topics Queries
 *
 * CRUD operations for the topics table (multi-topic conversations).
 */

import { randomUUID } from 'node:crypto';
import { asc, eq, and } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type TopicInsert, type TopicRecord, topics } from '../schema-frames';

// ============================================================
// Queries
// ============================================================

/**
 * Create a new topic for a conversation.
 */
export async function createTopic(
  db: AnyDB,
  input: { conversationId: string; projectId: string; name: string }
): Promise<TopicRecord> {
  const id = `topic_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const row: TopicInsert = {
    id,
    conversationId: input.conversationId,
    projectId: input.projectId,
    name: input.name,
    status: 'active',
  };

  const [result] = await db.insert(topics).values(row).returning();
  return result;
}

/**
 * List all topics for a conversation, ordered by created_at ASC.
 */
export async function listTopicsByConversation(
  db: AnyDB,
  conversationId: string
): Promise<TopicRecord[]> {
  return db
    .select()
    .from(topics)
    .where(eq(topics.conversationId, conversationId))
    .orderBy(asc(topics.createdAt));
}

/**
 * Update a topic (name or status).
 */
export async function updateTopic(
  db: AnyDB,
  id: string,
  update: { name?: string; status?: string }
): Promise<TopicRecord | undefined> {
  const sets: Partial<TopicInsert> = {};
  if (update.name !== undefined) sets.name = update.name;
  if (update.status !== undefined) sets.status = update.status;

  const [result] = await db.update(topics).set(sets).where(eq(topics.id, id)).returning();
  return result;
}

/**
 * Get a single topic by ID.
 */
export async function getTopicById(
  db: AnyDB,
  id: string
): Promise<TopicRecord | undefined> {
  const [result] = await db.select().from(topics).where(eq(topics.id, id));
  return result;
}

/**
 * Delete a topic by ID.
 */
export async function deleteTopic(
  db: AnyDB,
  id: string
): Promise<TopicRecord | undefined> {
  const [result] = await db.delete(topics).where(eq(topics.id, id)).returning();
  return result;
}
