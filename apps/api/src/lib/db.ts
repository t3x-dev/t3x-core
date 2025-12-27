/**
 * Database connection management for standalone API
 *
 * Uses PGLite for local development, can be swapped for PostgreSQL in production
 */
import {
  closePGLiteStorage,
  createPGLiteStorage,
  getPGLiteDB,
  type PGLiteDB,
} from '@t3x/storage/pglite';

let initPromise: Promise<PGLiteDB> | null = null;

/**
 * Get or create the database instance
 */
export async function getDB(): Promise<PGLiteDB> {
  if (initPromise) {
    return initPromise;
  }

  try {
    // Try to get existing DB first
    return getPGLiteDB();
  } catch {
    // Initialize if not already done
    initPromise = initializeDB();
    return initPromise;
  }
}

async function initializeDB(): Promise<PGLiteDB> {
  // Use file-based PGLite for persistence
  const dataDir = process.env.T3X_DATA_DIR || './.t3x/data';
  const db = await createPGLiteStorage({ dataDir });
  return db;
}

/**
 * Close database connection (for graceful shutdown)
 */
export async function closeDB(): Promise<void> {
  await closePGLiteStorage();
  initPromise = null;
}
