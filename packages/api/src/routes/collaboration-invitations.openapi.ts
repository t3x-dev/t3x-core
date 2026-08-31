import { randomUUID } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  AcceptCollaborationInvitationRequestSchema,
  AcceptCollaborationInvitationResponseSchema,
  CollaborationMutationResultSchema,
  CreateCollaborationInvitationResponseSchema,
  CreateNamespaceInvitationRequestSchema,
  CreateProjectInvitationRequestSchema,
} from '@t3x-dev/api-client';
import {
  assertInvitationExpiry,
  assertInvitationMayBeAccepted,
  type CollaborationCommandKind,
  CollaborationInvariantError,
  type HumanPrincipalDto,
} from '@t3x-dev/application';
import {
  CollaborationStorageError,
  createPostgresCollaborationLifecycleUnitOfWork,
  findCollaborationInvitationViewById,
  findCollaborationInvitationViewByTokenHash,
  findNamespaceById,
  findUserById,
  type StoredCollaborationInvitationDto,
  type StoredCollaborationPrincipalDto,
} from '@t3x-dev/storage';
import {
  hashCollaborationInvitationToken,
  issueCollaborationInvitationToken,
} from '../lib/collaboration-invitation-token';
import { getDB } from '../lib/db';
import { errorResponse } from '../lib/errors';
import { assertNamespaceAccess, getNamespacePrincipal } from '../lib/namespace-access';
import { assertProjectAccess } from '../lib/project-access';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const collaborationInvitationRoutes = new OpenAPIHono();

const IdParamSchema = z.object({ id: z.string().trim().min(1).max(200) });

class InvitationRouteError extends Error {
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

function invitationError(c: Parameters<typeof errorResponse>[0], error: unknown) {
  if (error instanceof InvitationRouteError) {
    return errorResponse(c, error.code, error.message);
  }
  if (error instanceof CollaborationInvariantError) {
    if (error.code === 'INVITATION_RECIPIENT_MISMATCH') {
      return errorResponse(c, 'FORBIDDEN', error.message, { reason: error.code });
    }
    return errorResponse(c, 'HASH_CONFLICT', error.message, { reason: error.code });
  }
  if (error instanceof CollaborationStorageError) {
    const code = error.code === 'NAMESPACE_NOT_FOUND' ? 'NOT_FOUND' : 'HASH_CONFLICT';
    return errorResponse(c, code, error.message, { reason: error.code });
  }
  if ((error as { code?: string }).code === '23505') {
    return errorResponse(c, 'HASH_CONFLICT', 'A pending invitation already exists');
  }
  const message = error instanceof Error ? error.message : 'Invitation mutation failed';
  return errorResponse(c, 'UPDATE_FAILED', message);
}

function safeInvitation(input: {
  invitationId: string;
  target: StoredCollaborationInvitationDto['target'];
  recipient: StoredCollaborationInvitationDto['recipient'];
  role: 'admin' | 'editor' | 'viewer';
  actor: StoredCollaborationPrincipalDto;
  evaluatedAt: string;
  expiresAt: string;
}): StoredCollaborationInvitationDto {
  return {
    invitation_id: input.invitationId,
    target: input.target,
    recipient: input.recipient,
    role: input.role,
    status: 'pending',
    created_by: input.actor,
    created_at: input.evaluatedAt,
    updated_at: input.evaluatedAt,
    expires_at: input.expiresAt,
    accepted_at: null,
    accepted_by_user_id: null,
    revoked_at: null,
    expired_at: null,
  } as StoredCollaborationInvitationDto;
}

const createNamespaceInvitationRoute = createRoute({
  method: 'post',
  path: '/v1/namespaces/{id}/invitations',
  tags: ['Collaboration'],
  summary: 'Create a recipient-bound namespace invitation',
  request: {
    params: IdParamSchema,
    body: { content: { 'application/json': { schema: CreateNamespaceInvitationRequestSchema } } },
  },
  responses: {
    201: {
      description: 'Namespace invitation created',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(CreateCollaborationInvitationResponseSchema),
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
    409: {
      description: 'Invitation conflict',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

collaborationInvitationRoutes.openapi(createNamespaceInvitationRoute, async (c) => {
  const db = await getDB();
  const { id } = c.req.valid('param');
  const namespace = await findNamespaceById(db, id);
  if (!namespace) return errorResponse(c, 'NOT_FOUND', 'Namespace not found');
  const denied = await assertNamespaceAccess(c, db, namespace, 'namespace:invitations:manage');
  if (denied) return denied;
  const actor = getNamespacePrincipal(c);
  if (!actor) return errorResponse(c, 'FORBIDDEN', 'Authenticated principal required');
  const evaluatedAt = new Date().toISOString();

  try {
    const input = c.req.valid('json');
    assertInvitationExpiry({ expires_at: input.expires_at, evaluated_at: evaluatedAt });
    const issued = issueCollaborationInvitationToken();
    const invitation = safeInvitation({
      invitationId: `inv_${randomUUID().replaceAll('-', '')}`,
      target: { kind: 'namespace', namespace_id: id, project_id: null },
      recipient: {
        user_id: input.recipient.user_id,
        email: input.recipient.email?.trim().toLowerCase() ?? null,
      },
      role: input.role,
      actor,
      evaluatedAt,
      expiresAt: input.expires_at,
    });
    await createPostgresCollaborationLifecycleUnitOfWork(db).transaction(async (transaction) => {
      await transaction.lockNamespace(id);
      await transaction.createInvitation({ ...invitation, token_hash: issued.tokenHash });
    });
    return c.json(
      {
        success: true as const,
        data: {
          invitation,
          delivery: { mode: 'manual' as const, token: issued.token },
          mutation: mutation('invitation.create', evaluatedAt),
        },
      },
      201
    );
  } catch (error) {
    return invitationError(c, error);
  }
});

const createProjectInvitationRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/invitations',
  tags: ['Collaboration'],
  summary: 'Create a recipient-bound project invitation',
  request: {
    params: IdParamSchema,
    body: { content: { 'application/json': { schema: CreateProjectInvitationRequestSchema } } },
  },
  responses: {
    201: {
      description: 'Project invitation created',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(CreateCollaborationInvitationResponseSchema),
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
    409: {
      description: 'Invitation conflict',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

collaborationInvitationRoutes.openapi(createProjectInvitationRoute, async (c) => {
  const db = await getDB();
  const { id } = c.req.valid('param');
  const project = await assertProjectAccess(c, db, id, 'project:guests:manage');
  if (project instanceof Response) return project;
  if (!project.namespaceId) return errorResponse(c, 'FORBIDDEN', 'Project access denied');
  const actor = getNamespacePrincipal(c);
  if (!actor) return errorResponse(c, 'FORBIDDEN', 'Authenticated principal required');
  const evaluatedAt = new Date().toISOString();

  try {
    const input = c.req.valid('json');
    assertInvitationExpiry({ expires_at: input.expires_at, evaluated_at: evaluatedAt });
    const issued = issueCollaborationInvitationToken();
    const invitation = safeInvitation({
      invitationId: `inv_${randomUUID().replaceAll('-', '')}`,
      target: { kind: 'project', namespace_id: project.namespaceId, project_id: id },
      recipient: {
        user_id: input.recipient.user_id,
        email: input.recipient.email?.trim().toLowerCase() ?? null,
      },
      role: input.role,
      actor,
      evaluatedAt,
      expiresAt: input.expires_at,
    });
    await createPostgresCollaborationLifecycleUnitOfWork(db).transaction(async (transaction) => {
      await transaction.lockNamespace(project.namespaceId as string);
      await transaction.createInvitation({ ...invitation, token_hash: issued.tokenHash });
    });
    return c.json(
      {
        success: true as const,
        data: {
          invitation,
          delivery: { mode: 'manual' as const, token: issued.token },
          mutation: mutation('invitation.create', evaluatedAt),
        },
      },
      201
    );
  } catch (error) {
    return invitationError(c, error);
  }
});

const revokeInvitationRoute = createRoute({
  method: 'delete',
  path: '/v1/invitations/{id}',
  tags: ['Collaboration'],
  summary: 'Revoke one invitation through its stored target authority',
  request: { params: IdParamSchema },
  responses: {
    200: {
      description: 'Invitation revoked or already revoked',
      content: {
        'application/json': { schema: SuccessResponseSchema(CollaborationMutationResultSchema) },
      },
    },
    403: {
      description: 'Access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Invitation not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Invitation conflict',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

collaborationInvitationRoutes.openapi(revokeInvitationRoute, async (c) => {
  const db = await getDB();
  const { id } = c.req.valid('param');
  const invitation = await findCollaborationInvitationViewById(db, id);
  if (!invitation) return errorResponse(c, 'NOT_FOUND', 'Invitation not found');

  if (invitation.target.kind === 'namespace') {
    const namespace = await findNamespaceById(db, invitation.target.namespace_id);
    if (!namespace) return errorResponse(c, 'NOT_FOUND', 'Invitation target not found');
    const denied = await assertNamespaceAccess(c, db, namespace, 'namespace:invitations:manage');
    if (denied) return denied;
  } else {
    const project = await assertProjectAccess(
      c,
      db,
      invitation.target.project_id,
      'project:guests:manage'
    );
    if (project instanceof Response) return project;
    if (project.namespaceId !== invitation.target.namespace_id) {
      return errorResponse(c, 'FORBIDDEN', 'Invitation target mismatch');
    }
  }

  const evaluatedAt = new Date().toISOString();
  try {
    const outcome = await createPostgresCollaborationLifecycleUnitOfWork(db).transaction(
      async (transaction) => {
        await transaction.lockNamespace(invitation.target.namespace_id);
        const current = await transaction.findInvitationByIdForUpdate(id);
        if (!current || current.target.namespace_id !== invitation.target.namespace_id) {
          throw new InvitationRouteError('NOT_FOUND', 'Invitation not found');
        }
        if (current.status === 'revoked') return 'unchanged' as const;
        await transaction.revokeInvitation(id, evaluatedAt);
        return 'applied' as const;
      }
    );
    return c.json({
      success: true as const,
      data: mutation('invitation.revoke', evaluatedAt, outcome),
    });
  } catch (error) {
    return invitationError(c, error);
  }
});

const acceptInvitationRoute = createRoute({
  method: 'post',
  path: '/v1/invitations/accept',
  tags: ['Collaboration'],
  summary: 'Accept an invitation as its recipient',
  request: {
    body: {
      content: { 'application/json': { schema: AcceptCollaborationInvitationRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Invitation accepted and authority materialized atomically',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(AcceptCollaborationInvitationResponseSchema),
        },
      },
    },
    403: {
      description: 'Recipient mismatch',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Invitation not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Invitation conflict',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

collaborationInvitationRoutes.openapi(acceptInvitationRoute, async (c) => {
  const db = await getDB();
  const actor = getNamespacePrincipal(c);
  if (!actor || actor.kind !== 'human') {
    return errorResponse(c, 'FORBIDDEN', 'A signed-in user is required');
  }
  const humanActor: HumanPrincipalDto = {
    kind: 'human',
    principal_id: actor.principal_id,
  };
  const { token } = c.req.valid('json');
  const tokenHash = hashCollaborationInvitationToken(token);
  if (!tokenHash) return errorResponse(c, 'NOT_FOUND', 'Invitation not found');
  const firstRead = await findCollaborationInvitationViewByTokenHash(db, tokenHash);
  if (!firstRead) return errorResponse(c, 'NOT_FOUND', 'Invitation not found');
  const user = await findUserById(db, humanActor.principal_id);
  const verifiedEmails = user?.email_verified && user.email ? [user.email] : [];
  const evaluatedAt = new Date().toISOString();

  try {
    const authority = await createPostgresCollaborationLifecycleUnitOfWork(db).transaction(
      async (transaction) => {
        // Always acquire the namespace lock before the invitation row lock.
        await transaction.lockNamespace(firstRead.target.namespace_id);
        const invitation = await transaction.findInvitationByTokenHashForUpdate(tokenHash);
        if (!invitation || invitation.target.namespace_id !== firstRead.target.namespace_id) {
          throw new InvitationRouteError('NOT_FOUND', 'Invitation not found');
        }
        assertInvitationMayBeAccepted({
          invitation,
          actor: humanActor,
          verified_emails: verifiedEmails,
          evaluated_at: evaluatedAt,
        });

        const materialized =
          invitation.target.kind === 'namespace'
            ? {
                kind: 'namespace_membership' as const,
                membership: await transaction.upsertNamespaceMembership({
                  namespaceId: invitation.target.namespace_id,
                  principal: humanActor,
                  role: invitation.role,
                }),
              }
            : {
                kind: 'project_grant' as const,
                grant: await transaction.upsertProjectGrant({
                  namespaceId: invitation.target.namespace_id,
                  projectId: invitation.target.project_id,
                  principal: humanActor,
                  role: invitation.role,
                  expiresAt: null,
                }),
              };
        await transaction.acceptInvitation({
          invitationId: invitation.invitation_id,
          acceptedByUserId: humanActor.principal_id,
          acceptedAt: evaluatedAt,
        });
        return materialized;
      }
    );

    return c.json({
      success: true as const,
      data: {
        authority:
          authority.kind === 'namespace_membership'
            ? {
                kind: authority.kind,
                membership: {
                  ...authority.membership,
                  principal: principalView(authority.membership.principal),
                },
              }
            : {
                kind: authority.kind,
                grant: {
                  ...authority.grant,
                  principal: principalView(authority.grant.principal),
                },
              },
        mutation: mutation('invitation.accept', evaluatedAt),
      },
    });
  } catch (error) {
    return invitationError(c, error);
  }
});
