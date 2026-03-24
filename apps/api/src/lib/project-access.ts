/**
 * Project Access Control
 *
 * Indirect ownership model: only projects have owner_id.
 * All sub-tables (conversations, commits, leaves, pins, runs)
 * inherit access through project_id — no owner_id on child tables.
 *
 * Access rules:
 * - Project not found → 404
 * - AUTH_DISABLED (userId undefined) → allow
 * - project.owner_id is NULL → allow (legacy public data)
 * - project.owner_id === userId → allow
 * - Otherwise → 403
 */

import type { ApiKey } from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import { findProjectById } from '@t3x-dev/storage';
import type { Context } from 'hono';
import { createError } from './errors';

/**
 * Assert that the current user has access to the given project.
 *
 * Returns the project on success; throws an HTTP error response on failure.
 * Downstream handlers can use the returned project to avoid a redundant DB lookup.
 */
export async function assertProjectAccess(c: Context, db: AnyDB, projectId: string) {
  const project = await findProjectById(db, projectId);

  if (!project) {
    return c.json(createError('NOT_FOUND', `Project ${projectId} not found`), 404);
  }

  const apiKey = c.get('apiKey') as ApiKey | undefined;
  const userId = apiKey?.user_id;

  // AUTH_DISABLED mode — no user identity, allow all
  if (!userId) return project;

  // Legacy public data — owner_id is null, allow all
  if (!project.ownerId) return project;

  // Ownership check
  if (project.ownerId !== userId) {
    return c.json(createError('FORBIDDEN', 'Access denied'), 403);
  }

  return project;
}

/**
 * Extract the current user's ID from request context.
 * Returns undefined when AUTH_DISABLED (no API key / no user).
 */
export function getUserId(c: Context): string | undefined {
  const apiKey = c.get('apiKey') as ApiKey | undefined;
  return apiKey?.user_id ?? undefined;
}
