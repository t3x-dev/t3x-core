/**
 * T3X Standalone API Server — Thin Launcher
 *
 * Loads environment variables, imports createApp from @t3x-dev/api, starts the server.
 * All route/middleware assembly lives in packages/api (the @t3x-dev/api package).
 */

import fs from 'node:fs';
import path from 'node:path';
import { serve } from '@hono/node-server';
import {
  closeDB,
  createApp,
  getDB,
  pinoLogger,
  startTimeoutChecker,
  stopTimeoutChecker,
} from '@t3x-dev/api';

function loadEnvLocal(): void {
  // Load env from monorepo root (unified config)
  // Supports running from root (pnpm dev:api) or from apps/api directory
  const cwd = process.cwd();
  const isInAppsApi = cwd.endsWith('apps/api') || cwd.endsWith('apps\\api');
  const rootDir = isInAppsApi ? path.resolve(cwd, '../..') : cwd;

  const candidates = [path.resolve(rootDir, '.env.local'), path.resolve(rootDir, '.env')];

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;

    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const equalsIndex = trimmed.indexOf('=');
      if (equalsIndex === -1) continue;
      const key = trimmed.slice(0, equalsIndex).trim();
      let value = trimmed.slice(equalsIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      // Only set if not already defined (first found wins)
      if (!key || process.env[key] !== undefined) continue;
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

// Log environment status early (for debugging env loading issues)
pinoLogger.info(
  {
    node_env: process.env.NODE_ENV || 'not set',
    auth_disabled: process.env.AUTH_DISABLED || 'not set',
    database: process.env.DATABASE_URL ? 'PostgreSQL' : 'Embedded PostgreSQL (local)',
    anthropic_key: process.env.ANTHROPIC_API_KEY ? 'configured' : 'not set',
    google_ai_key: process.env.GOOGLE_AI_STUDIO_KEY ? 'configured' : 'not set',
    runner_url: process.env.RUNNER_BASE_URL || 'not set',
  },
  'Environment loaded'
);

// Register graceful shutdown BEFORE server start — ensures handlers exist
// even if the process is killed during initialization.
// Note: The storage layer also registers its own shutdown handlers as a safety net,
// so database closure is guaranteed even if these don't fire.
const shutdown = async () => {
  pinoLogger.info('Shutting down...');
  stopTimeoutChecker();
  await closeDB();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Open-source: built-in local auth (username/password)
const { app, injectWebSocket } = createApp();

// Server startup
const port = parseInt(process.env.PORT || '8000', 10);

async function start() {
  try {
    pinoLogger.info('Initializing database...');
    await getDB();
    pinoLogger.info('Database initialized');

    // Start background tasks
    startTimeoutChecker();

    const server = serve({
      fetch: app.fetch,
      port,
    });

    // Enable WebSocket connections on the HTTP server
    injectWebSocket(server);

    pinoLogger.info(
      { port, url: `http://localhost:${port}`, ws: `ws://localhost:${port}/ws` },
      'T3X API server running'
    );

    return server;
  } catch (error) {
    pinoLogger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

start();

export { app };
