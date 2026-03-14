/**
 * Vitest Global Setup — Embedded PostgreSQL for storage tests
 *
 * Starts one embedded-postgres instance before all test files run.
 * If DATABASE_URL is set, skips (CI uses Docker PG).
 * If the port is already in use, skips (reuse existing instance).
 *
 * Export convention required by Vitest globalSetup:
 *   export async function setup(): Promise<void>
 *   export async function teardown(): Promise<void>
 */

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const TEST_PORT = parseInt(process.env.T3X_TEST_PG_PORT || '5446', 10);
const DATA_DIR = '.t3x/test-pg-data';
const PASSWORD = 'password';

let pg: InstanceType<typeof EmbeddedPostgres> | null = null;
let ownsProcess = false;

/**
 * Check if a port is already in use.
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
 * Resolve DATA_DIR to an absolute path at the monorepo root.
 * Walks up the directory tree looking for pnpm-workspace.yaml.
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

export async function setup(): Promise<void> {
  // If DATABASE_URL is set, CI is providing a real PG — skip embedded startup
  if (process.env.DATABASE_URL) {
    console.log('[globalSetup] DATABASE_URL set — using external PostgreSQL');
    return;
  }

  const alreadyRunning = await isPortInUse(TEST_PORT);
  if (alreadyRunning) {
    console.log(`[globalSetup] Port ${TEST_PORT} already in use — reusing existing instance`);
    return;
  }

  const absoluteDataDir = resolveDataDir(DATA_DIR);

  pg = new EmbeddedPostgres({
    databaseDir: absoluteDataDir,
    port: TEST_PORT,
    user: 'postgres',
    password: PASSWORD,
    persistent: true,
  });

  // initialise() downloads binary on first run and creates data cluster.
  // On subsequent runs the data directory already exists and initialise() throws.
  try {
    await pg.initialise();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
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

  console.log(`[globalSetup] Embedded PostgreSQL started on port ${TEST_PORT}`);
}

export async function teardown(): Promise<void> {
  if (pg && ownsProcess) {
    try {
      await pg.stop();
      console.log('[globalSetup] Embedded PostgreSQL stopped');
    } catch {
      // Ignore — process may already be stopped
    }
    pg = null;
    ownsProcess = false;
  }
}
