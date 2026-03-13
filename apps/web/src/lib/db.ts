/**
 * Database Singleton
 *
 * Server-side only database connection using @t3x-dev/storage.
 *
 * Environment detection:
 * 1. DATABASE_URL set → PostgreSQL (Docker/production)
 * 2. T3X_USE_PGLITE=true → PGLite (in-memory testing)
 * 3. Default → Try connecting to embedded PostgreSQL on port 5445
 *    (started by API server), fall back to PGLite if not available
 */

import type { AnyDB } from '@t3x-dev/storage';

let dbInstance: AnyDB | null = null;
let initPromise: Promise<AnyDB> | null = null;
let closeDbFn: (() => Promise<void>) | null = null;
let rawClientFn: (() => { query: (sql: string) => Promise<{ rows: unknown[]; fields?: unknown[] }> }) | null = null;
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
  } else if (process.env.T3X_USE_PGLITE === 'true') {
    // Explicit PGLite mode (for in-memory testing)
    const dataDir = process.env.T3X_DATA_DIR || '.t3x/database';
    console.log('[db] Using PGLite:', dataDir);
    const { createPGLiteStorage, getPGLiteClient, closePGLiteStorage } = await import(
      '@t3x-dev/storage/pglite'
    );
    dbInstance = await createPGLiteStorage({ dataDir });
    rawClientFn = getPGLiteClient;
    closeDbFn = closePGLiteStorage;
    console.log('[db] PGLite initialized');
  } else {
    // Default: Try connecting to embedded PostgreSQL (started by API server).
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
      // Fallback: PGLite (API not running, standalone WebUI mode)
      const dataDir = process.env.T3X_DATA_DIR || '.t3x/database';
      console.log('[db] Embedded PostgreSQL not found on port', port, '— falling back to PGLite:', dataDir);
      const { createPGLiteStorage, getPGLiteClient, closePGLiteStorage } = await import(
        '@t3x-dev/storage/pglite'
      );
      dbInstance = await createPGLiteStorage({ dataDir });
      rawClientFn = getPGLiteClient;
      closeDbFn = closePGLiteStorage;
      console.log('[db] PGLite initialized (fallback)');
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
 * Get raw database client for direct SQL execution (dev tools only).
 * Works with PGLite (getRawClient). For embedded PostgreSQL,
 * the dev SQL route can use the Drizzle instance directly.
 * Must call getDB() first to ensure initialization.
 */
export function getRawClient() {
  if (!rawClientFn) {
    throw new Error(
      'Raw client not available. Either database not initialized or using external PostgreSQL.'
    );
  }
  return rawClientFn();
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
  rawClientFn = null;
}
