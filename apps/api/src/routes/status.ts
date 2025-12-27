/**
 * Status Route
 *
 * GET /v1/status - Detailed status with DB check
 */

import { findProjects } from '@t3x/storage/pglite';
import { Hono } from 'hono';
import { getDB } from '../lib/db';
import { jsonError, jsonSuccess } from '../lib/response';

const startTime = Date.now();

export const statusRoutes = new Hono();

/**
 * GET /v1/status - Detailed status with DB check
 */
statusRoutes.get('/v1/status', async (c) => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  try {
    const db = await getDB();
    const projects = await findProjects(db, { limit: 1, offset: 0 });

    return jsonSuccess(c, {
      status: 'ok',
      version: '1.0.0',
      uptime: uptimeSeconds,
      database: 'connected',
      projects_count: projects.length > 0 ? 'available' : 'empty',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'STATUS_ERROR', message, 500);
  }
});
