/**
 * Project Access Middleware
 *
 * Thin HTTP adapter for routes carrying an explicit projectId. Authority is
 * owned exclusively by the canonical evaluator in lib/project-access.
 */

import type { Context, Next } from 'hono';
import { getDB } from '../lib/db';
import {
  assertProjectAccess,
  assertProjectAccessIncludingDeleted,
  projectActionForRequest,
} from '../lib/project-access';

export async function projectAccessMiddleware(c: Context, next: Next) {
  const projectId = c.req.param('projectId');
  if (!projectId) return next();

  const db = await getDB();
  const action = projectActionForRequest(c);
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
