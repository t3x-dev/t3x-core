/**
 * Database connection management for standalone API
 *
 * Supports three modes (in priority order):
 * 1. PostgreSQL: When DATABASE_URL is set (Docker/production)
 * 2. Embedded PostgreSQL: Default for local development (crash-safe)
 * 3. PGLite: When T3X_USE_PGLITE=true (in-memory testing only)
 */
import type { AnyDB } from '@t3x-dev/storage';
import { pinoLogger } from '../middleware/logger';

let db: AnyDB | null = null;
let initPromise: Promise<AnyDB> | null = null;
let closeFunction: (() => Promise<void>) | null = null;

/**
 * Get or create the database instance
 */
export async function getDB(): Promise<AnyDB> {
  if (db) {
    return db;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = initializeDB();
  return initPromise;
}

async function initializeDB(): Promise<AnyDB> {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    // Use PostgreSQL for Docker/production
    pinoLogger.info({ url: databaseUrl.replace(/:[^:@]+@/, ':****@') }, 'using PostgreSQL');
    const { createPostgresStorage, closePostgresStorage } = await import('@t3x-dev/storage');
    db = await createPostgresStorage({ connectionString: databaseUrl });
    closeFunction = closePostgresStorage;
  } else if (process.env.T3X_USE_PGLITE === 'true') {
    // Explicit PGLite mode (for in-memory testing)
    const inMemory = process.env.T3X_IN_MEMORY === 'true';
    const dataDir = process.env.T3X_DATA_DIR || '.t3x/database';
    pinoLogger.info({ data_dir: dataDir, in_memory: inMemory }, 'using PGLite');
    const { createPGLiteStorage, closePGLiteStorage } = await import('@t3x-dev/storage');
    db = await createPGLiteStorage({ dataDir, inMemory });
    closeFunction = closePGLiteStorage;
  } else {
    // Default: Embedded PostgreSQL (crash-safe local development)
    // Import from dedicated entry point — main @t3x-dev/storage does not export
    // embedded adapter to avoid pulling platform-specific binaries into bundlers.
    const dataDir = process.env.T3X_DATA_DIR || '.t3x/pg-data';
    const port = parseInt(process.env.T3X_PG_PORT || '', 10) || 5445;
    pinoLogger.info({ data_dir: dataDir, port }, 'using embedded PostgreSQL');
    const { createEmbeddedStorage, closeEmbeddedStorage } = await import(
      '@t3x-dev/storage/embedded'
    );
    db = await createEmbeddedStorage({ dataDir, port });
    closeFunction = closeEmbeddedStorage;
  }

  return db!;
}

/**
 * Close database connection (for graceful shutdown)
 */
export async function closeDB(): Promise<void> {
  if (closeFunction) {
    await closeFunction();
    closeFunction = null;
  }
  db = null;
  initPromise = null;
}
