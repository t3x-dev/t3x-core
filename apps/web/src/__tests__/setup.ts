/**
 * Test Setup for t3x-webui
 *
 * Provides isolated PostgreSQL database for API route tests.
 * Mocks the database singleton so API routes use test database.
 */

import { type AnyDB, closePostgresStorage, createPostgresStorage } from '@t3x-dev/storage';
import postgres from 'postgres';
import { vi } from 'vitest';

// Import shared SQL from @t3x-dev/storage test utilities
import { CREATE_TABLES_SQL } from '../../../../packages/storage/src/__tests__/setup';

const TEST_PORT = parseInt(process.env.T3X_TEST_PG_PORT || '', 10) || 5446;
const TEST_PASSWORD = 'password';

function getAdminUrl(): string {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = '/postgres';
    return url.toString();
  }
  return `postgresql://postgres:${TEST_PASSWORD}@localhost:${TEST_PORT}/postgres`;
}

function getDbUrl(dbName: string): string {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = `/${dbName}`;
    return url.toString();
  }
  return `postgresql://postgres:${TEST_PASSWORD}@localhost:${TEST_PORT}/${dbName}`;
}

// Shared test database instance
let testDB: AnyDB | null = null;

/**
 * Create a fresh test database
 */
export async function createTestDB(): Promise<{
  db: AnyDB;
  sql: postgres.Sql;
  cleanup: () => Promise<void>;
}> {
  const dbName = `test_web_${Math.random().toString(36).substring(2, 10)}`;

  // Create isolated test database
  const adminSql = postgres(getAdminUrl(), { max: 1 });
  await adminSql.unsafe(`CREATE DATABASE "${dbName}"`);
  await adminSql.end();

  // Initialize schema
  const connectionString = getDbUrl(dbName);
  const setupSql = postgres(connectionString, { max: 1 });
  await setupSql.unsafe(CREATE_TABLES_SQL);
  await setupSql.end();

  // Keep a raw sql connection for tests that need direct SQL access
  const rawSql = postgres(connectionString, { max: 5 });

  // Create Drizzle instance
  const db = await createPostgresStorage({ connectionString });

  // Cleanup function
  const cleanup = async () => {
    await closePostgresStorage();
    await rawSql.end();

    const dropSql = postgres(getAdminUrl(), { max: 1 });
    try {
      await dropSql.unsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}' AND pid <> pg_backend_pid()`
      );
      await dropSql.unsafe(`DROP DATABASE IF EXISTS "${dbName}"`);
    } finally {
      await dropSql.end();
    }
  };

  return { db, sql: rawSql, cleanup };
}

/**
 * Set up test database and mock getDB
 * Call this in beforeAll of each test file
 */
export async function setupTestDB(): Promise<{
  db: AnyDB;
  cleanup: () => Promise<void>;
}> {
  const { db, cleanup } = await createTestDB();
  testDB = db;

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
  vi.mock('@/infrastructure/db', () => ({
    getDB: vi.fn().mockResolvedValue(db),
  }));
}
