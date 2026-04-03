/**
 * Project Access Middleware
 *
 * Gates all routes under /v1/projects/:projectId/* with ownership checks.
 * Uses the indirect ownership model: only projects have owner_id,
 * child resources inherit access through project_id.
 *
 * Access rules:
 * - AUTH_DISABLED (no userId) → allow all
 * - project.owner_id is NULL → allow (legacy public data)
 * - project.owner_id === userId → allow
 * - Otherwise → 403 Forbidden
 */

import type { ApiKey } from '@t3x-dev/core';
import { findProjectById } from '@t3x-dev/storage';
import type { Context, Next } from 'hono';
import { getDB } from '../lib/db';
import { createError } from '../lib/errors';

export async function projectAccessMiddleware(c: Context, next: Next) {
  // Extract projectId from route params (supports both :projectId and :id)
  const projectId = c.req.param('projectId') || c.req.param('id');
  if (!projectId) return next();

  const apiKey = c.get('apiKey') as ApiKey | undefined;
  const userId = apiKey?.user_id;

  // AUTH_DISABLED mode — no user identity, allow all
  if (!userId) return next();

  const db = await getDB();
  const project = await findProjectById(db, projectId);

  if (!project) {
    return c.json(createError('NOT_FOUND', `Project ${projectId} not found`), 404);
  }

  // Legacy public data — owner_id is null, allow all
  if (!project.ownerId) return next();

  // Ownership check
  if (project.ownerId !== userId) {
    return c.json(createError('FORBIDDEN', 'Access denied'), 403);
  }

  return next();
}
