/**
 * Database connection management for standalone API
 *
 * Supports two modes:
 * - PostgreSQL: When DATABASE_URL is set (Docker/production)
 * - PGLite: Local development fallback
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
  } else {
    // Fall back to PGLite for local development
    // Note: File mode may have issues with Node 23, use Node 20 LTS if problems occur
    const inMemory = process.env.T3X_IN_MEMORY === 'true';
    // Use same default path as WebUI for data sharing
    const dataDir = process.env.T3X_DATA_DIR || '.t3x/database';
    pinoLogger.info({ data_dir: dataDir, in_memory: inMemory }, 'using PGLite');
    const { createPGLiteStorage, closePGLiteStorage } = await import('@t3x-dev/storage');
    db = await createPGLiteStorage({ dataDir, inMemory });
    closeFunction = closePGLiteStorage;
  }

  return db;
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
