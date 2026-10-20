import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { StudioPublishInputSchema, StudioPublishResultSchema } from '@t3x-dev/api-client';
import { ConflictError, DraftAuthoringConflictError } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { StudioError } from '../lib/schema-studio-preview';
import { publishStudioSchema } from '../lib/schema-studio-publish';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

const failure = {
  description: 'Publication rejected',
  content: { 'application/json': { schema: ErrorResponseSchema } },
};
const publishRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/schema-studio/publish/{workspaceId}',
  tags: ['YSchema'],
  summary: 'Publish the exact checked candidate as a public, repository-independent Schema',
  request: {
    params: z.object({ projectId: z.string().min(1), workspaceId: z.string().min(1) }),
    body: { content: { 'application/json': { schema: StudioPublishInputSchema } } },
  },
  responses: {
    200: {
      description:
        'Public Blueprint release retained independently; Workspace and upstream unchanged',
      content: {
        'application/json': { schema: SuccessResponseSchema(StudioPublishResultSchema) },
      },
    },
    400: failure,
    403: failure,
    404: failure,
    409: failure,
  },
});
export const schemaPublishRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });
schemaPublishRoutes.openapi(publishRoute, async (c) => {
  const db = await getDB();
  const { projectId, workspaceId } = c.req.valid('param');
  const access = await assertProjectAccess(c, db, projectId, 'project:edit');
  if (access instanceof Response) return access;
  try {
    const data = await publishStudioSchema(c, db, projectId, workspaceId, c.req.valid('json'));
    return c.json({ success: true as const, data }, 200);
  } catch (error) {
    if (error instanceof StudioError) return errorResponse(c, error.code, error.message);
    if (
      error instanceof ConflictError ||
      error instanceof DraftAuthoringConflictError ||
      (error instanceof Error && /immutable|identity conflict/.test(error.message))
    )
      return errorResponse(
        c,
        'CONFLICT',
        'The candidate changed or this immutable name/version already has different content.'
      );
    throw error;
  }
});
