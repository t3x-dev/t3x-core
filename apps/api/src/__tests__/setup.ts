/**
 * Test Setup for Hono API
 *
 * Creates an isolated embedded PostgreSQL database for each test file.
 */

import {
  closePostgresStorage,
  createPostgresStorage,
  type AnyDB,
} from '@t3x-dev/storage';
import { afterAll, beforeAll, vi } from 'vitest';
import postgres from 'postgres';

// Import CREATE_TABLES_SQL from storage test setup
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

let testDB: AnyDB | null = null;
let testDbName: string | null = null;

export async function setupTestDB(): Promise<{
  db: AnyDB;
  /** Raw postgres.js Sql for direct SQL execution in tests */
  sql: postgres.Sql;
  cleanup: () => Promise<void>;
}> {
  const dbName = `test_${Math.random().toString(36).substring(2, 10)}`;
  testDbName = dbName;

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

beforeAll(async () => {
  const setup = await setupTestDB();
  testDB = setup.db;

  vi.mock('../lib/db', () => ({
    getDB: vi.fn(() => Promise.resolve(testDB)),
    closeDB: vi.fn(() => Promise.resolve()),
  }));
});

afterAll(async () => {
  if (testDB && testDbName) {
    await closePostgresStorage();
    const dropSql = postgres(getAdminUrl(), { max: 1 });
    try {
      await dropSql.unsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${testDbName}' AND pid <> pg_backend_pid()`
      );
      await dropSql.unsafe(`DROP DATABASE IF EXISTS "${testDbName}"`);
    } finally {
      await dropSql.end();
    }
    testDB = null;
    testDbName = null;
  }
});

export { testDB };
