/**
 * Database connection management for standalone API
 *
 * Supports two modes (in priority order):
 * 1. PostgreSQL: When DATABASE_URL is set (Docker/production)
 * 2. Embedded PostgreSQL: Default for local development (crash-safe)
 */
import type { AnyDB } from '@t3x-dev/storage';
import { pinoLogger } from '../middleware/logger';

let db: AnyDB | null = null;
let initPromise: Promise<AnyDB> | null = null;
let closeFunction: (() => Promise<void>) | null = null;

function unwrapStorageModule<T extends Record<string, unknown>>(mod: T): T {
  return ((mod as { default?: T }).default ?? mod) as T;
}

export async function getDB(): Promise<AnyDB> {
  if (db) return db;
  if (initPromise) return initPromise;
  initPromise = initializeDB();
  return initPromise;
}

async function initializeDB(): Promise<AnyDB> {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    pinoLogger.info({ url: databaseUrl.replace(/:[^:@]+@/, ':****@') }, 'using PostgreSQL');
    const { createPostgresStorage, closePostgresStorage } = unwrapStorageModule(
      await import('@t3x-dev/storage')
    );
    db = await createPostgresStorage({ connectionString: databaseUrl });
    closeFunction = closePostgresStorage;
  } else {
    const dataDir = process.env.T3X_DATA_DIR || '.t3x/pg-data';
    const port = parseInt(process.env.T3X_PG_PORT || '', 10) || 5445;
    pinoLogger.info({ data_dir: dataDir, port }, 'using embedded PostgreSQL');
    const { createEmbeddedStorage, closeEmbeddedStorage } = unwrapStorageModule(
      await import('@t3x-dev/storage/embedded')
    );
    db = await createEmbeddedStorage({ dataDir, port });
    closeFunction = closeEmbeddedStorage;
  }

  return db!;
}

export async function closeDB(): Promise<void> {
  if (closeFunction) {
    await closeFunction();
    closeFunction = null;
  }
  db = null;
  initPromise = null;
}
