/**
 * Project Access Control
 *
 * Indirect ownership model: only projects have owner_id.
 * All sub-tables (conversations, commits, leaves, pins, runs)
 * inherit access through project_id — no owner_id on child tables.
 *
 * Access rules:
 * - Project not found → 404
 * - AUTH_DISABLED (no principal) → allow
 * - Machine principal with an exact project binding → allow
 * - Human principal matching project.owner_id → allow
 * - Legacy unowned projects require an explicit operator claim first
 * - Otherwise → 403
 */

import type { ApiKey, ApiKeyPrincipalKind } from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import {
  findProjectById,
  findProjectByIdIncludingDeleted,
  listTransitionCommitProjectIds,
} from '@t3x-dev/storage';
import type { Context } from 'hono';
import { createError } from './errors';

export interface ProjectAccessPrincipal {
  userId: string | null | undefined;
  projectId: string | null | undefined;
  principalKind: ApiKeyPrincipalKind | undefined;
}

export type ProjectAccessDecision =
  | { allowed: true; project: NonNullable<Awaited<ReturnType<typeof findProjectById>>> }
  | { allowed: false; status: 403 | 404; code: 'FORBIDDEN' | 'NOT_FOUND'; message: string };

/**
 * Resolve one project access decision without depending on HTTP middleware.
 * HTTP routes and raw-token entry points such as WebSocket upgrades must share
 * this exact ownership and project-scoped-principal policy.
 */
export async function evaluateProjectAccess(
  db: AnyDB,
  projectId: string,
  principal?: ProjectAccessPrincipal
): Promise<ProjectAccessDecision> {
  const project = await findProjectById(db, projectId);

  if (!project) {
    return {
      allowed: false,
      status: 404,
      code: 'NOT_FOUND',
      message: `Project ${projectId} not found`,
    };
  }

  // AUTH_DISABLED mode has no principal and intentionally preserves local,
  // single-user access to all projects.
  if (!principal) return { allowed: true, project };

  if (principal.principalKind !== undefined && principal.principalKind !== 'human') {
    // Machine credentials must always carry a concrete project boundary.
    // A global/null binding must not fall through to human/local rules.
    if (!principal.projectId || principal.projectId !== projectId) {
      return {
        allowed: false,
        status: 403,
        code: 'FORBIDDEN',
        message: 'Access denied',
      };
    }
    return { allowed: true, project };
  }

  if (!principal.userId || !project.ownerId || project.ownerId !== principal.userId) {
    return {
      allowed: false,
      status: 403,
      code: 'FORBIDDEN',
      message: 'Access denied',
    };
  }

  return { allowed: true, project };
}

/**
 * Assert that the current user has access to the given project.
 *
 * Returns the project on success; throws an HTTP error response on failure.
 * Downstream handlers can use the returned project to avoid a redundant DB lookup.
 */
export async function assertProjectAccess(c: Context, db: AnyDB, projectId: string) {
  const apiKey = c.get('apiKey') as ApiKey | undefined;
  const decision = await evaluateProjectAccess(
    db,
    projectId,
    apiKey && {
      userId: apiKey.user_id,
      projectId: apiKey.project_id,
      principalKind: apiKey.principal_kind,
    }
  );
  if (!decision.allowed) {
    return c.json(createError(decision.code, decision.message), decision.status);
  }
  return decision.project;
}

/**
 * Assert access to a resource whose project binding may be null.
 *
 * Authenticated callers must have a concrete project boundary. The current
 * identity model has no server-operator role that can safely own global child
 * resources, so null-project resources remain available only in the explicit
 * AUTH_DISABLED local-development mode.
 */
export async function assertResourceProjectAccess(
  c: Context,
  db: AnyDB,
  projectId: string | null | undefined
) {
  if (projectId) return assertProjectAccess(c, db, projectId);

  const apiKey = c.get('apiKey') as ApiKey | undefined;
  if (!apiKey) return null;

  return c.json(createError('FORBIDDEN', 'A project-scoped resource is required'), 403);
}

/**
 * Machine principals must not create new, unowned projects. The current
 * identity model has no server-operator role that can own such a project.
 * Human principals and AUTH_DISABLED local development may create.
 */
export function assertProjectCreationAccess(c: Context): Response | undefined {
  const apiKey = c.get('apiKey') as ApiKey | undefined;
  if (apiKey?.principal_kind !== undefined && apiKey.principal_kind !== 'human') {
    return c.json(createError('FORBIDDEN', 'Machine credentials cannot create projects'), 403);
  }
  return undefined;
}

/**
 * Resolve and authorize the project membership used to read one repository
 * commit. A digest can be bound to multiple projects, so callers without an
 * explicit project must fail closed instead of guessing a membership.
 */
export async function assertRepositoryCommitAccess(
  c: Context,
  db: AnyDB,
  digest: string,
  projectId?: string
): Promise<string | Response> {
  if (projectId) {
    const access = await assertProjectAccess(c, db, projectId);
    if (access instanceof Response) return access;

    const memberships = await listTransitionCommitProjectIds(db, digest);
    if (!memberships.includes(projectId)) {
      return c.json(createError('NOT_FOUND', `Commit ${digest} not found`), 404);
    }
    return projectId;
  }

  const memberships = await listTransitionCommitProjectIds(db, digest);
  if (memberships.length === 0) {
    return c.json(createError('NOT_FOUND', `Commit ${digest} not found`), 404);
  }
  if (memberships.length > 1) {
    return c.json(
      createError(
        'INVALID_REQUEST',
        `Commit ${digest} belongs to multiple projects; project_id is required`
      ),
      400
    );
  }

  const resolvedProjectId = memberships[0];
  const access = await assertProjectAccess(c, db, resolvedProjectId);
  if (access instanceof Response) return access;
  return resolvedProjectId;
}

/**
 * Assert access to a project that may be soft-deleted.
 * Used by restore and permanent-delete routes where `findProjectById()`
 * would return null for deleted projects.
 */
export async function assertProjectAccessIncludingDeleted(
  c: Context,
  db: AnyDB,
  projectId: string
) {
  const project = await findProjectByIdIncludingDeleted(db, projectId);

  if (!project) {
    return c.json(createError('NOT_FOUND', `Project ${projectId} not found`), 404);
  }

  const apiKey = c.get('apiKey') as ApiKey | undefined;
  if (!apiKey) return project;

  if (apiKey.principal_kind !== undefined && apiKey.principal_kind !== 'human') {
    if (!apiKey.project_id || apiKey.project_id !== projectId) {
      return c.json(createError('FORBIDDEN', 'Access denied'), 403);
    }
    return project;
  }
  const userId = apiKey.user_id;
  if (!userId || !project.ownerId || project.ownerId !== userId) {
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
