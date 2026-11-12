import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { findRepositoryObjectAddress, getTransitionReviewSnapshot } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { createError } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

const NumberKey = /^[1-9][0-9]{0,17}$/;
const ExactKeys = {
  commit: /^sha256:[0-9a-f]{64}$/,
  review: /^rvs_[0-9a-f]{32}$/,
};

const resolveAddress = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/object-addresses/{kind}/{key}',
  tags: ['Repositories'],
  summary: 'Resolve a project-scoped address for a Commit or fixed Review',
  request: {
    params: z.object({
      projectId: z.string().min(1),
      kind: z.enum(['commit', 'review']),
      key: z.string().min(1).max(71),
    }),
  },
  responses: {
    200: {
      description: 'Exact object address in the requested project',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({ id: z.string(), number: z.string(), workspaceId: z.string().optional() })
          ),
        },
      },
    },
    403: {
      description: 'Project access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Object address not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

export const repositoryObjectAddressRoutes = new OpenAPIHono();

repositoryObjectAddressRoutes.openapi(resolveAddress, async (c) => {
  const { projectId, kind, key } = c.req.valid('param');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;
  const notFound = () => c.json(createError('NOT_FOUND', 'Object address not found.'), 404);
  if (!NumberKey.test(key) && !ExactKeys[kind].test(key)) return notFound();
  const address = await findRepositoryObjectAddress(
    db,
    projectId,
    kind,
    NumberKey.test(key) ? { number: key } : { id: key }
  );
  if (!address) return notFound();
  if (kind === 'review') {
    const snapshot = await getTransitionReviewSnapshot(db, { projectId, snapshotId: address.id });
    if (!snapshot) return notFound();
    return c.json(
      { success: true as const, data: { ...address, workspaceId: snapshot.workspaceId } },
      200
    );
  }
  return c.json({ success: true as const, data: address }, 200);
});
