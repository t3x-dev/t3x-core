import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { StateOverviewSchema, StatePresentationSchema } from '@t3x-dev/api-client';
import { buildCommittedStateOverview } from '@t3x-dev/application';
import { findStatePresentation, getVerifiedTransitionCommitGraph } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const stateOverviewRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });
const getOverviewRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/commits/{commitDigest}/overview',
  tags: ['Commits'],
  summary: 'Read exact State, generic sections and optional author presentation',
  request: {
    params: z.object({ projectId: z.string().min(1), commitDigest: digest }),
    query: z.object({ state_digest: digest.optional(), presentation_digest: digest.optional() }),
  },
  responses: {
    200: {
      description: 'Generic Overview; schema resolution and validation not executed',
      content: { 'application/json': { schema: SuccessResponseSchema(StateOverviewSchema) } },
    },
    400: {
      description: 'Invalid revision',
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
      description: 'Revision or presentation integrity mismatch',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});
stateOverviewRoutes.openapi(getOverviewRoute, async (c) => {
  const { projectId, commitDigest } = c.req.valid('param');
  const query = c.req.valid('query');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId, 'project:read');
  if (access instanceof Response) return access;
  const graph = await getVerifiedTransitionCommitGraph(db, projectId, commitDigest);
  if (!graph) return errorResponse(c, 'COMMIT_NOT_FOUND', 'Commit not found in project');
  const row = await findStatePresentation(db, projectId, commitDigest);
  try {
    const data = buildCommittedStateOverview({
      commitDigest,
      commit: graph.commit,
      state: graph.state,
      expectedStateDigest: query.state_digest,
      expectedPresentationDigest: query.presentation_digest,
      presentation: row
        ? {
            commitDigest,
            snapshot: StatePresentationSchema.parse({
              digest: row.presentationDigest,
              document: row.document,
            }),
          }
        : undefined,
    });
    c.header('Cache-Control', 'private, no-store');
    return c.json({ success: true as const, data }, 200);
  } catch {
    return errorResponse(
      c,
      'HASH_CONFLICT',
      'Overview revision or author presentation failed integrity verification'
    );
  }
});
