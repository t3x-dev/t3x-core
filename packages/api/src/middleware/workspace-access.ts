import type { ApiKey } from '@t3x-dev/core';
import { findWorkspaceDraftOwner, type WorkspaceOwner } from '@t3x-dev/storage';
import type { Context, Next } from 'hono';
import { isAuthenticationDisabled } from '../lib/auth-config';
import { getDB } from '../lib/db';
import { createError } from '../lib/errors';

/**
 * Resolve Workspace ownership from trusted authentication state. A user-bound
 * Web/CLI/MCP credential acts for the same human owner while its machine actor
 * remains separately recorded by the authoring/Transition ledgers.
 */
export function workspaceOwnerFromContext(c: Context): WorkspaceOwner | null {
  if (isAuthenticationDisabled()) return null;
  const apiKey = c.get('apiKey') as ApiKey | undefined;
  if (!apiKey) return null;
  if (apiKey.user_id) return { kind: 'human', id: apiKey.user_id };
  return { kind: apiKey.principal_kind, id: apiKey.id };
}

function decoded(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

async function workspaceRouteIdentity(
  c: Context
): Promise<{ projectId: string; workspaceId: string } | null> {
  const path = c.req.path;
  const workspace = path.match(/^\/(?:api\/)?v1\/projects\/([^/]+)\/workspaces\/([^/]+)(?:\/|$)/);
  const schemaStudio = path.match(
    /^\/(?:api\/)?v1\/projects\/([^/]+)\/schema-studio\/(?:preparation|publish|edit-candidates|pending)\/([^/]+)(?:\/|$)/
  );
  const match = workspace ?? schemaStudio;
  if (match) {
    const projectId = decoded(match[1]!);
    const workspaceId = decoded(match[2]!);
    return projectId && workspaceId ? { projectId, workspaceId } : null;
  }

  const project = path.match(/^\/(?:api\/)?v1\/projects\/([^/]+)(?:\/|$)/);
  const projectId = project ? decoded(project[1]!) : null;
  if (!projectId) return null;
  const queryWorkspaceId = c.req.query('workspace_id') ?? c.req.query('workspaceId');
  if (queryWorkspaceId) return { projectId, workspaceId: queryWorkspaceId };

  if (!c.req.header('content-type')?.toLowerCase().includes('application/json')) return null;
  try {
    const body = (await c.req.raw.clone().json()) as Record<string, unknown>;
    const workspaceId = body.workspace_id ?? body.workspaceId;
    return typeof workspaceId === 'string' && workspaceId ? { projectId, workspaceId } : null;
  } catch {
    return null;
  }
}

/**
 * Fail closed before any exact Workspace route can project private metadata.
 * Missing Workspaces continue to the route so the canonical save/create path
 * can create a principal-bound Workspace.
 */
export async function workspaceAccessMiddleware(c: Context, next: Next) {
  if (isAuthenticationDisabled()) return next();
  const identity = await workspaceRouteIdentity(c);
  if (!identity) return next();
  const owner = workspaceOwnerFromContext(c);
  if (!owner) return c.json(createError('FORBIDDEN', 'Access denied'), 403);
  const storedOwner = await findWorkspaceDraftOwner(
    await getDB(),
    identity.projectId,
    identity.workspaceId
  );
  if (
    storedOwner !== undefined &&
    (storedOwner === null || storedOwner.kind !== owner.kind || storedOwner.id !== owner.id)
  ) {
    return c.json(createError('NOT_FOUND', 'Workspace not found'), 404);
  }
  return next();
}
