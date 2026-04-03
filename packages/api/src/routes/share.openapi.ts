/**
 * Share Link Routes with OpenAPI
 *
 * Endpoints:
 * - POST   /v1/share                - Create a share link
 * - GET    /v1/share/:token         - Resolve a share link (public, no auth)
 * - DELETE /v1/share/:id            - Revoke a share link
 * - GET    /v1/share/entity/:type/:id - List share links for an entity
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  createShareToken,
  findLeafById,
  findShareTokenById,
  findShareTokenByToken,
  findShareTokensByEntity,
  getCommitUnified,
  getComparison,
  getRun,
  revokeShareToken,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { pinoLogger } from '../middleware/logger';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';
import {
  CreateShareLinkRequest,
  ShareLinkResponse,
  ShareResolveResponse,
} from '../schemas/share-contracts';

export const shareRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// POST /v1/share — Create share link
// ============================================================

const createShareRoute = createRoute({
  method: 'post',
  path: '/v1/share',
  tags: ['Share'],
  summary: 'Create a share link',
  description: 'Creates a public share link for a leaf or commit.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateShareLinkRequest,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Share link created',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ShareLinkResponse),
        },
      },
    },
    404: {
      description: 'Entity not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

shareRoutes.openapi(createShareRoute, async (c) => {
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    // Verify entity exists and get project_id
    let projectId: string | undefined;

    if (body.entity_type === 'leaf') {
      const leaf = await findLeafById(db, body.entity_id);
      if (!leaf) {
        return errorResponse(c, 'SHARE_ENTITY_NOT_FOUND', `Leaf not found: ${body.entity_id}`);
      }
      projectId = leaf.project_id;
    } else if (body.entity_type === 'run') {
      const run = await getRun(db, body.entity_id);
      if (!run) {
        return errorResponse(c, 'SHARE_ENTITY_NOT_FOUND', `Run not found: ${body.entity_id}`);
      }
      projectId = run.projectId ?? undefined;
    } else if (body.entity_type === 'comparison') {
      const comparison = await getComparison(db, body.entity_id);
      if (!comparison) {
        return errorResponse(
          c,
          'SHARE_ENTITY_NOT_FOUND',
          `Comparison not found: ${body.entity_id}`
        );
      }
      projectId = comparison.projectId || undefined;
    } else if (body.entity_type === 'commit') {
      const commit = await getCommitUnified(db, body.entity_id);
      if (!commit) {
        return errorResponse(c, 'SHARE_ENTITY_NOT_FOUND', `Commit not found: ${body.entity_id}`);
      }
      projectId = commit.project_id ?? undefined;
    }

    if (!projectId) {
      return errorResponse(c, 'SHARE_ENTITY_NOT_FOUND', `Entity not found: ${body.entity_id}`);
    }

    // Verify project access
    const accessResult = await assertProjectAccess(c, db, projectId);
    if (accessResult instanceof Response) return accessResult;

    const shareToken = await createShareToken(db, {
      // biome-ignore lint/suspicious/noExplicitAny: generic error handler
      entity_type: body.entity_type as any,
      entity_id: body.entity_id,
      project_id: projectId,
    });

    return c.json(
      {
        success: true as const,
        data: shareToken,
      },
      201
    );
  } catch (err) {
    pinoLogger.error({ err }, 'error creating share link');
    return errorResponse(c, 'CREATE_FAILED', 'Failed to create share link');
  }
});

// ============================================================
// GET /v1/share/:token — Resolve share link (PUBLIC)
// ============================================================

const resolveShareRoute = createRoute({
  method: 'get',
  path: '/v1/share/{token}',
  tags: ['Share'],
  summary: 'Resolve a share link',
  description:
    'Returns the shared entity data. This endpoint is public (no authentication required).',
  request: {
    params: z.object({
      token: z.string().min(1),
    }),
  },
  responses: {
    200: {
      description: 'Shared entity data',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ShareResolveResponse),
        },
      },
    },
    404: {
      description: 'Share link not found or expired',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

shareRoutes.openapi(resolveShareRoute, async (c) => {
  const { token } = c.req.valid('param');

  try {
    const db = await getDB();
    const shareToken = await findShareTokenByToken(db, token);

    if (!shareToken) {
      return errorResponse(c, 'SHARE_TOKEN_NOT_FOUND', 'Share link not found or expired');
    }

    // Fetch the entity based on type
    let entity: unknown;

    const entityType = shareToken.entity_type as string;
    if (entityType === 'leaf') {
      entity = await findLeafById(db, shareToken.entity_id);
    } else if (entityType === 'run') {
      entity = await getRun(db, shareToken.entity_id);
    } else if (entityType === 'comparison') {
      entity = await getComparison(db, shareToken.entity_id);
    } else if (entityType === 'commit') {
      entity = await getCommitUnified(db, shareToken.entity_id);
    } else {
      return errorResponse(c, 'SHARE_ENTITY_NOT_FOUND', 'Unsupported entity type');
    }

    if (!entity) {
      return errorResponse(c, 'SHARE_ENTITY_NOT_FOUND', 'Shared entity no longer exists');
    }

    return c.json({
      success: true as const,
      data: {
        token_info: shareToken,
        entity,
      },
    });
  } catch (err) {
    pinoLogger.error({ err }, 'error resolving share link');
    return errorResponse(c, 'GET_FAILED', 'Failed to resolve share link');
  }
});

// ============================================================
// DELETE /v1/share/:id — Revoke share link
// ============================================================

const revokeShareRoute = createRoute({
  method: 'delete',
  path: '/v1/share/{id}',
  tags: ['Share'],
  summary: 'Revoke a share link',
  description: 'Revokes a share link. The link will no longer resolve.',
  request: {
    params: z.object({
      id: z.string().min(1),
    }),
  },
  responses: {
    200: {
      description: 'Share link revoked',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ShareLinkResponse),
        },
      },
    },
    404: {
      description: 'Share link not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

shareRoutes.openapi(revokeShareRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();
    const existing = await findShareTokenById(db, id);

    if (!existing) {
      return errorResponse(c, 'SHARE_TOKEN_NOT_FOUND', `Share link not found: ${id}`);
    }

    // Verify project access
    const accessResult = await assertProjectAccess(c, db, existing.project_id);
    if (accessResult instanceof Response) return accessResult;

    const revoked = await revokeShareToken(db, id);
    if (!revoked) {
      return errorResponse(c, 'DELETE_FAILED', 'Failed to revoke share link');
    }

    return c.json({
      success: true as const,
      data: revoked,
    });
  } catch (err) {
    pinoLogger.error({ err }, 'error revoking share link');
    return errorResponse(c, 'DELETE_FAILED', 'Failed to revoke share link');
  }
});

// ============================================================
// GET /v1/share/entity/:type/:id — List share links for entity
// ============================================================

const listShareRoute = createRoute({
  method: 'get',
  path: '/v1/share/entity/{entityType}/{entityId}',
  tags: ['Share'],
  summary: 'List share links for an entity',
  description: 'Returns all active (non-revoked) share links for a specific entity.',
  request: {
    params: z.object({
      entityType: z
        .enum(['leaf', 'run', 'comparison', 'commit'])
        .openapi({ description: 'Type of shared entity' }),
      entityId: z.string().min(1),
    }),
  },
  responses: {
    200: {
      description: 'List of share links',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(ShareLinkResponse)),
        },
      },
    },
  },
});

shareRoutes.openapi(listShareRoute, async (c) => {
  const { entityType, entityId } = c.req.valid('param');

  try {
    const db = await getDB();
    const tokens = await findShareTokensByEntity(db, entityType, entityId);

    return c.json({
      success: true as const,
      data: tokens,
    });
  } catch (err) {
    pinoLogger.error({ err }, 'error listing share links');
    return errorResponse(c, 'LIST_FAILED', 'Failed to list share links');
  }
});
