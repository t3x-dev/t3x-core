/**
 * Database connection management for standalone API
 *
 * Supports two modes (in priority order):
 * 1. PostgreSQL: When DATABASE_URL is set (Docker/production)
 * 2. Embedded PostgreSQL: Default for local development (crash-safe)
 */
import {
  type AnyDB,
  closePostgresStorage,
  createPostgresBootstrapStorage,
  createPostgresRuntimeStorage,
  getPostgresClient,
} from '@t3x-dev/storage';
import {
  closeEmbeddedStorage,
  createEmbeddedStorage,
  getEmbeddedPostgresClient,
} from '@t3x-dev/storage/embedded';
import { pinoLogger } from '../middleware/logger';

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
    const startupMode = process.env.T3X_POSTGRES_STARTUP_MODE || 'runtime';
    if (startupMode !== 'bootstrap' && startupMode !== 'runtime') {
      throw new Error(
        `Invalid T3X_POSTGRES_STARTUP_MODE=${startupMode}; expected "runtime" or "bootstrap"`
      );
    }
    pinoLogger.info(
      { url: databaseUrl.replace(/:[^:@]+@/, ':****@'), startup_mode: startupMode },
      'using PostgreSQL'
    );
    db = await (startupMode === 'bootstrap'
      ? createPostgresBootstrapStorage({ connectionString: databaseUrl })
      : createPostgresRuntimeStorage({ connectionString: databaseUrl }));
    closeFunction = closePostgresStorage;
  } else {
    const dataDir = process.env.T3X_DATA_DIR || '.t3x/pg-data';
    const port = parseInt(process.env.T3X_PG_PORT || '', 10) || 5445;
    pinoLogger.info({ data_dir: dataDir, port }, 'using embedded PostgreSQL');
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

/**
 * Return the postgres.js client from the same package entry point that getDB()
 * initialized. Bundled standalone runtimes contain separate root and embedded
 * storage entry points, so selecting explicitly preserves adapter singleton state.
 */
export function getRuntimePostgresClient() {
  return process.env.DATABASE_URL ? getPostgresClient() : getEmbeddedPostgresClient();
}
