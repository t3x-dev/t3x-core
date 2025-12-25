/**
 * Database Singleton
 *
 * Server-side only database connection using @t3x/storage.
 * Uses PGLite for local development.
 *
 * NOTE: We use dynamic imports to avoid bundling postgres.js which has
 * binary data files that webpack cannot handle. Only PGLite is loaded
 * for local development.
 */

import type { PGlite } from '@electric-sql/pglite';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dbInstance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let initPromise: Promise<any> | null = null;
let getPGLiteClientFn: (() => PGlite) | null = null;

/**
 * Get the database instance (initializes on first call)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getDB(): Promise<any> {
  // Return existing instance
  if (dbInstance) {
    return dbInstance;
  }

  // Wait for ongoing initialization
  if (initPromise) {
    return initPromise;
  }

  // Initialize new instance
  initPromise = (async () => {
    const dataDir = process.env.T3X_DATA_DIR || '.t3x/database';
    console.log(`[db] Initializing PGLite storage at: ${dataDir}`);

    // Dynamic import from pglite-only entry point to avoid bundling postgres.js
    const { createPGLiteStorage, getPGLiteClient } = await import('@t3x/storage/pglite');
    dbInstance = await createPGLiteStorage({ dataDir });
    getPGLiteClientFn = getPGLiteClient;
    console.log('[db] Database initialized');

    return dbInstance;
  })();

  return initPromise;
}

/**
 * Get raw PGLite client for direct SQL execution (dev tools only)
 * Must call getDB() first to ensure initialization.
 */
export function getRawClient(): PGlite {
  if (!getPGLiteClientFn) {
    throw new Error('Database not initialized. Call getDB() first.');
  }
  return getPGLiteClientFn();
}
