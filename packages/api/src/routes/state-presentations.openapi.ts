import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  StatePresentationInputSchema,
  StatePresentationResultSchema,
  StatePresentationSchema,
} from '@t3x-dev/api-client';
import { createStatePresentation } from '@t3x-dev/application';
import {
  findStatePresentation,
  getVerifiedTransitionCommitGraph,
  insertStatePresentation,
} from '@t3x-dev/storage';
import { bodyLimit } from 'hono/body-limit';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess, getProjectAccessPrincipal } from '../lib/project-access';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const statePresentationRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });
statePresentationRoutes.use(
  '/v1/projects/:projectId/commits/:commitDigest/presentation',
  bodyLimit({
    maxSize: 4 * 1024 * 1024,
    onError: (c) =>
      c.json(
        {
          success: false,
          error: { code: 'PAYLOAD_TOO_LARGE', message: 'Presentation exceeds 4 MiB request limit' },
        },
        413
      ),
  })
);
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const params = z.object({ projectId: z.string().min(1), commitDigest: digest });
const responses = {
  200: {
    description: 'Exact author sidecar or no presentation',
    content: {
      'application/json': { schema: SuccessResponseSchema(StatePresentationResultSchema) },
    },
  },
  400: {
    description: 'Invalid author content',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  403: {
    description: 'Project access denied',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  404: {
    description: 'Project or commit not found',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  409: {
    description: 'Immutable publication or digest mismatch',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  413: {
    description: 'Payload too large',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
};
const getPresentationRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/commits/{commitDigest}/presentation',
  tags: ['Commits'],
  summary: 'Read the immutable author presentation for an exact commit',
  request: { params, query: z.object({ presentation_digest: digest.optional() }) },
  responses,
});
statePresentationRoutes.openapi(getPresentationRoute, async (c) => {
  const { projectId, commitDigest } = c.req.valid('param');
  const expected = c.req.valid('query').presentation_digest;
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId, 'project:read');
  if (access instanceof Response) return access;
  const graph = await getVerifiedTransitionCommitGraph(db, projectId, commitDigest);
  if (!graph) return errorResponse(c, 'COMMIT_NOT_FOUND', 'Commit not found in project');
  const row = await findStatePresentation(db, projectId, commitDigest);
  let presentation: ReturnType<typeof createStatePresentation> | null = null;
  if (row) {
    try {
      const saved = StatePresentationSchema.parse({
        digest: row.presentationDigest,
        document: row.document,
      });
      presentation = createStatePresentation({
        ...saved.document,
        avatarPath: saved.document.avatarPath ?? undefined,
      });
      if (presentation.digest !== row.presentationDigest) throw new Error('Digest mismatch');
    } catch {
      return errorResponse(
        c,
        'HASH_CONFLICT',
        'Stored author presentation failed integrity verification'
      );
    }
  }
  if (expected && expected !== presentation?.digest)
    return errorResponse(c, 'HASH_CONFLICT', 'Presentation does not match the requested revision');
  c.header('Cache-Control', 'private, no-store');
  return c.json(
    {
      success: true as const,
      data: {
        commitDigest,
        stateDigest: graph.commit.result.digest,
        presentation,
        createdBy: row?.createdBy ?? null,
        createdAt: row?.createdAt.toISOString() ?? null,
      },
    },
    200
  );
});
const publishPresentationRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/commits/{commitDigest}/presentation',
  tags: ['Commits'],
  summary: 'Publish author content once for an exact commit; repeats are idempotent',
  request: {
    params,
    body: { content: { 'application/json': { schema: StatePresentationInputSchema } } },
  },
  responses,
});
statePresentationRoutes.openapi(publishPresentationRoute, async (c) => {
  const { projectId, commitDigest } = c.req.valid('param');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId, 'project:edit');
  if (access instanceof Response) return access;
  const graph = await getVerifiedTransitionCommitGraph(db, projectId, commitDigest);
  if (!graph) return errorResponse(c, 'COMMIT_NOT_FOUND', 'Commit not found in project');
  let presentation: ReturnType<typeof createStatePresentation>;
  try {
    presentation = createStatePresentation(c.req.valid('json'));
  } catch (error) {
    return errorResponse(
      c,
      'INVALID_REQUEST',
      error instanceof Error ? error.message : 'Invalid presentation'
    );
  }
  const principal = getProjectAccessPrincipal(c);
  const createdBy =
    principal?.principalKind === 'agent' || principal?.principalKind === 'service'
      ? `${principal.principalKind}:${principal.keyId}`
      : principal?.userId
        ? `human:${principal.userId}`
        : 'local';
  const row = await insertStatePresentation(db, {
    projectId,
    commitDigest,
    presentationDigest: presentation.digest,
    document: presentation.document,
    createdBy,
  });
  if (row.presentationDigest !== presentation.digest)
    return errorResponse(
      c,
      'CONFLICT',
      'This commit already has immutable author content. Publish edits with a new commit.'
    );
  c.header('Cache-Control', 'private, no-store');
  return c.json(
    {
      success: true as const,
      data: {
        commitDigest,
        stateDigest: graph.commit.result.digest,
        presentation,
        createdBy: row.createdBy,
        createdAt: row.createdAt.toISOString(),
      },
    },
    200
  );
});
