/**
 * Project Access Middleware
 *
 * Thin HTTP adapter for routes carrying an explicit projectId. Authority is
 * owned exclusively by the canonical evaluator in lib/project-access.
 */

import type { Context, Next } from 'hono';
import { getDB } from '../lib/db';
import { createError } from '../lib/errors';
import {
  assertProjectAccess,
  assertProjectAccessIncludingDeleted,
  assertProjectEditAndRead,
  assertProjectReadWithEditPermission,
} from '../lib/project-access';
import {
  isPendingSchemaRead,
  isProjectDetailRead,
  isSchemaPreviewRead,
  timeRepositoryRead,
} from '../lib/repository-read-timing';
import { findProjectRouteAction } from '../lib/route-action-policy';
import type { AppEnv } from '../types';

export async function projectAccessMiddleware(c: Context<AppEnv>, next: Next) {
  const projectId = c.req.param('projectId');
  if (!projectId) return next();

  const action = findProjectRouteAction(c.req.method, c.req.path);
  if (!action) return c.json(createError('NOT_FOUND', 'Route not found'), 404);
  const db = await getDB();
  if (action === 'project:read' && isProjectDetailRead(c)) {
    const access = await timeRepositoryRead(c, 'project_access', () =>
      assertProjectReadWithEditPermission(c, db, projectId)
    );
    if (access instanceof Response) return access;
    c.set('repositoryReadAccess', {
      projectId,
      canEdit: access.canEdit === true,
      canManageAgentAccess: access.canManageAgentAccess === true,
      project: access.project,
    });
    return next();
  }
  if (action === 'project:edit' && isSchemaPreviewRead(c)) {
    const access = await timeRepositoryRead(c, 'project_access', () =>
      assertProjectEditAndRead(c, db, projectId)
    );
    if (access instanceof Response) return access;
    c.set('repositoryReadAccess', { projectId });
    return next();
  }
  // The application gate must use the same lifecycle lookup as the handlers.
  // Include deleted rows only for these exact operations, while still applying
  // canonical management authority. Query flags must not enable ordinary reads
  // or nested operations on deleted repositories.
  const includeDeleted =
    (c.req.method === 'POST' && action === 'project:restore') ||
    (action === 'project:delete' && c.req.query('permanent') === 'true');
  const access = includeDeleted
    ? await assertProjectAccessIncludingDeleted(c, db, projectId)
    : await timeRepositoryRead(c, 'project_access', () => assertProjectAccess(c, db, projectId));
  if (access instanceof Response) return access;

  if (action === 'project:read' && isPendingSchemaRead(c)) {
    c.set('repositoryReadAccess', { projectId });
  }
  return next();
}
