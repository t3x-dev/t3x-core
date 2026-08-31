/**
 * Project Access Control
 *
 * Canonical authority model: projects belong to one namespace and current
 * namespace membership or an exact project grant authorizes the principal.
 * owner_id is historical provenance only.
 *
 * Access rules:
 * - Project not found → 404
 * - Explicit AUTH_DISABLED local mode → allow
 * - Authenticated principals load current stored membership/grant facts
 * - Machine credentials additionally require an exact project binding
 * - Otherwise → 403
 */

import {
  type CanonicalPrincipalDto,
  evaluateProjectAction,
  MEMBERSHIP_STATUSES,
  NAMESPACE_ROLES,
  type NamespaceMembershipDto,
  PRINCIPAL_KINDS,
  PROJECT_ACTIONS,
  PROJECT_GRANT_ROLES,
  type ProjectAction,
  type ProjectGrantDto,
  type TrustedNamespaceAuthorityFacts,
} from '@t3x-dev/application';
import type { ApiKey, ApiKeyPrincipalKind } from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import {
  findProjectAuthorityFacts,
  findProjectById,
  findProjectByIdIncludingDeleted,
  listTransitionCommitProjectIds,
  type NamespaceMembershipRecord,
  type ProjectGrantRecord,
  type StoredProjectAuthorityFacts,
} from '@t3x-dev/storage';
import type { Context } from 'hono';
import { isAuthenticationDisabled } from './auth-config';
import { createError, type ErrorCode } from './errors';

export interface ProjectAccessPrincipal {
  userId: string | null | undefined;
  projectId: string | null | undefined;
  principalKind: ApiKeyPrincipalKind | undefined;
  keyId?: string | null | undefined;
}

export type ProjectAccessDecision =
  | { allowed: true; project: NonNullable<Awaited<ReturnType<typeof findProjectById>>> }
  | { allowed: false; status: 403 | 404; code: 'FORBIDDEN' | 'NOT_FOUND'; message: string };

function includesValue<T extends string>(values: readonly T[], value: string): value is T {
  return values.includes(value as T);
}

function canonicalPrincipal(principal: ProjectAccessPrincipal): CanonicalPrincipalDto | null {
  const kind = principal.principalKind ?? 'human';
  if (!includesValue(PRINCIPAL_KINDS, kind)) return null;
  const principalId = kind === 'human' ? principal.userId : principal.keyId;
  return principalId ? { kind, principal_id: principalId } : null;
}

function membershipDto(record: NamespaceMembershipRecord | null): NamespaceMembershipDto | null {
  if (!record) return null;
  if (
    !includesValue(PRINCIPAL_KINDS, record.principalKind) ||
    !includesValue(NAMESPACE_ROLES, record.role) ||
    !includesValue(MEMBERSHIP_STATUSES, record.status)
  ) {
    return null;
  }
  return {
    membership_id: record.membershipId,
    namespace_id: record.namespaceId,
    principal: { kind: record.principalKind, principal_id: record.principalId },
    role: record.role,
    status: record.status,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
  };
}

function projectGrantDto(record: ProjectGrantRecord | null): ProjectGrantDto | null {
  if (!record) return null;
  if (
    !includesValue(PRINCIPAL_KINDS, record.principalKind) ||
    !includesValue(PROJECT_GRANT_ROLES, record.role) ||
    !includesValue(MEMBERSHIP_STATUSES, record.status)
  ) {
    return null;
  }
  return {
    grant_id: record.grantId,
    project_id: record.projectId,
    principal: { kind: record.principalKind, principal_id: record.principalId },
    role: record.role,
    status: record.status,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
    expires_at: record.expiresAt?.toISOString() ?? null,
  };
}

function trustedProjectAuthorityFacts(
  stored: StoredProjectAuthorityFacts,
  principal: CanonicalPrincipalDto,
  credential: ProjectAccessPrincipal
): TrustedNamespaceAuthorityFacts | null {
  if (!stored.project.namespaceId) return null;
  return {
    principal,
    project: {
      project_id: stored.project.projectId,
      namespace_id: stored.project.namespaceId,
    },
    namespace_membership: membershipDto(stored.namespaceMembership),
    project_grant: projectGrantDto(stored.projectGrant),
    evaluated_at: new Date().toISOString(),
    ...(credential.projectId
      ? { credential_scope: { project_id: credential.projectId, actions: PROJECT_ACTIONS } }
      : {}),
  };
}

async function evaluateProjectAccessFromFacts(
  db: AnyDB,
  projectId: string,
  principal: ProjectAccessPrincipal | undefined,
  action: ProjectAction,
  options: { includeDeleted?: boolean; allowLocalBypass?: boolean }
): Promise<ProjectAccessDecision> {
  if (!principal) {
    const project = await (options.includeDeleted
      ? findProjectByIdIncludingDeleted
      : findProjectById)(db, projectId);
    if (!project) {
      return {
        allowed: false,
        status: 404,
        code: 'NOT_FOUND',
        message: `Project ${projectId} not found`,
      };
    }
    return options.allowLocalBypass
      ? { allowed: true, project }
      : { allowed: false, status: 403, code: 'FORBIDDEN', message: 'Access denied' };
  }

  const trustedPrincipal = canonicalPrincipal(principal);
  if (!trustedPrincipal) {
    return { allowed: false, status: 403, code: 'FORBIDDEN', message: 'Access denied' };
  }

  const facts = await findProjectAuthorityFacts(db, {
    projectId,
    principal: { kind: trustedPrincipal.kind, principalId: trustedPrincipal.principal_id },
    includeDeleted: options.includeDeleted,
  });
  if (!facts) {
    return {
      allowed: false,
      status: 404,
      code: 'NOT_FOUND',
      message: `Project ${projectId} not found`,
    };
  }

  const authorityFacts = trustedProjectAuthorityFacts(facts, trustedPrincipal, principal);
  if (!authorityFacts) {
    return {
      allowed: false,
      status: 403,
      code: 'FORBIDDEN',
      message: 'Access denied',
    };
  }

  const decision = evaluateProjectAction(authorityFacts, action);
  if (!decision.allowed) {
    return {
      allowed: false,
      status: 403,
      code: 'FORBIDDEN',
      message: 'Access denied',
    };
  }

  return { allowed: true, project: facts.project };
}

/**
 * Resolve one project access decision without depending on HTTP middleware.
 * HTTP routes and raw-token entry points such as WebSocket upgrades must share
 * this exact ownership and project-scoped-principal policy.
 */
export async function evaluateProjectAccess(
  db: AnyDB,
  projectId: string,
  principal: ProjectAccessPrincipal | undefined,
  action: ProjectAction = 'project:read',
  options: { allowLocalBypass?: boolean } = {}
): Promise<ProjectAccessDecision> {
  return evaluateProjectAccessFromFacts(db, projectId, principal, action, options);
}

/** Resolve the same authority decision for restore and permanent-delete paths. */
export async function evaluateProjectAccessIncludingDeleted(
  db: AnyDB,
  projectId: string,
  principal: ProjectAccessPrincipal | undefined,
  action: ProjectAction,
  options: { allowLocalBypass?: boolean } = {}
): Promise<ProjectAccessDecision> {
  return evaluateProjectAccessFromFacts(db, projectId, principal, action, {
    ...options,
    includeDeleted: true,
  });
}

export function getProjectAccessPrincipal(c: Context): ProjectAccessPrincipal | undefined {
  const apiKey = c.get('apiKey') as ApiKey | undefined;
  if (!apiKey) return undefined;
  return {
    userId: apiKey.user_id,
    projectId: apiKey.project_id,
    principalKind: apiKey.principal_kind,
    keyId: apiKey.id,
  };
}

/** Resolve all server-authorized project actions from one stored-state read. */
export async function listAuthorizedProjectActions(
  c: Context,
  db: AnyDB,
  projectId: string
): Promise<ProjectAction[]> {
  const credential = getProjectAccessPrincipal(c);
  if (!credential) return isAuthenticationDisabled() ? [...PROJECT_ACTIONS] : [];

  const principal = canonicalPrincipal(credential);
  if (!principal) return [];
  const stored = await findProjectAuthorityFacts(db, {
    projectId,
    principal: { kind: principal.kind, principalId: principal.principal_id },
  });
  if (!stored) return [];
  const facts = trustedProjectAuthorityFacts(stored, principal, credential);
  if (!facts) return [];
  return PROJECT_ACTIONS.filter((action) => evaluateProjectAction(facts, action).allowed);
}

/** Principal shape used by tenant-safe project list queries. */
export function getProjectListAuthority(
  c: Context
): { principal_kind: 'human' | 'agent' | 'service'; principal_id: string } | undefined {
  const principal = getProjectAccessPrincipal(c);
  if (!principal) return undefined;
  const canonical = canonicalPrincipal(principal);
  return canonical
    ? { principal_kind: canonical.kind, principal_id: canonical.principal_id }
    : undefined;
}

/** Resolve a coarse project action from trusted route metadata, not request JSON. */
export function projectActionForRequest(c: Context): ProjectAction {
  const method = c.req.method.toUpperCase();
  const path = c.req.path;
  if (method === 'GET' || method === 'HEAD') return 'project:read';
  if (/\/(?:api\/)?v1\/projects\/[^/]+\/restore$/.test(path)) return 'project:restore';
  if (method === 'DELETE' && /\/(?:api\/)?v1\/projects\/[^/]+$/.test(path)) {
    return 'project:delete';
  }
  return 'project:edit';
}

/**
 * Assert that the current user has access to the given project.
 *
 * Returns the project on success; throws an HTTP error response on failure.
 * Downstream handlers can use the returned project to avoid a redundant DB lookup.
 */
export async function assertProjectAccess(
  c: Context,
  db: AnyDB,
  projectId: string,
  action: ProjectAction = projectActionForRequest(c)
) {
  const decision = await evaluateProjectAccess(
    db,
    projectId,
    getProjectAccessPrincipal(c),
    action,
    {
      allowLocalBypass: isAuthenticationDisabled(),
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
 * Resolve one resource ID to its stored project before evaluating authority.
 * Resource-ID routes use this helper so request payloads and path aliases can
 * never choose the project boundary that authorizes the loaded row.
 */
export async function resolveProjectResourceAccess<T>(
  c: Context,
  db: AnyDB,
  input: {
    load: () => Promise<T | null | undefined>;
    projectId: (resource: T) => string | null | undefined;
    notFoundCode: ErrorCode;
    notFoundMessage: string;
  }
): Promise<T | Response> {
  const resource = await input.load();
  if (resource === null || resource === undefined) {
    return c.json(createError(input.notFoundCode, input.notFoundMessage), 404);
  }

  const access = await assertResourceProjectAccess(c, db, input.projectId(resource));
  if (access instanceof Response) return access;
  return resource;
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
  const decision = await evaluateProjectAccessIncludingDeleted(
    db,
    projectId,
    getProjectAccessPrincipal(c),
    projectActionForRequest(c),
    { allowLocalBypass: isAuthenticationDisabled() }
  );
  if (!decision.allowed) {
    return c.json(createError(decision.code, decision.message), decision.status);
  }
  return decision.project;
}

/**
 * Extract the current user's ID from request context.
 * Returns undefined when AUTH_DISABLED (no API key / no user).
 */
export function getUserId(c: Context): string | undefined {
  const apiKey = c.get('apiKey') as ApiKey | undefined;
  return apiKey?.user_id ?? undefined;
}
