import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type TopicInsert, type TopicRecord, topics } from '../schema-frames';

export interface CreateTopicInput {
  conversationId: string;
  projectId: string;
  name: string;
}

export async function createTopic(
  db: AnyDB,
  input: CreateTopicInput
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

export async function updateTopic(
  db: AnyDB,
  topicId: string,
  updates: { name?: string; status?: string }
): Promise<TopicRecord | undefined> {
  const [result] = await db
    .update(topics)
    .set(updates)
    .where(eq(topics.id, topicId))
    .returning();
  return result;
}

export async function getTopicById(
  db: AnyDB,
  topicId: string
): Promise<TopicRecord | undefined> {
  const [result] = await db.select().from(topics).where(eq(topics.id, topicId));
  return result;
}

export async function deleteTopic(
  db: AnyDB,
  topicId: string
): Promise<TopicRecord | undefined> {
  const [result] = await db.delete(topics).where(eq(topics.id, topicId)).returning();
  return result;
}
