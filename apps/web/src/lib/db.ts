/**
 * Database Singleton
 *
 * Server-side only database connection using @t3x/storage.
 *
 * Environment detection:
 * - DATABASE_URL set → PostgreSQL (Docker/production)
 * - DATABASE_URL not set → PGLite (local development)
 */

import type { PGlite } from '@electric-sql/pglite';
import type { AnyDB } from '@t3x/storage';

let dbInstance: AnyDB | null = null;
let initPromise: Promise<AnyDB> | null = null;
let getPGLiteClientFn: (() => PGlite) | null = null;
let closeDbFn: (() => Promise<void>) | null = null;
let shutdownRegistered = false;

/**
 * Get the database instance (initializes on first call)
 */
export async function getDB(): Promise<AnyDB> {
  // Return existing instance
  if (dbInstance) {
    return dbInstance;
  }

  // Wait for ongoing initialization
  if (initPromise) {
    return initPromise;
  }

  // Initialize new instance
  initPromise = initializeDB();
  return initPromise;
}

async function initializeDB(): Promise<AnyDB> {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    // Docker/production: Use PostgreSQL
    console.log('[db] Using PostgreSQL:', databaseUrl.replace(/:[^:@]+@/, ':****@'));
    const { createPostgresStorage, closePostgresStorage } = await import('@t3x/storage');
    dbInstance = await createPostgresStorage({ connectionString: databaseUrl });
    closeDbFn = closePostgresStorage;
    console.log('[db] PostgreSQL initialized');
  } else {
    // Local development: Use PGLite
    const dataDir = process.env.T3X_DATA_DIR || '.t3x/database';
    console.log('[db] Using PGLite:', dataDir);
    const { createPGLiteStorage, getPGLiteClient, closePGLiteStorage } = await import(
      '@t3x/storage/pglite'
    );
    dbInstance = await createPGLiteStorage({ dataDir });
    getPGLiteClientFn = getPGLiteClient;
    closeDbFn = closePGLiteStorage;
    console.log('[db] PGLite initialized');
  }

  // Register graceful shutdown so PGLite closes cleanly on SIGINT/SIGTERM.
  // Without this, killing the Next.js process corrupts the WASM database.
  if (!shutdownRegistered && typeof process?.on === 'function') {
    shutdownRegistered = true;
    const onSignal = async () => {
      console.log('[db] Shutting down, closing database...');
      await closeDB();
      process.exit(0);
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
  }

  return dbInstance;
}

/**
 * Get raw PGLite client for direct SQL execution (dev tools only)
 * Only available when using PGLite (local development).
 * Must call getDB() first to ensure initialization.
 */
export function getRawClient(): PGlite {
  if (!getPGLiteClientFn) {
    throw new Error(
      'PGLite client not available. Either database not initialized or using PostgreSQL.'
    );
  }
  return getPGLiteClientFn();
}

/**
 * Close database connection (for graceful shutdown)
 */
export async function closeDB(): Promise<void> {
  if (closeDbFn) {
    await closeDbFn();
    closeDbFn = null;
  }
  dbInstance = null;
  initPromise = null;
  getPGLiteClientFn = null;
}
