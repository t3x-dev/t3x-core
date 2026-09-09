import { randomUUID } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  CollaborationMutationResultSchema,
  TransferNamespaceOwnershipRequestSchema,
  TransferProjectRequestSchema,
  UpsertNamespaceMemberRequestSchema,
  UpsertNamespaceMemberResponseSchema,
  UpsertProjectGuestRequestSchema,
  UpsertProjectGuestResponseSchema,
} from '@t3x-dev/api-client';
import {
  assertOwnerMutationAllowed,
  assertProjectGrantExpiry,
  buildNamespaceOwnershipTransferPlan,
  buildProjectTransferPlan,
  type CollaborationCommandKind,
  CollaborationInvariantError,
} from '@t3x-dev/application';
import {
  CollaborationStorageError,
  createPostgresCollaborationLifecycleUnitOfWork,
  findNamespaceById,
  findNamespaceMembershipForPrincipal,
  type StoredCollaborationPrincipalDto,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse } from '../lib/errors';
import { assertNamespaceAccess, getNamespacePrincipal } from '../lib/namespace-access';
import { assertProjectAccess } from '../lib/project-access';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const collaborationCommandRoutes = new OpenAPIHono();

const IdParamSchema = z.object({ id: z.string().trim().min(1).max(200) });
const MemberParamSchema = IdParamSchema.extend({
  membershipId: z.string().trim().min(1).max(200),
});
const GuestParamSchema = IdParamSchema.extend({
  grantId: z.string().trim().min(1).max(200),
});

function mutationResponse(description: string) {
  return {
    description,
    content: {
      'application/json': { schema: SuccessResponseSchema(CollaborationMutationResultSchema) },
    },
  };
}

class CollaborationCommandRouteError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'FORBIDDEN' | 'HASH_CONFLICT',
    message: string
  ) {
    super(message);
  }
}

function principalView(principal: StoredCollaborationPrincipalDto) {
  return principal.kind === 'human'
    ? {
        kind: 'human' as const,
        principal_id: principal.principal_id,
        display_name: null,
        email: null,
        avatar_url: null,
      }
    : {
        kind: principal.kind,
        principal_id: principal.principal_id,
        display_name: null,
      };
}

function mutation(
  kind: CollaborationCommandKind,
  evaluatedAt: string,
  outcome: 'applied' | 'unchanged' = 'applied'
) {
  return {
    request_id: `req_${randomUUID()}`,
    kind,
    outcome,
    evaluated_at: evaluatedAt,
  };
}

function commandError(c: Parameters<typeof errorResponse>[0], error: unknown) {
  if (error instanceof CollaborationCommandRouteError) {
    return errorResponse(c, error.code, error.message);
  }
  if (error instanceof CollaborationInvariantError) {
    return errorResponse(c, 'HASH_CONFLICT', error.message, { reason: error.code });
  }
  if (error instanceof CollaborationStorageError) {
    const code = error.code === 'NAMESPACE_NOT_FOUND' ? 'NOT_FOUND' : 'HASH_CONFLICT';
    return errorResponse(c, code, error.message, { reason: error.code });
  }
  const message = error instanceof Error ? error.message : 'Collaboration mutation failed';
  return errorResponse(c, 'UPDATE_FAILED', message);
}

const upsertMemberRoute = createRoute({
  method: 'put',
  path: '/v1/namespaces/{id}/members',
  tags: ['Collaboration'],
  summary: 'Add or update a namespace member',
  request: {
    params: IdParamSchema,
    body: { content: { 'application/json': { schema: UpsertNamespaceMemberRequestSchema } } },
  },
  responses: {
    200: {
      description: 'Namespace member upserted',
      content: {
        'application/json': { schema: SuccessResponseSchema(UpsertNamespaceMemberResponseSchema) },
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
    409: {
      description: 'Lifecycle conflict',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

collaborationCommandRoutes.openapi(upsertMemberRoute, async (c) => {
  const db = await getDB();
  const { id } = c.req.valid('param');
  const namespace = await findNamespaceById(db, id);
  if (!namespace) return errorResponse(c, 'NOT_FOUND', 'Namespace not found');
  const denied = await assertNamespaceAccess(c, db, namespace, 'namespace:members:manage');
  if (denied) return denied;
  const evaluatedAt = new Date().toISOString();

  try {
    const input = c.req.valid('json');
    const member = await createPostgresCollaborationLifecycleUnitOfWork(db).transaction(
      async (transaction) => {
        await transaction.lockNamespace(id);
        return transaction.upsertNamespaceMembership({
          namespaceId: id,
          principal: input.principal,
          role: input.role,
        });
      }
    );
    return c.json({
      success: true as const,
      data: {
        member: { ...member, principal: principalView(member.principal) },
        mutation: mutation('namespace_member.upsert', evaluatedAt),
      },
    });
  } catch (error) {
    return commandError(c, error);
  }
});

const revokeMemberRoute = createRoute({
  method: 'delete',
  path: '/v1/namespaces/{id}/members/{membershipId}',
  tags: ['Collaboration'],
  summary: 'Revoke a namespace member while preserving the last owner',
  request: { params: MemberParamSchema },
  responses: {
    200: {
      description: 'Namespace membership revoked or already inactive',
      content: {
        'application/json': { schema: SuccessResponseSchema(CollaborationMutationResultSchema) },
      },
    },
    403: {
      description: 'Access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Membership not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Last-owner conflict',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

collaborationCommandRoutes.openapi(revokeMemberRoute, async (c) => {
  const db = await getDB();
  const { id, membershipId } = c.req.valid('param');
  const namespace = await findNamespaceById(db, id);
  if (!namespace) return errorResponse(c, 'NOT_FOUND', 'Namespace not found');
  const denied = await assertNamespaceAccess(c, db, namespace, 'namespace:members:manage');
  if (denied) return denied;
  const evaluatedAt = new Date().toISOString();

  try {
    const outcome = await createPostgresCollaborationLifecycleUnitOfWork(db).transaction(
      async (transaction) => {
        await transaction.lockNamespace(id);
        const member = await transaction.findNamespaceMembershipForUpdate({
          namespaceId: id,
          membershipId,
        });
        if (!member) throw new CollaborationCommandRouteError('NOT_FOUND', 'Membership not found');
        if (member.status !== 'active') return 'unchanged' as const;
        assertOwnerMutationAllowed({
          target: member,
          active_human_owner_count: await transaction.countActiveHumanOwnersForUpdate(id),
        });
        await transaction.revokeNamespaceMembership(membershipId, evaluatedAt);
        return 'applied' as const;
      }
    );
    return c.json({
      success: true as const,
      data: mutation('namespace_member.revoke', evaluatedAt, outcome),
    });
  } catch (error) {
    return commandError(c, error);
  }
});

const upsertGuestRoute = createRoute({
  method: 'put',
  path: '/v1/projects/{id}/guests',
  tags: ['Collaboration'],
  summary: 'Grant or update project-scoped guest access',
  request: {
    params: IdParamSchema,
    body: { content: { 'application/json': { schema: UpsertProjectGuestRequestSchema } } },
  },
  responses: {
    200: {
      description: 'Project guest granted',
      content: {
        'application/json': { schema: SuccessResponseSchema(UpsertProjectGuestResponseSchema) },
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
    409: {
      description: 'Lifecycle conflict',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

collaborationCommandRoutes.openapi(upsertGuestRoute, async (c) => {
  const db = await getDB();
  const { id } = c.req.valid('param');
  const project = await assertProjectAccess(c, db, id, 'project:guests:manage');
  if (project instanceof Response) return project;
  if (!project.namespaceId) return errorResponse(c, 'FORBIDDEN', 'Project access denied');
  const evaluatedAt = new Date().toISOString();

  try {
    const input = c.req.valid('json');
    assertProjectGrantExpiry({ expires_at: input.expires_at, evaluated_at: evaluatedAt });
    const guest = await createPostgresCollaborationLifecycleUnitOfWork(db).transaction(
      async (transaction) => {
        await transaction.lockNamespace(project.namespaceId as string);
        return transaction.upsertProjectGrant({
          namespaceId: project.namespaceId as string,
          projectId: id,
          principal: input.principal,
          role: input.role,
          expiresAt: input.expires_at,
        });
      }
    );
    return c.json({
      success: true as const,
      data: {
        guest: { ...guest, principal: principalView(guest.principal) },
        mutation: mutation('project_guest.grant', evaluatedAt),
      },
    });
  } catch (error) {
    return commandError(c, error);
  }
});

const revokeGuestRoute = createRoute({
  method: 'delete',
  path: '/v1/projects/{id}/guests/{grantId}',
  tags: ['Collaboration'],
  summary: 'Revoke one exact project-scoped guest',
  request: { params: GuestParamSchema },
  responses: {
    200: {
      description: 'Project guest revoked or already inactive',
      content: {
        'application/json': { schema: SuccessResponseSchema(CollaborationMutationResultSchema) },
      },
    },
    403: {
      description: 'Access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Project grant not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Lifecycle conflict',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

collaborationCommandRoutes.openapi(revokeGuestRoute, async (c) => {
  const db = await getDB();
  const { id, grantId } = c.req.valid('param');
  const project = await assertProjectAccess(c, db, id, 'project:guests:manage');
  if (project instanceof Response) return project;
  if (!project.namespaceId) return errorResponse(c, 'FORBIDDEN', 'Project access denied');
  const evaluatedAt = new Date().toISOString();

  try {
    const outcome = await createPostgresCollaborationLifecycleUnitOfWork(db).transaction(
      async (transaction) => {
        await transaction.lockNamespace(project.namespaceId as string);
        const guest = await transaction.findProjectGrantForUpdate({
          namespaceId: project.namespaceId as string,
          projectId: id,
          grantId,
        });
        if (!guest)
          throw new CollaborationCommandRouteError('NOT_FOUND', 'Project grant not found');
        if (guest.status !== 'active') return 'unchanged' as const;
        await transaction.revokeProjectGrant(grantId, evaluatedAt);
        return 'applied' as const;
      }
    );
    return c.json({
      success: true as const,
      data: mutation('project_guest.revoke', evaluatedAt, outcome),
    });
  } catch (error) {
    return commandError(c, error);
  }
});

const transferNamespaceOwnershipRoute = createRoute({
  method: 'post',
  path: '/v1/namespaces/{id}/ownership-transfer',
  tags: ['Collaboration'],
  summary: 'Atomically transfer namespace ownership to an active human member',
  request: {
    params: IdParamSchema,
    body: {
      content: { 'application/json': { schema: TransferNamespaceOwnershipRequestSchema } },
    },
  },
  responses: {
    200: mutationResponse('Namespace ownership transferred'),
    403: {
      description: 'Access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Namespace or membership not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Ownership transfer conflict',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

collaborationCommandRoutes.openapi(transferNamespaceOwnershipRoute, async (c) => {
  const db = await getDB();
  const { id } = c.req.valid('param');
  const namespace = await findNamespaceById(db, id);
  if (!namespace) return errorResponse(c, 'NOT_FOUND', 'Namespace not found');
  const denied = await assertNamespaceAccess(c, db, namespace, 'namespace:ownership:transfer');
  if (denied) return denied;

  const actor = getNamespacePrincipal(c);
  if (!actor || actor.kind !== 'human') {
    return errorResponse(c, 'FORBIDDEN', 'Namespace ownership requires a human owner');
  }
  const currentOwner = await findNamespaceMembershipForPrincipal(db, {
    namespaceId: id,
    principal: { kind: actor.kind, principalId: actor.principal_id },
  });
  if (!currentOwner) return errorResponse(c, 'FORBIDDEN', 'Namespace access denied');

  const evaluatedAt = new Date().toISOString();
  try {
    const { target_membership_id: targetMembershipId } = c.req.valid('json');
    await createPostgresCollaborationLifecycleUnitOfWork(db).transaction(async (transaction) => {
      await transaction.lockNamespace(id);
      const lockedCurrentOwner = await transaction.findNamespaceMembershipForUpdate({
        namespaceId: id,
        membershipId: currentOwner.membershipId,
      });
      const target = await transaction.findNamespaceMembershipForUpdate({
        namespaceId: id,
        membershipId: targetMembershipId,
      });
      if (!lockedCurrentOwner || !target) {
        throw new CollaborationCommandRouteError('NOT_FOUND', 'Membership not found');
      }
      await transaction.applyOwnershipTransfer(
        buildNamespaceOwnershipTransferPlan({
          namespace_id: id,
          current_owner: lockedCurrentOwner,
          target,
        }),
        evaluatedAt
      );
    });
    return c.json({
      success: true as const,
      data: mutation('namespace_ownership.transfer', evaluatedAt),
    });
  } catch (error) {
    return commandError(c, error);
  }
});

const transferProjectRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/transfer',
  tags: ['Collaboration'],
  summary: 'Atomically transfer a clean project between authorized namespaces',
  request: {
    params: IdParamSchema,
    body: { content: { 'application/json': { schema: TransferProjectRequestSchema } } },
  },
  responses: {
    200: mutationResponse('Project transferred'),
    403: {
      description: 'Source or target namespace access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Project or target namespace not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Project transfer conflict',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

collaborationCommandRoutes.openapi(transferProjectRoute, async (c) => {
  const db = await getDB();
  const { id } = c.req.valid('param');
  const project = await assertProjectAccess(c, db, id, 'project:transfer');
  if (project instanceof Response) return project;
  if (!project.namespaceId) return errorResponse(c, 'FORBIDDEN', 'Project access denied');

  const { target_namespace_id: targetNamespaceId } = c.req.valid('json');
  const targetNamespace = await findNamespaceById(db, targetNamespaceId);
  if (!targetNamespace) return errorResponse(c, 'NOT_FOUND', 'Target namespace not found');
  const targetDenied = await assertNamespaceAccess(c, db, targetNamespace, 'project:create');
  if (targetDenied) return targetDenied;

  const evaluatedAt = new Date().toISOString();
  try {
    const plan = buildProjectTransferPlan({
      project_id: id,
      source_namespace_id: project.namespaceId,
      target_namespace_id: targetNamespaceId,
    });
    await createPostgresCollaborationLifecycleUnitOfWork(db).transaction((transaction) =>
      transaction.applyProjectTransfer(plan)
    );
    return c.json({
      success: true as const,
      data: mutation('project.transfer', evaluatedAt),
    });
  } catch (error) {
    return commandError(c, error);
  }
});
