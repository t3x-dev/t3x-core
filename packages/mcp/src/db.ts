/**
 * Database connection management for MCP server
 *
 * Supports two modes (in priority order):
 * 1. PostgreSQL: When DATABASE_URL is set (Docker/production)
 * 2. Embedded PostgreSQL: Default for local development (crash-safe)
 */
import type { AnyDB } from '@t3x-dev/storage';

let db: AnyDB | null = null;
let initPromise: Promise<AnyDB> | null = null;
let closeFunction: (() => Promise<void>) | null = null;

export async function getDB(): Promise<AnyDB> {
  if (db) return db;
  if (initPromise) return initPromise;
  initPromise = initializeDB();
  return initPromise;
}

async function initializeDB(): Promise<AnyDB> {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    const { createPostgresStorage, closePostgresStorage } = await import('@t3x-dev/storage');
    db = await createPostgresStorage({ connectionString: databaseUrl });
    closeFunction = closePostgresStorage;
  } else {
    const dataDir = process.env.T3X_DATA_DIR || '.t3x/pg-data';
    const port = parseInt(process.env.T3X_PG_PORT || '', 10) || 5445;
    const { createEmbeddedStorage, closeEmbeddedStorage } = await import(
      '@t3x-dev/storage/embedded'
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
