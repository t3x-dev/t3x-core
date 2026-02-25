/**
 * Request ID Middleware
 *
 * Reads X-Request-Id header from incoming requests or generates a new one.
 * Sets the request ID on the context and response header.
 */
import { createMiddleware } from 'hono/factory';
import { nanoid } from 'nanoid';

export const requestIdMiddleware = createMiddleware(async (c, next) => {
  const requestId = c.req.header('X-Request-Id') || nanoid(12);
  c.set('requestId', requestId);
  await next();
  c.header('X-Request-Id', requestId);
});
