/**
 * Health Routes
 *
 * GET /health - Liveness probe (no DB check)
 * GET /ready  - Readiness probe (verifies DB connectivity)
 */
import { Hono } from 'hono';
import { findProjects } from '@t3x/storage/pglite';
import { getDB } from '../lib/db';

const startTime = Date.now();

export const healthRoutes = new Hono();

/**
 * GET /health - Liveness probe
 *
 * Always returns 200 if the process is alive. No dependency checks.
 */
healthRoutes.get('/health', (c) => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  return c.json({
    success: true,
    data: {
      status: 'ok',
      version: '1.0.0',
      uptime: uptimeSeconds,
    },
  });
});

/**
 * GET /ready - Readiness probe
 *
 * Verifies that the database is reachable via a simple query.
 * Returns 200 on success, 503 if the database is unavailable.
 */
healthRoutes.get('/ready', async (c) => {
  try {
    const db = await getDB();
    // Run a trivial query to verify DB connectivity
    await findProjects(db, { limit: 1, offset: 0 });
    return c.json({
      success: true,
      data: {
        status: 'ready',
        checks: {
          database: 'ok',
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database check failed';
    return c.json(
      {
        success: false,
        error: {
          code: 'NOT_READY',
          message,
        },
      },
      503
    );
  }
});
