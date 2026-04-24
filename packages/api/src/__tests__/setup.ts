/**
 * Test Setup for Hono API
 *
 * Creates an isolated embedded PostgreSQL database for each test file.
 */

import { createTestDB } from '../../../storage/src/__tests__/setup';

export async function setupTestDB(): Promise<{
  db: Awaited<ReturnType<typeof createTestDB>>['db'];
  /** Raw postgres.js Sql for direct SQL execution in tests */
  sql: Awaited<ReturnType<typeof createTestDB>>['sql'];
  cleanup: () => Promise<void>;
}> {
  return createTestDB();
}

export function generateId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 10)}`;
}

export const testData = {
  project: (overrides: { name?: string; metadata?: Record<string, unknown> } = {}) => ({
    name: overrides.name ?? `Test Project ${generateId('proj')}`,
    metadata: overrides.metadata,
  }),
  conversation: (projectId: string, overrides: { title?: string } = {}) => ({
    projectId,
    title: overrides.title ?? `Test Conversation ${generateId('conv')}`,
  }),
  turn: (
    projectId: string,
    conversationId: string,
    overrides: { role?: 'user' | 'assistant' | 'system' | 'tool'; content?: string } = {}
  ) => ({
    projectId,
    conversationId,
    role: overrides.role ?? 'user',
    content: overrides.content ?? `Test message ${generateId('msg')}`,
  }),
};
