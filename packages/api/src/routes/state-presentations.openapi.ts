import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  StatePresentationInputSchema,
  StatePresentationResultSchema,
  StatePresentationSchema,
} from '@t3x-dev/api-client';
import { createStatePresentation } from '@t3x-dev/application';
import {
  type AnyDB,
  findStatePresentation,
  getTransitionRefHead,
  getVerifiedTransitionCommitGraph,
  insertStatePresentation,
  TransitionHeadConflictError,
} from '@t3x-dev/storage';
import { bodyLimit } from 'hono/body-limit';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess, getProjectAccessPrincipal } from '../lib/project-access';
import {
  commitRepositoryYOpsState,
  RepositoryStateDecisionDeniedError,
  TransitionReviewStaleError,
} from '../lib/repository-state-transition';
import {
  resolveCompatibilityTransitionWriteAuthority,
  TransitionPolicyBindingRequiredError,
  TransitionProjectScopeDeniedError,
  TransitionScopeDeniedError,
  transitionApiKey,
} from '../lib/transition-authority';
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
statePresentationRoutes.use(
  '/v1/projects/:projectId/refs/:refName/presentation-revisions',
  bodyLimit({ maxSize: 4 * 1024 * 1024 })
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

const revisionParams = z.object({
  projectId: z.string().min(1),
  refName: z.string().min(1).max(200),
});
const revisionResult = z.object({
  commitDigest: digest,
  stateDigest: digest,
  presentationDigest: digest,
});
const authoringRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/refs/{refName}/presentation-authoring',
  tags: ['Commits'],
  summary: 'Read the current authoring target and project edit capability',
  request: { params: revisionParams },
  responses: {
    ...responses,
    200: {
      description: 'Current authoring target',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({ head: digest.nullable(), canEdit: z.boolean() })
          ),
        },
      },
    },
  },
});
statePresentationRoutes.openapi(authoringRoute, async (c) => {
  const { projectId, refName } = c.req.valid('param');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId, 'project:read');
  if (access instanceof Response) return access;
  const editAccess = await assertProjectAccess(c, db, projectId, 'project:edit');
  const head = await getTransitionRefHead(db, { projectId, refName });
  c.header('Cache-Control', 'private, no-store');
  return c.json(
    {
      success: true as const,
      data: {
        head: head.head,
        canEdit: !(editAccess instanceof Response) && head.format === 'transition_v2',
      },
    },
    200
  );
});
const revisePresentationRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/refs/{refName}/presentation-revisions',
  tags: ['Commits'],
  summary: 'Commit new author content atomically without changing business State',
  request: {
    params: revisionParams,
    body: {
      content: {
        'application/json': {
          schema: z
            .object({ expectedHead: digest, presentation: StatePresentationInputSchema })
            .strict(),
        },
      },
    },
  },
  responses: {
    ...responses,
    200: {
      description: 'New committed author revision',
      content: { 'application/json': { schema: SuccessResponseSchema(revisionResult) } },
    },
  },
});
statePresentationRoutes.openapi(revisePresentationRoute, async (c) => {
  const { projectId, refName } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId, 'project:edit');
  if (access instanceof Response) return access;
  let presentation: ReturnType<typeof createStatePresentation>;
  try {
    presentation = createStatePresentation(body.presentation);
  } catch (error) {
    return errorResponse(
      c,
      'INVALID_REQUEST',
      error instanceof Error ? error.message : 'Invalid author content'
    );
  }
  const graph = await getVerifiedTransitionCommitGraph(db, projectId, body.expectedHead);
  if (!graph) return errorResponse(c, 'COMMIT_NOT_FOUND', 'Commit not found in project');
  try {
    const authority = await resolveCompatibilityTransitionWriteAuthority({
      db,
      apiKey: transitionApiKey(c),
      projectId,
      refName,
    });
    let result: z.infer<typeof revisionResult> | undefined;
    await (
      db as unknown as { transaction: (fn: (tx: unknown) => Promise<void>) => Promise<void> }
    ).transaction(async (rawTx) => {
      const tx = rawTx as AnyDB;
      const created = await commitRepositoryYOpsState({
        db: tx,
        projectId,
        refName,
        expectedHead: body.expectedHead,
        target: graph.state,
        actor: authority.principal.actor,
        policyBindingSource: 'server-selected',
        ...(authority.policyBinding === null ? {} : { policyBinding: authority.policyBinding }),
        intent: 'Update project introduction',
      });
      const row = await insertStatePresentation(tx, {
        projectId,
        commitDigest: created.commitDigest,
        presentationDigest: presentation.digest,
        document: presentation.document,
        createdBy: `${authority.principal.actor.kind}:${authority.principal.actor.id}`,
      });
      if (row.presentationDigest !== presentation.digest)
        throw new Error('Presentation publication conflict');
      result = {
        commitDigest: created.commitDigest,
        stateDigest: graph.commit.result.digest,
        presentationDigest: presentation.digest,
      };
    });
    if (!result) throw new Error('Author revision did not commit');
    c.header('Cache-Control', 'private, no-store');
    return c.json({ success: true as const, data: result }, 200);
  } catch (error) {
    if (
      error instanceof TransitionReviewStaleError ||
      error instanceof TransitionHeadConflictError ||
      error instanceof TransitionPolicyBindingRequiredError
    )
      return errorResponse(c, 'CONFLICT', error.message);
    if (
      error instanceof TransitionScopeDeniedError ||
      error instanceof TransitionProjectScopeDeniedError ||
      error instanceof RepositoryStateDecisionDeniedError
    )
      return errorResponse(c, 'FORBIDDEN', error.message);
    throw error;
  }
});
