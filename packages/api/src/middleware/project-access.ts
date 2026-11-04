/**
 * Project Access Middleware
 *
 * Thin HTTP adapter for routes carrying an explicit projectId. Authority is
 * owned exclusively by the canonical evaluator in lib/project-access.
 */

import type { Context, Next } from 'hono';
import { getDB } from '../lib/db';
import { createError } from '../lib/errors';
import { assertProjectAccess, assertProjectAccessIncludingDeleted } from '../lib/project-access';
import { findProjectRouteAction } from '../lib/route-action-policy';

export async function projectAccessMiddleware(c: Context, next: Next) {
  const projectId = c.req.param('projectId');
  if (!projectId) return next();

  const action = findProjectRouteAction(c.req.method, c.req.path);
  if (!action) return c.json(createError('NOT_FOUND', 'Route not found'), 404);
  const db = await getDB();
  // The application gate must use the same lifecycle lookup as the handlers.
  // Include deleted rows only for these exact operations, while still applying
  // canonical management authority. Query flags must not enable ordinary reads
  // or nested operations on deleted repositories.
  const includeDeleted =
    (c.req.method === 'POST' && action === 'project:restore') ||
    (action === 'project:delete' && c.req.query('permanent') === 'true');
  const access = includeDeleted
    ? await assertProjectAccessIncludingDeleted(c, db, projectId)
    : await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;

  return next();
}
