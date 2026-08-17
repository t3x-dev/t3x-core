/**
 * Project Access Middleware
 *
 * Thin HTTP adapter for routes carrying an explicit projectId. Authority is
 * owned exclusively by the canonical evaluator in lib/project-access.
 */

import type { Context, Next } from 'hono';
import { getDB } from '../lib/db';
import { assertProjectAccess } from '../lib/project-access';

export async function projectAccessMiddleware(c: Context, next: Next) {
  const projectId = c.req.param('projectId');
  if (!projectId) return next();

  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;

  return next();
}
