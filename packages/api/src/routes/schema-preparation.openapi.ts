import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  SchemaPreparationApplyInputSchema,
  SchemaPreparationInputSchema,
  SchemaPreparationPreviewSchema,
  SchemaPreparationResultSchema,
} from '@t3x-dev/api-client';
import { ConflictError, DraftAuthoringConflictError } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { SchemaSourceUnavailableError } from '../lib/schema-studio';
import { StudioError } from '../lib/schema-studio-preview';
import {
  requireTransitionAuthority,
  TransitionProjectScopeDeniedError,
  TransitionScopeDeniedError,
  transitionApiKey,
} from '../lib/transition-authority';
import {
  prepareWorkspaceSchema,
  previewWorkspaceSchemaPreparation,
} from '../lib/workspace-schema-preparation';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

const params = z.object({ projectId: z.string().min(1), workspaceId: z.string().min(1) });
const error = {
  description: 'Schema preparation rejected',
  content: { 'application/json': { schema: ErrorResponseSchema } },
};
const errors = { 400: error, 403: error, 404: error, 409: error };
const previewRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/schema-studio/preparation/{workspaceId}/preview',
  tags: ['YSchema'],
  request: {
    params,
    body: { content: { 'application/json': { schema: SchemaPreparationInputSchema } } },
  },
  responses: {
    ...errors,
    200: {
      description: 'Read-only guarded content migration preview',
      content: {
        'application/json': { schema: SuccessResponseSchema(SchemaPreparationPreviewSchema) },
      },
    },
  },
});
const applyRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/schema-studio/preparation/{workspaceId}',
  tags: ['YSchema'],
  request: {
    params,
    body: { content: { 'application/json': { schema: SchemaPreparationApplyInputSchema } } },
  },
  responses: {
    ...errors,
    200: {
      description:
        'Schema binding and content prepared atomically in one Draft revision; no Commit',
      content: {
        'application/json': { schema: SuccessResponseSchema(SchemaPreparationResultSchema) },
      },
    },
  },
});
export const schemaPreparationRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });
schemaPreparationRoutes.onError((error, c) => {
  if (error instanceof SchemaSourceUnavailableError)
    return errorResponse(c, 'FORBIDDEN', error.message);
  if (error instanceof StudioError) return errorResponse(c, error.code, error.message);
  if (error instanceof ConflictError || error instanceof DraftAuthoringConflictError)
    return errorResponse(c, 'CONFLICT', error.message);
  if (
    error instanceof TransitionScopeDeniedError ||
    error instanceof TransitionProjectScopeDeniedError
  )
    return errorResponse(c, 'FORBIDDEN', error.message);
  if (error instanceof TypeError) return errorResponse(c, 'INVALID_REQUEST', error.message);
  throw error;
});
schemaPreparationRoutes.openapi(previewRoute, async (c) => {
  const db = await getDB();
  const { projectId, workspaceId } = c.req.valid('param');
  const access = await assertProjectAccess(c, db, projectId, 'project:read');
  if (access instanceof Response) return access;
  requireTransitionAuthority({
    apiKey: transitionApiKey(c),
    projectId,
    scope: 'transition:inspect',
  });
  const result = await previewWorkspaceSchemaPreparation(
    c,
    db,
    projectId,
    workspaceId,
    c.req.valid('json')
  );
  c.header('Cache-Control', 'private, no-store');
  return c.json({ success: true as const, data: result.view }, 200);
});
schemaPreparationRoutes.openapi(applyRoute, async (c) => {
  const db = await getDB();
  const { projectId, workspaceId } = c.req.valid('param');
  const access = await assertProjectAccess(c, db, projectId, 'project:edit');
  if (access instanceof Response) return access;
  const principal = requireTransitionAuthority({
    apiKey: transitionApiKey(c),
    projectId,
    scope: 'transition:propose',
  });
  const result = await prepareWorkspaceSchema(
    c,
    db,
    projectId,
    workspaceId,
    c.req.valid('json'),
    principal.actor
  );
  return c.json({ success: true as const, data: result }, 200);
});
