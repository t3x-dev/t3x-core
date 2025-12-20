/**
 * Database Singleton
 *
 * Server-side only database connection using @t3x/storage.
 * Uses PGLite for local development.
 */

import { createPGLiteStorage, type AnyDB } from '@t3x/storage';

let dbInstance: AnyDB | null = null;
let initPromise: Promise<AnyDB> | null = null;

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
  initPromise = (async () => {
    const dataDir = process.env.T3X_DATA_DIR || '.t3x/database';
    console.log(`[db] Initializing PGLite storage at: ${dataDir}`);

    dbInstance = await createPGLiteStorage({ dataDir });
    console.log('[db] Database initialized');

    return dbInstance;
  })();

  return initPromise;
}
