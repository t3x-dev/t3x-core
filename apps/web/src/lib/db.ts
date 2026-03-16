/**
 * Database Singleton
 *
 * Server-side only database connection using @t3x-dev/storage.
 *
 * Environment detection:
 * 1. DATABASE_URL set → PostgreSQL (Docker/production)
 * 2. Default → Connect to embedded PostgreSQL on port 5445
 *    (started by API server). Throws if not reachable.
 */

import type { AnyDB } from '@t3x-dev/storage';

let dbInstance: AnyDB | null = null;
let initPromise: Promise<AnyDB> | null = null;
let closeDbFn: (() => Promise<void>) | null = null;
let shutdownRegistered = false;

/**
 * Check if a TCP port is reachable (embedded PostgreSQL running).
 */
async function isPortReachable(port: number): Promise<boolean> {
  const net = await import('node:net');
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.connect(port, '127.0.0.1');
  });
}

/**
 * Get the database instance (initializes on first call)
 */
export async function getDB(): Promise<AnyDB> {
  if (dbInstance) {
    return dbInstance;
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
    // Docker/production: Use PostgreSQL
    console.log('[db] Using PostgreSQL:', databaseUrl.replace(/:[^:@]+@/, ':****@'));
    const { createPostgresStorage, closePostgresStorage } = await import('@t3x-dev/storage');
    dbInstance = await createPostgresStorage({ connectionString: databaseUrl });
    closeDbFn = closePostgresStorage;
    console.log('[db] PostgreSQL initialized');
  } else {
    // Default: Connect to embedded PostgreSQL (started by API server).
    // WebUI does NOT manage the embedded-postgres process — the API owns that.
    // This avoids importing embedded-postgres which has platform-specific binaries
    // that break Next.js Turbopack bundling.
    const port = parseInt(process.env.T3X_PG_PORT || '', 10) || 5445;
    const embeddedRunning = await isPortReachable(port);

    if (embeddedRunning) {
      // Connect to embedded PostgreSQL via standard postgres adapter
      const connectionString = `postgresql://postgres:password@localhost:${port}/t3x`;
      console.log('[db] Connecting to embedded PostgreSQL on port', port);
      const { createPostgresStorage, closePostgresStorage } = await import('@t3x-dev/storage');
      dbInstance = await createPostgresStorage({ connectionString });
      closeDbFn = closePostgresStorage;
      console.log('[db] Connected to embedded PostgreSQL');
    } else {
      throw new Error(
        `Cannot connect to database on port ${port}. Start the API server first: pnpm dev:api`
      );
    }
  }

  // Register graceful shutdown
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
 * Execute raw SQL via the Drizzle db instance.
 * Uses dynamic import of drizzle-orm's sql.raw() and casts through
 * unknown to avoid type mismatch when multiple drizzle-orm resolutions
 * exist in the monorepo (different postgres peer dep versions).
 */
export async function executeRawSQL(query: string): Promise<Record<string, unknown>[]> {
  const db = await getDB();
  const { sql } = await import('drizzle-orm');
  // Cast through unknown to handle duplicate drizzle-orm type declarations
  const result = await (db as unknown as { execute: (q: unknown) => Promise<unknown[]> }).execute(
    sql.raw(query)
  );
  return Array.from(result as unknown[]) as Record<string, unknown>[];
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
}
