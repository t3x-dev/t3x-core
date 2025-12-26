/**
 * Database connection management for standalone API
 *
 * Supports two modes:
 * - PostgreSQL: When DATABASE_URL is set (Docker/production)
 * - PGLite: Local development fallback
 */
import type { AnyDB } from '@t3x/storage';

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
    console.log('[DB] Using PostgreSQL:', databaseUrl.replace(/:[^:@]+@/, ':****@'));
    const { createPostgresStorage, closePostgresStorage } = await import('@t3x/storage');
    db = await createPostgresStorage({ connectionString: databaseUrl });
    closeFunction = closePostgresStorage;
  } else {
    // Fall back to PGLite for local development
    const dataDir = process.env.T3X_DATA_DIR || './.t3x/data';
    console.log('[DB] Using PGLite:', dataDir);
    const { createPGLiteStorage, closePGLiteStorage } = await import('@t3x/storage');
    db = await createPGLiteStorage({ dataDir });
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
