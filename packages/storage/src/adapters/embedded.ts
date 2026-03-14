/**
 * Embedded PostgreSQL Adapter
 *
 * Downloads and manages a real PostgreSQL binary for local development.
 * Delegates to the existing postgres adapter for Drizzle/schema operations.
 *
 * Advantages:
 * - Crash-safe: PostgreSQL WAL recovery handles ungraceful shutdowns
 * - Real PostgreSQL: No WASM quirks, full feature parity
 * - Independent process: Database survives Node.js crashes
 */

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { closePostgresStorage, createPostgresStorage, type PostgresDB } from './postgres';

const DEFAULT_PORT = 5445;
const DEFAULT_DATABASE = 't3x';
const DEFAULT_PASSWORD = 'password';

export interface EmbeddedConfig {
  /** Directory for PostgreSQL data (default: '.t3x/pg-data') */
  dataDir?: string;
  /** Port to run on (default: 5445) */
  port?: number;
  /** Database name (default: 't3x') */
  database?: string;
}

let pg: InstanceType<typeof EmbeddedPostgres> | null = null;
let rawClient: ReturnType<InstanceType<typeof EmbeddedPostgres>['getPgClient']> | null = null;
/** True if this process started the PostgreSQL instance (vs connecting to existing) */
let ownsProcess = false;
/** Connection params saved for creating standalone raw client when not owning the process */
let connectionPort = DEFAULT_PORT;
let connectionDatabase = DEFAULT_DATABASE;

/**
 * Check if a port is already in use (another embedded-postgres instance running).
 */
function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });
}

/**
 * Resolve the data directory to an absolute path at the monorepo root.
 * Walks up the directory tree looking for pnpm-workspace.yaml (monorepo root marker).
 */
function resolveDataDir(dataDir: string): string {
  if (path.isAbsolute(dataDir)) return dataDir;

  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return path.resolve(dir, dataDir);
    }
    dir = path.dirname(dir);
  }

  // Fallback to cwd if not in a pnpm monorepo
  return path.resolve(process.cwd(), dataDir);
}

/**
 * Create embedded PostgreSQL storage for local development.
 *
 * On first run, downloads the PostgreSQL binary (~70MB).
 * Subsequent runs reuse the cached binary and existing data.
 * If another instance is already running on the same port, connects to it.
 *
 * Shutdown is the responsibility of the consumer (call closeEmbeddedStorage()).
 * This adapter does NOT register its own signal handlers.
 */
export async function createEmbeddedStorage(config: EmbeddedConfig = {}): Promise<PostgresDB> {
  const port = config.port || parseInt(process.env.T3X_PG_PORT || '', 10) || DEFAULT_PORT;
  const database = config.database || DEFAULT_DATABASE;
  const dataDir = config.dataDir || '.t3x/pg-data';
  const absoluteDataDir = resolveDataDir(dataDir);

  // Save connection params for getEmbeddedRawClient
  connectionPort = port;
  connectionDatabase = database;

  // Check if PostgreSQL is already running on this port (e.g., another T3X process started it)
  const alreadyRunning = await isPortInUse(port);

  if (!alreadyRunning) {
    pg = new EmbeddedPostgres({
      databaseDir: absoluteDataDir,
      port,
      persistent: true,
    });

    // initialise() downloads binary on first run, creates data cluster.
    // On subsequent runs the data directory already exists and initialise() throws.
    try {
      await pg.initialise();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Only swallow "already exists" — re-throw real errors (permissions, disk full, download failure)
      if (!msg.includes('already') && !msg.includes('exist')) {
        throw err;
      }
    }

    // Clean stale lock file if PostgreSQL crashed previously
    const pidFile = path.join(absoluteDataDir, 'postmaster.pid');
    if (fs.existsSync(pidFile)) {
      try {
        const pidContent = fs.readFileSync(pidFile, 'utf8');
        const pid = parseInt(pidContent.split('\n')[0], 10);
        // Check if the process is actually running
        process.kill(pid, 0);
        // Process is running — let it be (shouldn't happen since port wasn't in use)
      } catch {
        // Process not running — remove stale lock file
        fs.unlinkSync(pidFile);
      }
    }

    await pg.start();
    ownsProcess = true;

    // Create application database (idempotent — "already exists" is expected)
    try {
      await pg.createDatabase(database);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('already exists')) {
        throw err;
      }
    }
  }

  // Delegate to existing postgres adapter via connection string
  const connectionString = `postgresql://postgres:${DEFAULT_PASSWORD}@localhost:${port}/${database}`;
  const db = await createPostgresStorage({ connectionString });

  return db;
}

/**
 * Get a raw pg.Client for direct SQL execution (dev tools).
 * Works both when this process owns PostgreSQL and when connecting to an existing instance.
 * Must call createEmbeddedStorage() first.
 */
export function getEmbeddedRawClient() {
  if (pg) {
    // Owner process — use embedded-postgres's built-in client
    if (!rawClient) {
      rawClient = pg.getPgClient();
    }
    return rawClient;
  }

  // Non-owner process (connecting to existing instance) — create standalone client.
  // pg is a transitive dependency of embedded-postgres, so require() is safe.
  if (!rawClient) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pg = require('pg');
    const client = new pg.Client({
      host: 'localhost',
      port: connectionPort,
      user: 'postgres',
      password: DEFAULT_PASSWORD,
      database: connectionDatabase,
    });
    rawClient = client;
  }
  return rawClient;
}

/**
 * Close the database connection and stop the embedded PostgreSQL process.
 */
export async function closeEmbeddedStorage(): Promise<void> {
  // Close Drizzle/postgres.js connection first
  await closePostgresStorage();

  // Disconnect raw client if used
  if (rawClient) {
    try {
      await (rawClient as { end?: () => Promise<void> }).end?.();
    } catch {
      // Ignore — process is stopping
    }
    rawClient = null;
  }

  // Stop PostgreSQL process (only if this process started it)
  if (pg && ownsProcess) {
    try {
      await pg.stop();
    } catch {
      // Ignore — process may already be stopped
    }
    pg = null;
    ownsProcess = false;
  }
}
