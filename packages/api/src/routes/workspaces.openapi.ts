/**
 * Workspace flow routes.
 *
 * These endpoints bridge the WebUI workspace review flow with backend-owned
 * candidate/YOps proposal state. The target product path uses LLM proposals
 * before deterministic validation/apply. This preview implementation keeps a
 * deterministic scaffold so local workspace review works without an LLM key.
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type ApiKey,
  type Draft,
  describeTransitionObject,
  type SemanticContent,
  type SourcedYOp,
} from '@t3x-dev/core';
import {
  type AnyDB,
  ConflictError,
  DraftAuthoringConflictError,
  findBranchByName,
  findWorkspaceDraft,
  getLatestTransitionReviewSnapshot,
  getTransitionReviewSnapshot,
  insertYOpsLogEntry,
  listTransitionReviewSnapshots,
  listWorkspaceDrafts,
  type StoredTransitionReviewSnapshot,
  TransitionHeadConflictError,
  TransitionRefHeadIntegrityError,
  TransitionRefNotFoundError,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import {
  TransitionPolicyBindingRequiredError,
  TransitionProjectScopeDeniedError,
  TransitionScopeDeniedError,
} from '../lib/transition-authority';
import { observeTransitionCompatibilityRoute } from '../lib/transition-compatibility-route';
import { decideWorkspaceChange } from '../lib/workspace-change-decision';
import {
  decideWorkspaceTransition,
  reviewWorkspaceTransition,
  WorkspaceTransitionDecisionDeniedError,
  WorkspaceTransitionLegacyHeadError,
  WorkspaceTransitionNotFoundError,
  type WorkspaceTransitionPrecondition,
  WorkspaceTransitionReviewStaleError,
  WorkspaceTransitionSchemaUnavailableError,
} from '../lib/workspace-transition';
import { resolveWorkspaceTransitionAuthority } from '../lib/workspace-transition-authority';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';
import { workspaceDeliveryRoutes } from './workspace-deliveries.openapi';

const SaveWorkspaceRequestSchema = z.object({
  workspace: z.record(z.string(), z.unknown()),
  if_revision: z.number().int().min(1).optional(),
});

const WorkspaceValidationOverrideSchema = z.object({
  kind: z.literal('schema_review'),
  reason: z.string().trim().min(1).max(500),
  blockers: z.array(z.string().trim().min(1)).min(1).max(100),
});

const CommitWorkspaceRequestSchema = z.object({
  content: z.object({
    trees: z.any(),
    relations: z.any().optional(),
  }),
  message: z.string().optional(),
  validationOverride: WorkspaceValidationOverrideSchema.optional(),
  if_revision: z.number().int().min(1).optional(),
});

const TransitionContentSchema = z
  .object({
    trees: z.array(z.any()),
    relations: z.array(z.any()).default([]),
  })
  .strict();

const TransitionDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const WorkspaceTransitionPreconditionSchema = z
  .object({
    workspace_revision: z.number().int().min(1),
    ref_head: TransitionDigestSchema.nullable(),
    effect_digest: TransitionDigestSchema,
    proposal_digest: TransitionDigestSchema,
    statement_digests: z.array(TransitionDigestSchema),
    policy_digest: TransitionDigestSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const sorted = [...value.statement_digests].sort();
    if (
      new Set(value.statement_digests).size !== value.statement_digests.length ||
      value.statement_digests.some((digest, index) => digest !== sorted[index])
    ) {
      context.addIssue({
        code: 'custom',
        path: ['statement_digests'],
        message: 'Statement digests must be unique and sorted',
      });
    }
  });

const ReviewWorkspaceTransitionRequestSchema = z
  .object({
    content: TransitionContentSchema,
    why: z.string().trim().min(1).max(2000).optional(),
    if_revision: z.number().int().min(1).optional(),
  })
  .strict();

const DecideWorkspaceTransitionRequestSchema = z
  .object({
    transition_id: z
      .string()
      .regex(/^trn_[0-9a-f]{32}$/)
      .optional(),
    content: TransitionContentSchema.optional(),
    why: z.string().trim().min(1).max(2000).optional(),
    outcome: z.enum(['accepted', 'overridden', 'rejected']),
    decision_reason: z.string().trim().min(1).max(2000).optional(),
    precondition: WorkspaceTransitionPreconditionSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.transition_id === undefined && value.content === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['content'],
        message: 'content is required when transition_id is not supplied',
      });
    }
  });

const WorkspaceResponseSchema = z.object({
  candidate_id: z.string(),
  yops_draft_id: z.string().optional(),
  workspace: z.record(z.string(), z.unknown()),
});

const WorkspaceCommitResponseSchema = WorkspaceResponseSchema.extend({
  commit: z
    .object({
      hash: TransitionDigestSchema,
      schema: z.literal('t3x/commit/v2'),
      parents: z.array(TransitionDigestSchema),
      decision: TransitionDigestSchema,
      result: TransitionDigestSchema,
    })
    .strict(),
});

const WorkspaceTransitionReviewResponseSchema = z.object({
  transition_id: z.string().regex(/^trn_[0-9a-f]{32}$/),
  transition: z.any(),
  precondition: WorkspaceTransitionPreconditionSchema,
  review_snapshot: z.any(),
  change_projection: z.any(),
});

const WorkspaceTransitionDecisionResponseSchema = WorkspaceTransitionReviewResponseSchema.extend({
  decision_digest: TransitionDigestSchema,
  commit: z.any().optional(),
  workspace: z.record(z.string(), z.unknown()).optional(),
});

const ReviewSnapshotIdSchema = z.string().regex(/^rvs_[0-9a-f]{32}$/);

const WorkspaceTransitionReviewSnapshotResponseSchema = z.object({
  snapshot_id: ReviewSnapshotIdSchema,
  snapshot_digest: TransitionDigestSchema,
  project_id: z.string(),
  workspace_id: z.string(),
  transition_id: z.string().regex(/^trn_[0-9a-f]{32}$/),
  review_digest: TransitionDigestSchema,
  supersedes_snapshot_id: ReviewSnapshotIdSchema.nullable(),
  supersedes_snapshot_digest: TransitionDigestSchema.nullable(),
  snapshot: z.any(),
  change_projection: z.any(),
  created_at: z.string(),
});

const WorkspaceTransitionReviewSnapshotListResponseSchema = z.object({
  snapshots: z.array(WorkspaceTransitionReviewSnapshotResponseSchema),
});

const ListWorkspacesResponseSchema = z.object({
  workspaces: z.array(z.record(z.string(), z.unknown())),
});

const REVIEW_SAVE_STATUSES = new Set(['draft', 'ready_for_yops', 'schema_review']);

type TxRunner = { transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T> };

const projectWorkspacesParams = z.object({
  projectId: z.string(),
});

const workspaceParams = z.object({
  projectId: z.string(),
  workspaceId: z.string(),
});

const workspaceReviewSnapshotParams = workspaceParams.extend({
  snapshotId: ReviewSnapshotIdSchema,
});

const workspaceReviewSnapshotQuery = z.object({
  transition_id: z
    .string()
    .regex(/^trn_[0-9a-f]{32}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50).optional(),
});

const listWorkspacesRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/workspaces',
  tags: ['Workspaces'],
  summary: 'List persisted workspace staged states',
  request: {
    params: projectWorkspacesParams,
  },
  responses: {
    200: {
      description: 'Persisted workspace staged states',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ListWorkspacesResponseSchema),
        },
      },
    },
    403: {
      description: 'Project access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Project not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const getWorkspaceRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}',
  tags: ['Workspaces'],
  summary: 'Read persisted workspace staged state',
  request: {
    params: workspaceParams,
  },
  responses: {
    200: {
      description: 'Persisted workspace staged state',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(WorkspaceResponseSchema),
        },
      },
    },
    404: {
      description: 'Workspace not found',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
    403: {
      description: 'Project access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const saveWorkspaceRoute = createRoute({
  method: 'patch',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}',
  tags: ['Workspaces'],
  summary: 'Save a reviewed workspace staged state',
  request: {
    params: workspaceParams,
    body: {
      content: {
        'application/json': {
          schema: SaveWorkspaceRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Saved workspace staged state',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(WorkspaceResponseSchema),
        },
      },
    },
    403: {
      description: 'Project access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Workspace target branch not found',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
    409: {
      description: 'Workspace revision or target branch conflict',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
  },
});

const commitWorkspaceRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/commit',
  tags: ['Workspaces'],
  summary: 'Commit a reviewed workspace staged state',
  request: {
    params: workspaceParams,
    body: {
      content: {
        'application/json': {
          schema: CommitWorkspaceRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Workspace committed',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(WorkspaceCommitResponseSchema),
        },
      },
    },
    403: {
      description: 'Project access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Workspace not found',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
    409: {
      description: 'Review confirmation, workspace revision, or branch head conflict',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
    500: {
      description: 'Commit failed',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
  },
});

const reviewWorkspaceTransitionRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/transition/review',
  tags: ['Workspaces'],
  summary: 'Build a verified Transition review from persisted Workspace state',
  middleware: observeTransitionCompatibilityRoute('workspace-structured-governance.review'),
  request: {
    params: workspaceParams,
    body: {
      content: {
        'application/json': { schema: ReviewWorkspaceTransitionRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Verified Transition review and immutable review precondition',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(WorkspaceTransitionReviewResponseSchema),
        },
      },
    },
    400: {
      description: 'Invalid Transition target or unavailable Schema',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Project access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Workspace or target ref not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Workspace revision conflict or legacy read-only head',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Stored Transition integrity verification failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const decideWorkspaceTransitionRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/transition/decide',
  tags: ['Workspaces'],
  summary: 'Re-derive, decide, audit, and conditionally commit a Workspace Transition',
  middleware: observeTransitionCompatibilityRoute('workspace-structured-governance.decide'),
  request: {
    params: workspaceParams,
    body: {
      content: {
        'application/json': { schema: DecideWorkspaceTransitionRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Audited Decision and optional committed Transition',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(WorkspaceTransitionDecisionResponseSchema),
        },
      },
    },
    400: {
      description: 'Invalid Decision request or unavailable Schema',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Project access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Workspace or target ref not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Review facts changed or the requested Decision is not permitted',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Stored Transition integrity verification failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const listWorkspaceTransitionReviewSnapshotsRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/transition/review-snapshots',
  tags: ['Workspaces'],
  summary: 'List immutable ReviewSnapshots for a Workspace Transition flow',
  request: {
    params: workspaceParams,
    query: workspaceReviewSnapshotQuery,
  },
  responses: {
    200: {
      description: 'Immutable ReviewSnapshots and derived Changes projections',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(WorkspaceTransitionReviewSnapshotListResponseSchema),
        },
      },
    },
    403: {
      description: 'Project access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Project not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const getLatestWorkspaceTransitionReviewSnapshotRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/transition/review-snapshots/latest',
  tags: ['Workspaces'],
  summary: 'Read the latest immutable ReviewSnapshot for a Workspace Transition flow',
  request: {
    params: workspaceParams,
    query: z.object({
      transition_id: workspaceReviewSnapshotQuery.shape.transition_id,
    }),
  },
  responses: {
    200: {
      description: 'Latest immutable ReviewSnapshot and derived Changes projection',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(WorkspaceTransitionReviewSnapshotResponseSchema),
        },
      },
    },
    403: {
      description: 'Project access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'ReviewSnapshot not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const getWorkspaceTransitionReviewSnapshotRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/transition/review-snapshots/{snapshotId}',
  tags: ['Workspaces'],
  summary: 'Read one immutable ReviewSnapshot for a Workspace Transition flow',
  request: {
    params: workspaceReviewSnapshotParams,
  },
  responses: {
    200: {
      description: 'Immutable ReviewSnapshot and derived Changes projection',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(WorkspaceTransitionReviewSnapshotResponseSchema),
        },
      },
    },
    403: {
      description: 'Project access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'ReviewSnapshot not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

export const workspaceRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});
workspaceRoutes.route('/', workspaceDeliveryRoutes);

workspaceRoutes.onError((error, c) => {
  if (
    error instanceof ConflictError ||
    error instanceof DraftAuthoringConflictError ||
    isWorkspaceIdConflict(error)
  ) {
    return errorResponse(
      c,
      'CONFLICT',
      'Workspace changed since it was loaded. Refresh and retry.'
    );
  }
  if (isWorkspaceBranchConflict(error)) {
    return errorResponse(c, 'CONFLICT', 'Another open workspace already owns this branch.');
  }
  console.error(error);
  return c.text('Internal Server Error', 500);
});

workspaceRoutes.openapi(reviewWorkspaceTransitionRoute, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const { content, why, if_revision: expectedRevision } = c.req.valid('json');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;

  try {
    const authority = await resolveWorkspaceTransitionAuthority({
      db,
      apiKey: c.get('apiKey') as ApiKey | undefined,
      projectId,
      workspaceId,
      operation: { kind: 'review' },
    });
    const reviewed = await reviewWorkspaceTransition(db, {
      projectId,
      workspaceId,
      content,
      why,
      expectedRevision,
      actor: authority.principal.actor,
      policyBinding: authority.policyBinding,
    });
    return c.json({
      success: true as const,
      data: {
        transition_id: reviewed.transitionId,
        transition: reviewed.transition,
        precondition: transitionPreconditionToWire(reviewed.precondition),
        review_snapshot: reviewed.reviewSnapshot,
        change_projection: reviewed.changeProjection,
      },
    });
  } catch (error) {
    return workspaceTransitionErrorResponse(c, error);
  }
});

workspaceRoutes.openapi(decideWorkspaceTransitionRoute, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const {
    content,
    why,
    outcome,
    transition_id: transitionId,
    decision_reason: decisionReason,
    precondition,
  } = c.req.valid('json');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;

  try {
    const authority = await resolveWorkspaceTransitionAuthority({
      db,
      apiKey: c.get('apiKey') as ApiKey | undefined,
      projectId,
      workspaceId,
      operation: { kind: 'decide', outcome },
    });
    const decided = await decideWorkspaceChange(db, {
      projectId,
      workspaceId,
      transitionId,
      content,
      why,
      outcome,
      decisionReason,
      precondition: transitionPreconditionFromWire(precondition),
      actor: authority.principal.actor,
      policyBinding: authority.policyBinding,
    });
    return c.json({
      success: true as const,
      data: {
        transition_id: decided.transitionId,
        transition: decided.transition,
        precondition: transitionPreconditionToWire(decided.precondition),
        decision_digest: decided.decisionDigest,
        review_snapshot: decided.reviewSnapshot,
        change_projection: decided.changeProjection,
        ...(decided.commit === undefined ? {} : { commit: decided.commit }),
        ...(decided.workspace === undefined ? {} : { workspace: decided.workspace }),
      },
    });
  } catch (error) {
    return workspaceTransitionErrorResponse(c, error);
  }
});

workspaceRoutes.openapi(listWorkspaceTransitionReviewSnapshotsRoute, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const { limit, transition_id: transitionId } = c.req.valid('query');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;

  const snapshots = await listTransitionReviewSnapshots(db, {
    projectId,
    workspaceId,
    ...(transitionId ? { transitionId } : {}),
    limit,
  });

  return c.json(
    {
      success: true as const,
      data: { snapshots: snapshots.map(transitionReviewSnapshotToWire) },
    },
    200
  );
});

workspaceRoutes.openapi(getLatestWorkspaceTransitionReviewSnapshotRoute, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const { transition_id: transitionId } = c.req.valid('query');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;

  const snapshot = await getLatestTransitionReviewSnapshot(db, {
    projectId,
    workspaceId,
    ...(transitionId ? { transitionId } : {}),
  });

  if (!snapshot) {
    return errorResponse(c, 'NOT_FOUND', 'ReviewSnapshot not found.');
  }

  return c.json(
    {
      success: true as const,
      data: transitionReviewSnapshotToWire(snapshot),
    },
    200
  );
});

workspaceRoutes.openapi(getWorkspaceTransitionReviewSnapshotRoute, async (c) => {
  const { projectId, snapshotId, workspaceId } = c.req.valid('param');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;

  const snapshot = await getTransitionReviewSnapshot(db, { projectId, snapshotId });
  if (!snapshot || snapshot.workspaceId !== workspaceId) {
    return errorResponse(c, 'NOT_FOUND', 'ReviewSnapshot not found.');
  }

  return c.json(
    {
      success: true as const,
      data: transitionReviewSnapshotToWire(snapshot),
    },
    200
  );
});

// @ts-expect-error - OpenAPI handler return type
workspaceRoutes.openapi(listWorkspacesRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;
  const drafts = await listWorkspaceDrafts(db, projectId);
  const workspaces = drafts.flatMap((draft) =>
    draft.workspace_state ? [workspaceFromDraft(draft, draft.workspace_id ?? draft.id)] : []
  );

  return c.json({
    success: true as const,
    data: { workspaces },
  });
});

// @ts-expect-error - OpenAPI handler return type
workspaceRoutes.openapi(getWorkspaceRoute, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;
  const draft = await findWorkspaceDraft(db, projectId, workspaceId);

  if (!draft?.workspace_state) {
    return c.json(notFoundError('Workspace not found'), 404);
  }

  return c.json({
    success: true as const,
    data: envelopeFromDraft(draft, workspaceId),
  });
});

workspaceRoutes.openapi(saveWorkspaceRoute, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const { workspace, if_revision: ifRevision } = c.req.valid('json');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;
  const storedDraft = await findWorkspaceDraft(db, projectId, workspaceId);
  const storedWorkspace = storedDraft?.workspace_state ?? {};
  const {
    backendCandidateId: _storedBackendCandidateId,
    lastCommitHash: _storedLastCommitHash,
    status: storedStatus,
    ...storedEditableWorkspace
  } = storedWorkspace;
  const {
    backendCandidateId: _ignoredBackendCandidateId,
    lastCommitHash: _ignoredLastCommitHash,
    status,
    ...clientWorkspace
  } = workspace;
  const storedBackendCandidateId = resolveStoredBackendCandidateId(storedWorkspace);
  const nextStatus = resolveReviewSaveStatus(status, storedStatus);
  const savedAt = new Date().toISOString();
  const persistedWorkspace = {
    ...storedEditableWorkspace,
    ...clientWorkspace,
    id: workspaceId,
    projectId,
    updatedAt: savedAt,
    ...(typeof nextStatus === 'string' ? { status: nextStatus } : {}),
    ...(storedBackendCandidateId ? { backendCandidateId: storedBackendCandidateId } : {}),
  };
  const missingTargetBranch = await findMissingWorkspaceTargetBranch(
    db,
    projectId,
    persistedWorkspace
  );
  if (missingTargetBranch) {
    return errorResponse(c, 'NOT_FOUND', `Target branch not found: ${missingTargetBranch}`);
  }
  const draft = await upsertWorkspaceDraft(
    db,
    {
      project_id: projectId,
      workspace_id: workspaceId,
      title: stringFromWorkspace(persistedWorkspace, 'title', workspaceId),
      parent_commit_hash: nullableStringFromWorkspace(persistedWorkspace, 'baseCommitHash'),
      target_branch: stringFromWorkspace(persistedWorkspace, 'targetBranch', 'main'),
      workspace_state: workspaceStateForPersistence(persistedWorkspace),
    },
    ifRevision
  );

  return c.json({
    success: true as const,
    data: envelopeFromDraft(draft, workspaceId),
  });
});

workspaceRoutes.openapi(commitWorkspaceRoute, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const { content, message, validationOverride, if_revision: ifRevision } = c.req.valid('json');

  try {
    const db = await getDB();
    const access = await assertProjectAccess(c, db, projectId);
    if (access instanceof Response) return access;
    const authority = await resolveWorkspaceTransitionAuthority({
      db,
      // @ts-expect-error - OpenAPI context apiKey typing
      apiKey: c.get('apiKey') as ApiKey | undefined,
      projectId,
      workspaceId,
      operation: {
        kind: 'decide',
        outcome: validationOverride ? 'overridden' : 'accepted',
      },
    });
    const commitWorkspace = async (txOrDb: AnyDB) => {
      const storedDraft = await findWorkspaceDraft(txOrDb, projectId, workspaceId);

      if (!storedDraft?.workspace_state) {
        return null;
      }

      if (ifRevision !== undefined && storedDraft.revision !== ifRevision) {
        throw new ConflictError(storedDraft.id, ifRevision);
      }

      const storedWorkspace = storedDraft.workspace_state;
      const commitContent = workspaceCommitContent(content);
      const schemaReviewBlockers = workspaceSchemaReviewBlockers(storedWorkspace, commitContent);
      if (schemaReviewBlockers.length > 0 && !validationOverride) {
        return {
          reviewRequired: errorResponse(
            c,
            'REVIEW_REQUIRED',
            'Explicit confirmation is required to commit unresolved schema review gaps.',
            { blockers: schemaReviewBlockers }
          ),
        };
      }
      if (validationOverride && !sameStringSet(validationOverride.blockers, schemaReviewBlockers)) {
        return {
          reviewRequired: errorResponse(
            c,
            'REVIEW_REQUIRED',
            'Schema review blockers changed. Review them again before forcing the commit.',
            { blockers: schemaReviewBlockers }
          ),
        };
      }
      const why =
        message ??
        `Workspace commit: ${stringFromWorkspace(storedWorkspace, 'title', workspaceId)}`;
      const actor = authority.principal.actor;
      const reviewed = await reviewWorkspaceTransition(txOrDb, {
        projectId,
        workspaceId,
        content: commitContent,
        why,
        expectedRevision: ifRevision,
        actor,
        policyBinding: authority.policyBinding,
      });
      const yopsLogIds = await materializeWorkspaceYOpsLog(
        txOrDb,
        projectId,
        workspaceId,
        storedWorkspace
      );
      const decided = await decideWorkspaceTransition(txOrDb, {
        projectId,
        workspaceId,
        transitionId: reviewed.transitionId,
        content: commitContent,
        why,
        outcome: validationOverride ? 'overridden' : 'accepted',
        decisionReason: validationOverride?.reason,
        precondition: reviewed.precondition,
        actor,
        policyBinding: authority.policyBinding,
        yopsLogIds,
        workspaceCommitOverride: validationOverride,
      });
      if (decided.commit === undefined || decided.workspace === undefined) {
        throw new TypeError('Accepted workspace Decision did not create a CommitV2');
      }
      const descriptor = describeTransitionObject(decided.commit);
      return {
        commit: {
          hash: descriptor.digest,
          schema: decided.commit.schema,
          parents: decided.commit.parents.map((parent) => parent.digest),
          decision: decided.commit.decision.digest,
          result: decided.commit.result.digest,
        },
        workspace: decided.workspace,
      };
    };
    const runner = db as unknown as Partial<TxRunner>;
    const result =
      typeof runner.transaction === 'function'
        ? await runner.transaction((tx) => commitWorkspace(tx as AnyDB))
        : await commitWorkspace(db);

    if (!result) {
      return c.json(notFoundError('Workspace not found'), 404);
    }
    if ('reviewRequired' in result) return result.reviewRequired;

    return c.json({
      success: true as const,
      data: {
        ...envelopeFromWorkspace(result.workspace, workspaceId),
        commit: result.commit,
      },
    });
  } catch (err) {
    if (err instanceof ConflictError) {
      return errorResponse(
        c,
        'CONFLICT',
        'Workspace changed since it was loaded. Refresh and retry.'
      );
    }
    return workspaceTransitionErrorResponse(c, err);
  }
});

function resolveReviewSaveStatus(status: unknown, storedStatus: unknown): string {
  if (status === 'committed') return 'schema_review';
  if (typeof status === 'string' && REVIEW_SAVE_STATUSES.has(status)) return status;
  if (typeof storedStatus === 'string' && REVIEW_SAVE_STATUSES.has(storedStatus)) {
    return storedStatus;
  }
  return 'draft';
}

function resolveStoredBackendCandidateId(
  storedWorkspace: Record<string, unknown>
): string | undefined {
  if (typeof storedWorkspace.backendCandidateId === 'string') {
    return storedWorkspace.backendCandidateId;
  }
  return undefined;
}

function workspaceCommitContent(
  content: z.infer<typeof CommitWorkspaceRequestSchema>['content']
): SemanticContent {
  return {
    trees: content.trees,
    relations: content.relations ?? [],
  };
}

function workspaceSchemaReviewBlockers(
  workspace: Record<string, unknown>,
  content: SemanticContent
): string[] {
  const schemaReview = workspace.schemaReview;
  if (!isRecord(schemaReview)) return [];
  const gaps = Array.isArray(schemaReview.gaps)
    ? schemaReview.gaps.filter(
        (gap): gap is string => typeof gap === 'string' && gap.trim().length > 0
      )
    : [];
  const unresolvedGaps = gaps.filter((gap) => !semanticContentHasPathValue(content, gap));
  if (unresolvedGaps.length > 0) {
    return unresolvedGaps.map((gap) => `Schema review gap: ${gap}`);
  }
  return schemaReview.verdict === 'ready' ? [] : ['Resolve schema review before committing.'];
}

function semanticContentHasPathValue(content: SemanticContent, path: string): boolean {
  if (!Array.isArray(content.trees)) return false;
  const segments = path
    .replaceAll('/', '.')
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) return false;

  return content.trees.some((tree) => treeHasPathValue(tree, segments));
}

function treeHasPathValue(tree: unknown, pathSegments: string[]): boolean {
  if (!isRecord(tree) || typeof tree.key !== 'string') return false;
  const segments = pathSegments[0] === tree.key ? pathSegments.slice(1) : [...pathSegments];
  if (segments.length === 0) return false;
  let node = tree;

  for (const [index, segment] of segments.entries()) {
    const isLast = index === segments.length - 1;
    const slots = isRecord(node.slots) ? node.slots : {};
    if (isLast && segment in slots) return hasWorkspaceValue(slots[segment]);
    const children = Array.isArray(node.children) ? node.children : [];
    const child = children.find((candidate) => isRecord(candidate) && candidate.key === segment);
    if (!child || !isRecord(child)) return false;
    node = child;
  }

  return false;
}

function hasWorkspaceValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return true;
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

interface WorkspaceEnvelope {
  candidate_id: string;
  yops_draft_id?: string;
  workspace: Record<string, unknown>;
}

function envelopeFromDraft(draft: Draft, workspaceId: string): WorkspaceEnvelope {
  const workspace = workspaceFromDraft(draft, workspaceId);
  return envelopeFromWorkspace(workspace, workspaceId);
}

function envelopeFromWorkspace(
  workspace: Record<string, unknown>,
  workspaceId: string
): WorkspaceEnvelope {
  const yopsDraft = workspace.yopsDraft as { id?: unknown } | undefined;

  return {
    candidate_id: candidateIdFromWorkspace(workspace, workspaceId),
    yops_draft_id: typeof yopsDraft?.id === 'string' ? yopsDraft.id : undefined,
    workspace,
  };
}

function workspaceFromDraft(draft: Draft, workspaceId: string): Record<string, unknown> {
  return {
    ...(draft.workspace_state ?? { id: workspaceId, projectId: draft.project_id }),
    revision: draft.revision,
  };
}

function workspaceStateForPersistence(workspace: Record<string, unknown>): Record<string, unknown> {
  const { revision: _revision, ...persistedWorkspace } = workspace;
  return persistedWorkspace;
}

function candidateIdFromWorkspace(workspace: Record<string, unknown>, workspaceId: string): string {
  return typeof workspace.backendCandidateId === 'string'
    ? workspace.backendCandidateId
    : `candidate:${workspaceId}`;
}

function stringFromWorkspace(
  workspace: Record<string, unknown>,
  key: string,
  fallback: string
): string {
  const value = workspace[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

async function findMissingWorkspaceTargetBranch(
  db: AnyDB,
  projectId: string,
  workspace: Record<string, unknown>
): Promise<string | null> {
  const targetBranch = stringFromWorkspace(workspace, 'targetBranch', 'main');
  return (await findBranchByName(db, projectId, targetBranch)) ? null : targetBranch;
}

function nullableStringFromWorkspace(
  workspace: Record<string, unknown>,
  key: string
): string | null {
  const value = workspace[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function notFoundError(message: string) {
  return {
    success: false as const,
    error: { code: 'NOT_FOUND', message },
  };
}

function transitionPreconditionToWire(precondition: WorkspaceTransitionPrecondition) {
  return {
    workspace_revision: precondition.workspaceRevision,
    ref_head: precondition.refHead,
    effect_digest: precondition.effectDigest,
    proposal_digest: precondition.proposalDigest,
    statement_digests: [...precondition.statementDigests],
    policy_digest: precondition.policyDigest,
  };
}

function transitionReviewSnapshotToWire(record: StoredTransitionReviewSnapshot) {
  return {
    snapshot_id: record.snapshotId,
    snapshot_digest: record.snapshotDigest,
    project_id: record.projectId,
    workspace_id: record.workspaceId,
    transition_id: record.transitionId,
    review_digest: record.reviewDigest,
    supersedes_snapshot_id: record.supersedesSnapshotId,
    supersedes_snapshot_digest: record.supersedesSnapshotDigest,
    snapshot: record.snapshot,
    change_projection: record.changeProjection,
    created_at: record.createdAt,
  };
}

function transitionPreconditionFromWire(
  precondition: z.infer<typeof WorkspaceTransitionPreconditionSchema>
): WorkspaceTransitionPrecondition {
  return {
    workspaceRevision: precondition.workspace_revision,
    refHead: precondition.ref_head,
    effectDigest: precondition.effect_digest,
    proposalDigest: precondition.proposal_digest,
    statementDigests: [...precondition.statement_digests],
    policyDigest: precondition.policy_digest,
  };
}

function workspaceTransitionErrorResponse(c: Parameters<typeof errorResponse>[0], error: unknown) {
  if (
    error instanceof TransitionScopeDeniedError ||
    error instanceof TransitionProjectScopeDeniedError ||
    error instanceof TransitionPolicyBindingRequiredError
  ) {
    return errorResponse(c, 'FORBIDDEN', error.message, { protocol_code: error.code });
  }
  if (error instanceof WorkspaceTransitionNotFoundError) {
    return errorResponse(c, 'WORKSPACE_NOT_FOUND', error.message);
  }
  if (error instanceof TransitionRefNotFoundError) {
    return errorResponse(c, 'NOT_FOUND', error.message);
  }
  if (error instanceof WorkspaceTransitionLegacyHeadError) {
    return errorResponse(c, 'LEGACY_HEAD_READ_ONLY', error.message, { head: error.head });
  }
  if (
    error instanceof ConflictError ||
    error instanceof DraftAuthoringConflictError ||
    error instanceof WorkspaceTransitionReviewStaleError ||
    error instanceof TransitionHeadConflictError
  ) {
    return errorResponse(c, 'STALE_REVIEW', 'Workspace or ref facts changed; review again.');
  }
  if (error instanceof WorkspaceTransitionSchemaUnavailableError) {
    return errorResponse(c, 'SCHEMA_UNAVAILABLE', error.message, {
      schema_name: error.schemaName,
      ...(error.version ? { schema_version: error.version } : {}),
    });
  }
  if (error instanceof WorkspaceTransitionDecisionDeniedError) {
    return errorResponse(c, 'DECISION_NOT_PERMITTED', error.message, {
      failures: error.failures,
    });
  }
  if (error instanceof TransitionRefHeadIntegrityError) {
    return errorResponse(c, 'VERIFY_FAILED', error.message);
  }
  if (error instanceof TypeError) {
    return errorResponse(c, 'INVALID_REQUEST', error.message);
  }
  console.error(error);
  return errorResponse(c, 'INTERNAL_ERROR', 'Workspace Transition operation failed');
}

function isWorkspaceBranchConflict(error: unknown): boolean {
  return hasWorkspaceUniqueConstraint(error, 'idx_drafts_open_workspace_branch');
}

function isWorkspaceIdConflict(error: unknown): boolean {
  return hasWorkspaceUniqueConstraint(error, 'idx_drafts_workspace');
}

function hasWorkspaceUniqueConstraint(error: unknown, constraint: string): boolean {
  let current = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (typeof current !== 'object') return false;
    const record = current as Record<string, unknown>;
    if (
      record.code === '23505' &&
      (record.constraint_name === constraint || record.constraint === constraint)
    ) {
      return true;
    }
    current = record.cause;
  }
  return false;
}

async function materializeWorkspaceYOpsLog(
  db: AnyDB,
  projectId: string,
  workspaceId: string,
  workspace: Record<string, unknown>
): Promise<string[]> {
  const operations = workspaceDraftOperations(workspace);
  if (operations.length === 0) return [];
  const conversationId = workspaceConversationId(workspace);
  if (!conversationId) return [];
  const at = new Date().toISOString();
  const yops = operations.flatMap((operation) =>
    workspaceDraftOperationToSourcedYOp(operation, at)
  );
  if (yops.length === 0) return [];

  const record = await insertYOpsLogEntry(db, {
    conversationId,
    metadata: {
      source: 'workspace_commit',
      workspace_id: workspaceId,
      yops_draft_id: workspaceDraftId(workspace),
    },
    pipelineState: 'completed',
    projectId,
    source: 'workspace_draft',
    version: 1,
    yops,
  });
  return [record.id];
}

function workspaceDraftOperations(workspace: Record<string, unknown>): Record<string, unknown>[] {
  const yopsDraft = workspace.yopsDraft;
  if (!isRecord(yopsDraft) || !Array.isArray(yopsDraft.operations)) return [];
  return yopsDraft.operations.filter(isRecord);
}

function workspaceDraftId(workspace: Record<string, unknown>): string | undefined {
  const yopsDraft = workspace.yopsDraft;
  if (!isRecord(yopsDraft)) return undefined;
  return typeof yopsDraft.id === 'string' ? yopsDraft.id : undefined;
}

function workspaceConversationId(workspace: Record<string, unknown>): string | null {
  const sources = workspace.sourceBundle;
  if (!Array.isArray(sources)) return null;
  for (const source of sources) {
    if (!isRecord(source)) continue;
    if (typeof source.conversationId === 'string' && source.conversationId.trim()) {
      return source.conversationId;
    }
    if (source.type === 'chat' && typeof source.id === 'string') {
      const match = source.id.match(/(?:^|:)conv_[A-Za-z0-9_-]+$/);
      if (match) return match[0].replace(/^.*:/, '');
    }
  }
  return null;
}

function workspaceDraftOperationToSourcedYOp(
  operation: Record<string, unknown>,
  at: string
): SourcedYOp[] {
  const opName = typeof operation.op === 'string' ? operation.op.trim().toLowerCase() : '';
  const path = typeof operation.path === 'string' ? operation.path.trim() : '';
  if (!opName || !path) return [];
  const source = { type: 'human' as const, author: 'workspace', at, surface: 'script' as const };
  const value = operation.afterValue ?? '';

  if (opName === 'set') return [{ set: { path, value }, source } as SourcedYOp];
  if (opName === 'add' || opName === 'append') {
    return [
      {
        append: { path: path.replace(/(?:\/|\.)-$/, ''), value },
        source,
      } as SourcedYOp,
    ];
  }
  if (opName === 'populate' && isRecord(operation.afterValue)) {
    return [{ populate: { path, values: operation.afterValue }, source } as SourcedYOp];
  }
  if (opName === 'create' || opName === 'define')
    return [{ define: { path }, source } as SourcedYOp];
  if (opName === 'delete' || opName === 'drop') return [{ drop: { path }, source } as SourcedYOp];
  if (opName === 'unset') return [{ unset: { path }, source } as SourcedYOp];
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
