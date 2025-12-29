/**
 * Test Setup for Hono API
 *
 * Creates an isolated PGLite database for each test file.
 */

import { closePGLiteStorage, createPGLiteStorage, type PGLiteDB } from '@t3x/storage/pglite';
import { afterAll, beforeAll, vi } from 'vitest';

// Global test database
let testDB: PGLiteDB | null = null;

/**
 * Create a fresh test database
 */
export async function setupTestDB(): Promise<{ db: PGLiteDB; cleanup: () => Promise<void> }> {
  // Create in-memory database for tests
  const db = await createPGLiteStorage({ inMemory: true });

  const cleanup = async () => {
    await closePGLiteStorage();
  };

  return { db, cleanup };
}

/**
 * Generate unique test IDs
 */
export function generateId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Test data factory
 */
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

// Setup mock for database module
beforeAll(async () => {
  const setup = await setupTestDB();
  testDB = setup.db;

  // Mock the database module
  vi.mock('../lib/db', () => ({
    getDB: vi.fn(() => Promise.resolve(testDB)),
    closeDB: vi.fn(() => Promise.resolve()),
  }));
});

afterAll(async () => {
  if (testDB) {
    await closePGLiteStorage();
    testDB = null;
  }
});

export { testDB };
