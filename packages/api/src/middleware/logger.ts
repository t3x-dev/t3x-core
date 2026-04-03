/**
 * Structured Request Logging Middleware (Pino)
 *
 * Replaces Hono's built-in logger with Pino structured logging.
 * - Dev: pino-pretty with colorize
 * - Prod: raw JSON (machine-readable)
 *
 * Log format: { level, time, req_id, method, path, status, latency_ms }
 * Env: LOG_LEVEL (default: 'info')
 */

import { createMiddleware } from 'hono/factory';
import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const pinoLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  }),
});

export const loggerMiddleware = createMiddleware(async (c, next) => {
  const start = Date.now();
  await next();
  const latencyMs = Date.now() - start;

  const reqId = c.get('requestId') as string | undefined;
  const status = c.res.status;
  const method = c.req.method;
  const path = c.req.path;

  const logData = {
    req_id: reqId,
    method,
    path,
    status,
    latency_ms: latencyMs,
  };

  if (status >= 500) {
    pinoLogger.error(logData, `${method} ${path} ${status}`);
  } else if (status >= 400) {
    pinoLogger.warn(logData, `${method} ${path} ${status}`);
  } else {
    pinoLogger.info(logData, `${method} ${path} ${status}`);
  }
});
