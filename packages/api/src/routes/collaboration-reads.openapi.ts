import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  COLLABORATION_CONTRACT_VERSION,
  type CollaborationPrincipalView,
  ListNamespaceAccountsResponseSchema,
  ListNamespaceInvitationsResponseSchema,
  ListNamespaceMembersResponseSchema,
  ListProjectGuestsResponseSchema,
  ListProjectInvitationsResponseSchema,
} from '@t3x-dev/api-client';
import {
  findNamespaceById,
  listNamespaceAccountFacts,
  listNamespaceInvitationViews,
  listNamespaceMemberViews,
  listProjectGrantViews,
  listProjectInvitationViews,
  type StoredNamespaceMemberView,
  type StoredPrincipalProfile,
  type StoredProjectGrantView,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse } from '../lib/errors';
import {
  assertNamespaceAccess,
  authorizedNamespaceActionsFromFacts,
  getNamespacePrincipal,
  listAuthorizedNamespaceActions,
} from '../lib/namespace-access';
import { assertProjectAccess, listAuthorizedProjectActions } from '../lib/project-access';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const collaborationReadRoutes = new OpenAPIHono();

const IdParamSchema = z.object({ id: z.string().trim().min(1).max(200) });

function principalView(profile: StoredPrincipalProfile): CollaborationPrincipalView {
  return profile.kind === 'human'
    ? {
        kind: 'human',
        principal_id: profile.principalId,
        display_name: profile.displayName,
        email: profile.email,
        avatar_url: profile.avatarUrl,
      }
    : {
        kind: profile.kind,
        principal_id: profile.principalId,
        display_name: profile.displayName,
      };
}

function memberView({ membership, principal }: StoredNamespaceMemberView) {
  return {
    membership_id: membership.membershipId,
    namespace_id: membership.namespaceId,
    principal: principalView(principal),
    role: membership.role as 'owner' | 'admin' | 'editor' | 'viewer',
    status: membership.status as 'active' | 'revoked',
    created_at: membership.createdAt.toISOString(),
    updated_at: membership.updatedAt.toISOString(),
  };
}

function grantView({ grant, principal }: StoredProjectGrantView) {
  return {
    grant_id: grant.grantId,
    project_id: grant.projectId,
    principal: principalView(principal),
    role: grant.role as 'admin' | 'editor' | 'viewer',
    status: grant.status as 'active' | 'revoked',
    created_at: grant.createdAt.toISOString(),
    updated_at: grant.updatedAt.toISOString(),
    expires_at: grant.expiresAt?.toISOString() ?? null,
  };
}

const listAccountsRoute = createRoute({
  method: 'get',
  path: '/v1/namespaces',
  tags: ['Collaboration'],
  summary: 'List the current principal namespace accounts',
  responses: {
    200: {
      description: 'Current namespace accounts and server-authorized actions',
      content: {
        'application/json': { schema: SuccessResponseSchema(ListNamespaceAccountsResponseSchema) },
      },
    },
  },
});

collaborationReadRoutes.openapi(listAccountsRoute, async (c) => {
  const principal = getNamespacePrincipal(c);
  if (!principal || principal.kind !== 'human') {
    return c.json({
      success: true as const,
      data: { version: COLLABORATION_CONTRACT_VERSION, namespaces: [] },
    });
  }

  const accounts = await listNamespaceAccountFacts(await getDB(), {
    kind: principal.kind,
    principalId: principal.principal_id,
  });
  return c.json({
    success: true as const,
    data: {
      version: COLLABORATION_CONTRACT_VERSION,
      namespaces: accounts.map(({ namespace, membership, principal: profile }) => ({
        namespace: {
          namespace_id: namespace.namespaceId,
          slug: namespace.slug,
          kind: namespace.kind as 'personal' | 'organization',
          display_name: namespace.displayName,
        },
        current_membership: memberView({ membership, principal: profile }),
        authorized_actions: authorizedNamespaceActionsFromFacts(
          principal,
          namespace.namespaceId,
          membership
        ),
      })),
    },
  });
});

const listMembersRoute = createRoute({
  method: 'get',
  path: '/v1/namespaces/{id}/members',
  tags: ['Collaboration'],
  summary: 'List namespace members',
  request: { params: IdParamSchema },
  responses: {
    200: {
      description: 'Namespace member projection',
      content: {
        'application/json': { schema: SuccessResponseSchema(ListNamespaceMembersResponseSchema) },
      },
    },
    403: {
      description: 'Access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Namespace not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

collaborationReadRoutes.openapi(listMembersRoute, async (c) => {
  const db = await getDB();
  const { id } = c.req.valid('param');
  const namespace = await findNamespaceById(db, id);
  if (!namespace) return errorResponse(c, 'NOT_FOUND', 'Namespace not found');
  const denied = await assertNamespaceAccess(c, db, namespace, 'namespace:members:read');
  if (denied) return denied;

  return c.json({
    success: true as const,
    data: {
      version: COLLABORATION_CONTRACT_VERSION,
      namespace_id: id,
      authorized_actions: await listAuthorizedNamespaceActions(c, db, namespace),
      members: (await listNamespaceMemberViews(db, id)).map(memberView),
    },
  });
});

const listNamespaceInvitationsRoute = createRoute({
  method: 'get',
  path: '/v1/namespaces/{id}/invitations',
  tags: ['Collaboration'],
  summary: 'List namespace invitations',
  request: { params: IdParamSchema },
  responses: {
    200: {
      description: 'Safe namespace invitation projection',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ListNamespaceInvitationsResponseSchema),
        },
      },
    },
    403: {
      description: 'Access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Namespace not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

collaborationReadRoutes.openapi(listNamespaceInvitationsRoute, async (c) => {
  const db = await getDB();
  const { id } = c.req.valid('param');
  const namespace = await findNamespaceById(db, id);
  if (!namespace) return errorResponse(c, 'NOT_FOUND', 'Namespace not found');
  const denied = await assertNamespaceAccess(c, db, namespace, 'namespace:invitations:manage');
  if (denied) return denied;

  return c.json({
    success: true as const,
    data: {
      version: COLLABORATION_CONTRACT_VERSION,
      target_kind: 'namespace' as const,
      namespace_id: id,
      project_id: null,
      authorized_actions: await listAuthorizedNamespaceActions(c, db, namespace),
      invitations: await listNamespaceInvitationViews(db, id),
    },
  });
});

const listProjectGuestsRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/guests',
  tags: ['Collaboration'],
  summary: 'List project-scoped guests',
  request: { params: IdParamSchema },
  responses: {
    200: {
      description: 'Project guest projection',
      content: {
        'application/json': { schema: SuccessResponseSchema(ListProjectGuestsResponseSchema) },
      },
    },
    403: {
      description: 'Access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Project not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

collaborationReadRoutes.openapi(listProjectGuestsRoute, async (c) => {
  const db = await getDB();
  const { id } = c.req.valid('param');
  const project = await assertProjectAccess(c, db, id, 'project:guests:manage');
  if (project instanceof Response) return project;
  if (!project.namespaceId) return errorResponse(c, 'FORBIDDEN', 'Project access denied');

  return c.json({
    success: true as const,
    data: {
      version: COLLABORATION_CONTRACT_VERSION,
      namespace_id: project.namespaceId,
      project_id: project.projectId,
      authorized_actions: await listAuthorizedProjectActions(c, db, id),
      guests: (await listProjectGrantViews(db, id)).map(grantView),
    },
  });
});

const listProjectInvitationsRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/invitations',
  tags: ['Collaboration'],
  summary: 'List project-scoped invitations',
  request: { params: IdParamSchema },
  responses: {
    200: {
      description: 'Safe project invitation projection',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ListProjectInvitationsResponseSchema),
        },
      },
    },
    403: {
      description: 'Access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Project not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

collaborationReadRoutes.openapi(listProjectInvitationsRoute, async (c) => {
  const db = await getDB();
  const { id } = c.req.valid('param');
  const project = await assertProjectAccess(c, db, id, 'project:guests:manage');
  if (project instanceof Response) return project;
  if (!project.namespaceId) return errorResponse(c, 'FORBIDDEN', 'Project access denied');

  return c.json({
    success: true as const,
    data: {
      version: COLLABORATION_CONTRACT_VERSION,
      target_kind: 'project' as const,
      namespace_id: project.namespaceId,
      project_id: project.projectId,
      authorized_actions: await listAuthorizedProjectActions(c, db, id),
      invitations: (await listProjectInvitationViews(db, id)).filter(
        (invitation) => invitation.target.kind === 'project'
      ),
    },
  });
});
