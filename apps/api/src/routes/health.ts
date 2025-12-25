/**
 * Health Route
 *
 * GET /health - Basic health check (at root, not under /api)
 */
import { Hono } from 'hono';

const startTime = Date.now();

export const healthRoutes = new Hono();

/**
 * GET /health - Basic health check
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
