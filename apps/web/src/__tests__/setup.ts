/**
 * Test Setup for t3x-webui
 *
 * Provides isolated PGLite database for API route tests.
 * Mocks the database singleton so API routes use test database.
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { AnyDB } from '@t3x/storage';
import { vi } from 'vitest';

// Import schema tables for drizzle
import {
  projects,
  conversations,
  turns,
  branches,
  commits,
  drafts,
  mergeResults,
  segmentEmbeddings,
} from '@t3x/storage';

// Import shared SQL from @t3x/storage test utilities
import { CREATE_TABLES_SQL } from '../../../t3x-storage/src/__tests__/setup';

const schema = {
  projects,
  conversations,
  turns,
  branches,
  commits,
  drafts,
  mergeResults,
  segmentEmbeddings,
};

// Shared test database instance
let testDB: AnyDB | null = null;
let testClient: PGlite | null = null;

/**
 * Create a fresh test database
 */
export async function createTestDB(): Promise<{
  db: AnyDB;
  client: PGlite;
  cleanup: () => Promise<void>;
}> {
  // Create in-memory PGLite
  const client = new PGlite();

  // Create Drizzle instance
  const db = drizzle(client, { schema }) as unknown as AnyDB;

  // Create tables
  await client.exec(CREATE_TABLES_SQL);

  // Cleanup function
  const cleanup = async () => {
    await client.close();
  };

  return { db, client, cleanup };
}

/**
 * Set up test database and mock getDB
 * Call this in beforeAll of each test file
 */
export async function setupTestDB(): Promise<{
  db: AnyDB;
  cleanup: () => Promise<void>;
}> {
  const { db, client, cleanup } = await createTestDB();
  testDB = db;
  testClient = client;

  return { db, cleanup };
}

/**
 * Get the current test database
 */
export function getTestDB(): AnyDB {
  if (!testDB) {
    throw new Error('Test database not initialized. Call setupTestDB() in beforeAll');
  }
  return testDB;
}

/**
 * Create a mock NextRequest for testing API routes
 */
export function createMockRequest(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): Request {
  const { method = 'GET', body, headers = {} } = options;

  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (body && method !== 'GET') {
    init.body = JSON.stringify(body);
  }

  return new Request(url, init);
}

/**
 * Test data factories
 */
export const testData = {
  project: (overrides: Partial<{ name: string; description: string }> = {}) => ({
    name: overrides.name ?? 'Test Project',
    description: overrides.description ?? 'A test project',
  }),

  conversation: (projectId: string, overrides: Partial<{ title: string }> = {}) => ({
    projectId,
    title: overrides.title ?? 'Test Conversation',
  }),

  turn: (
    projectId: string,
    conversationId: string,
    overrides: Partial<{ role: 'user' | 'assistant' | 'system' | 'tool'; content: string }> = {}
  ) => ({
    projectId,
    conversationId,
    role: overrides.role ?? 'user',
    content: overrides.content ?? 'Hello, this is a test message.',
  }),
};

/**
 * Mock the database module
 */
export function mockDatabaseModule(db: AnyDB) {
  vi.mock('@/lib/db', () => ({
    getDB: vi.fn().mockResolvedValue(db),
  }));
}
