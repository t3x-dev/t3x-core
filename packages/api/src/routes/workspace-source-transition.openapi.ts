import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  ConflictError,
  TransitionHeadConflictError,
  TransitionRefHeadIntegrityError,
  TransitionRefNotFoundError,
} from '@t3x-dev/storage';
import { TransitionProtocolError } from '@t3x-dev/transition';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess, getUserId } from '../lib/project-access';
import {
  decideWorkspaceSourceRevert,
  decideWorkspaceSourceTransition,
  reviewWorkspaceSourceRevert,
  reviewWorkspaceSourceTransition,
  WORKSPACE_SOURCE_ARTIFACT_FORMAT,
  WorkspaceSourceArtifactError,
  WorkspaceSourceInputsError,
  WorkspaceSourceRevertUnavailableError,
  type WorkspaceSourceTransitionCapabilities,
  type WorkspaceSourceTransitionPrecondition,
} from '../lib/workspace-source-transition';
import {
  WorkspaceTransitionDecisionDeniedError,
  WorkspaceTransitionLegacyHeadError,
  WorkspaceTransitionNotFoundError,
  WorkspaceTransitionReviewStaleError,
} from '../lib/workspace-transition';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

const TransitionDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const PortablePathSchema = z.string().trim().min(1).max(500);

const SourceMaterialSelectorSchema = z
  .object({
    material_id: z.string().trim().min(1),
    content_hash: z.string().trim().min(1).optional(),
  })
  .strict();

const SourceArtifactSelectorSchema = z
  .object({
    format: z.literal(WORKSPACE_SOURCE_ARTIFACT_FORMAT),
    root_path: PortablePathSchema,
    resources: z
      .array(
        z
          .object({
            path: PortablePathSchema,
            material_id: z.string().trim().min(1),
            content_hash: z.string().trim().min(1).optional(),
          })
          .strict()
      )
      .max(1000)
      .default([]),
  })
  .strict();

const SourcePathSegmentSchema = z.union([
  z.string().min(1).max(500),
  z.number().int().nonnegative(),
]);
const SourceReplaceScalarOperationSchema = z
  .object({
    op: z.literal('replace_scalar'),
    path: z.array(SourcePathSegmentSchema).min(1).max(100),
    expect: z.string(),
    value: z.string(),
  })
  .strict();
const SourceChangeSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('import'), root: SourceMaterialSelectorSchema }).strict(),
  z
    .object({
      mode: z.literal('edit'),
      operations: z.array(SourceReplaceScalarOperationSchema).min(1).max(100),
    })
    .strict(),
]);

const WorkspaceSourceTransitionPreconditionSchema = z
  .object({
    workspace_revision: z.number().int().min(1),
    ref_head: TransitionDigestSchema.nullable(),
    source_selector_digest: TransitionDigestSchema,
    source_input_manifest_digest: TransitionDigestSchema.nullable(),
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

const ReviewWorkspaceSourceTransitionRequestSchema = z
  .object({
    artifact: SourceArtifactSelectorSchema,
    change: SourceChangeSchema,
    why: z.string().trim().min(1).max(2000).optional(),
    if_revision: z.number().int().min(1).optional(),
  })
  .strict();

const DecideWorkspaceSourceTransitionRequestSchema = z
  .object({
    artifact: SourceArtifactSelectorSchema,
    change: SourceChangeSchema,
    why: z.string().trim().min(1).max(2000).optional(),
    outcome: z.enum(['accepted', 'overridden', 'rejected']),
    decision_reason: z.string().trim().min(1).max(2000).optional(),
    precondition: WorkspaceSourceTransitionPreconditionSchema,
  })
  .strict();

const ReviewWorkspaceSourceRevertRequestSchema = z
  .object({
    commit_id: TransitionDigestSchema,
    why: z.string().trim().min(1).max(2000).optional(),
    if_revision: z.number().int().min(1).optional(),
  })
  .strict();

const DecideWorkspaceSourceRevertRequestSchema = z
  .object({
    commit_id: TransitionDigestSchema,
    why: z.string().trim().min(1).max(2000).optional(),
    outcome: z.enum(['accepted', 'overridden', 'rejected']),
    decision_reason: z.string().trim().min(1).max(2000).optional(),
    precondition: WorkspaceSourceTransitionPreconditionSchema,
  })
  .strict();

const WorkspaceSourceRunnerStatusSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('not_configured') }).strict(),
  z
    .object({
      mode: z.literal('inputs_unavailable'),
      reason: z.enum(['secret_resolver_unavailable', 'secret_resolution_failed']),
      secretReferenceNames: z.array(z.string()),
    })
    .strict(),
  z
    .object({
      mode: z.literal('no_statement'),
      reason: z.enum(['environment_required', 'timed_out']),
    })
    .strict(),
  z
    .object({
      mode: z.literal('statement'),
      statementDigest: TransitionDigestSchema,
      outcome: z.enum(['passed', 'failed']),
    })
    .strict(),
]);

const WorkspaceSourceTransitionReviewResponseSchema = z.object({
  transition: z.any(),
  precondition: WorkspaceSourceTransitionPreconditionSchema,
  runner: WorkspaceSourceRunnerStatusSchema,
});

const WorkspaceSourceTransitionDecisionResponseSchema =
  WorkspaceSourceTransitionReviewResponseSchema.extend({
    decision_digest: TransitionDigestSchema,
    commit: z.any().optional(),
    workspace: z.record(z.string(), z.unknown()).optional(),
  });

const WorkspaceSourceTransitionParamsSchema = z.object({
  projectId: z.string(),
  workspaceId: z.string(),
});

const reviewRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/source-transition/review',
  tags: ['Workspaces'],
  summary: 'Review an exact-source Workspace Transition',
  request: {
    params: WorkspaceSourceTransitionParamsSchema,
    body: {
      content: { 'application/json': { schema: ReviewWorkspaceSourceTransitionRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Derived exact-source Transition review',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(WorkspaceSourceTransitionReviewResponseSchema),
        },
      },
    },
    400: {
      description: 'Invalid or unsupported source artifact',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Project access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Workspace, Material, or target ref not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Workspace or ref facts changed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Stored Transition integrity verification failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const decideRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/source-transition/decide',
  tags: ['Workspaces'],
  summary: 'Decide and optionally commit an exact-source Workspace Transition',
  request: {
    params: WorkspaceSourceTransitionParamsSchema,
    body: {
      content: { 'application/json': { schema: DecideWorkspaceSourceTransitionRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Audited Decision and optional committed exact-source Transition',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(WorkspaceSourceTransitionDecisionResponseSchema),
        },
      },
    },
    400: {
      description: 'Invalid Decision or source request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Project access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Workspace, Material, or target ref not found',
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

const reviewRevertRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/source-transition/revert/review',
  tags: ['Workspaces'],
  summary: 'Review a server-derived revert of the current exact-source edit',
  request: {
    params: WorkspaceSourceTransitionParamsSchema,
    body: {
      content: { 'application/json': { schema: ReviewWorkspaceSourceRevertRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Derived exact-source revert review',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(WorkspaceSourceTransitionReviewResponseSchema),
        },
      },
    },
    400: {
      description: 'The selected commit is not a reversible exact-source edit',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Project access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Workspace, selected commit, or target ref not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Workspace, selected commit, or ref facts changed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Stored Transition integrity verification failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const decideRevertRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/source-transition/revert/decide',
  tags: ['Workspaces'],
  summary: 'Decide and optionally commit a reviewed exact-source revert',
  request: {
    params: WorkspaceSourceTransitionParamsSchema,
    body: {
      content: { 'application/json': { schema: DecideWorkspaceSourceRevertRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Audited Decision and optional committed revert Transition',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(WorkspaceSourceTransitionDecisionResponseSchema),
        },
      },
    },
    400: {
      description: 'Invalid Decision or revert request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Project access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Workspace, selected commit, or target ref not found',
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

function actorFromContext(c: Parameters<typeof getUserId>[0]) {
  const userId = getUserId(c);
  return {
    kind: 'human' as const,
    id: userId ? `user:${userId}` : 'human:local-user',
  };
}

function artifactFromWire(
  artifact: z.infer<typeof SourceArtifactSelectorSchema>
): Parameters<typeof reviewWorkspaceSourceTransition>[1]['artifact'] {
  return {
    format: artifact.format,
    rootPath: artifact.root_path,
    resources: artifact.resources.map((resource) => ({
      path: resource.path,
      materialId: resource.material_id,
      ...(resource.content_hash === undefined ? {} : { contentHash: resource.content_hash }),
    })),
  };
}

function changeFromWire(
  change: z.infer<typeof SourceChangeSchema>
): Parameters<typeof reviewWorkspaceSourceTransition>[1]['change'] {
  if (change.mode === 'import') {
    return {
      mode: 'import',
      root: {
        materialId: change.root.material_id,
        ...(change.root.content_hash === undefined
          ? {}
          : { contentHash: change.root.content_hash }),
      },
    };
  }
  return {
    mode: 'edit',
    operations: change.operations.map((operation) => ({
      op: operation.op,
      path: [...operation.path],
      expect: operation.expect,
      value: operation.value,
    })),
  };
}

function preconditionToWire(precondition: WorkspaceSourceTransitionPrecondition) {
  return {
    workspace_revision: precondition.workspaceRevision,
    ref_head: precondition.refHead,
    source_selector_digest: precondition.sourceSelectorDigest,
    source_input_manifest_digest: precondition.sourceInputManifestDigest,
    effect_digest: precondition.effectDigest,
    proposal_digest: precondition.proposalDigest,
    statement_digests: [...precondition.statementDigests],
    policy_digest: precondition.policyDigest,
  };
}

function preconditionFromWire(
  precondition: z.infer<typeof WorkspaceSourceTransitionPreconditionSchema>
): WorkspaceSourceTransitionPrecondition {
  return {
    workspaceRevision: precondition.workspace_revision,
    refHead: precondition.ref_head,
    sourceSelectorDigest: precondition.source_selector_digest,
    sourceInputManifestDigest: precondition.source_input_manifest_digest,
    effectDigest: precondition.effect_digest,
    proposalDigest: precondition.proposal_digest,
    statementDigests: [...precondition.statement_digests],
    policyDigest: precondition.policy_digest,
  };
}

function sourceTransitionErrorResponse(c: Parameters<typeof errorResponse>[0], error: unknown) {
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
    error instanceof WorkspaceTransitionReviewStaleError ||
    error instanceof TransitionHeadConflictError
  ) {
    return errorResponse(c, 'STALE_REVIEW', 'Workspace or ref facts changed; review again.');
  }
  if (error instanceof WorkspaceTransitionDecisionDeniedError) {
    return errorResponse(c, 'DECISION_NOT_PERMITTED', error.message, {
      failures: error.failures,
    });
  }
  if (error instanceof WorkspaceSourceArtifactError) {
    return errorResponse(c, 'INVALID_REQUEST', error.message, error.details);
  }
  if (error instanceof WorkspaceSourceInputsError) {
    return errorResponse(c, 'VALIDATION_INPUT_NOT_SUPPORTED', error.message, {
      issues: error.issues,
    });
  }
  if (error instanceof WorkspaceSourceRevertUnavailableError) {
    return errorResponse(c, 'INVALID_REQUEST', error.message);
  }
  if (error instanceof TransitionProtocolError) {
    return errorResponse(c, 'INVALID_REQUEST', error.message, {
      protocol_code: error.code,
    });
  }
  if (error instanceof TransitionRefHeadIntegrityError) {
    return errorResponse(c, 'VERIFY_FAILED', error.message);
  }
  if (error instanceof TypeError) {
    return errorResponse(c, 'INVALID_REQUEST', error.message);
  }
  console.error(error);
  return errorResponse(c, 'INTERNAL_ERROR', 'Workspace source Transition operation failed');
}

export function createWorkspaceSourceTransitionRoutes(
  capabilities: WorkspaceSourceTransitionCapabilities = {}
) {
  const routes = new OpenAPIHono({ defaultHook: zodErrorHook });

  routes.openapi(reviewRoute, async (c) => {
    const { projectId, workspaceId } = c.req.valid('param');
    const request = c.req.valid('json');
    const db = await getDB();
    const access = await assertProjectAccess(c, db, projectId);
    if (access instanceof Response) return access;

    try {
      const reviewed = await reviewWorkspaceSourceTransition(
        db,
        {
          projectId,
          workspaceId,
          artifact: artifactFromWire(request.artifact),
          change: changeFromWire(request.change),
          why: request.why,
          expectedRevision: request.if_revision,
          actor: actorFromContext(c),
        },
        capabilities
      );
      return c.json({
        success: true as const,
        data: {
          transition: reviewed.transition,
          precondition: preconditionToWire(reviewed.precondition),
          runner: reviewed.runner,
        },
      });
    } catch (error) {
      return sourceTransitionErrorResponse(c, error);
    }
  });

  routes.openapi(decideRoute, async (c) => {
    const { projectId, workspaceId } = c.req.valid('param');
    const request = c.req.valid('json');
    const db = await getDB();
    const access = await assertProjectAccess(c, db, projectId);
    if (access instanceof Response) return access;

    try {
      const decided = await decideWorkspaceSourceTransition(
        db,
        {
          projectId,
          workspaceId,
          artifact: artifactFromWire(request.artifact),
          change: changeFromWire(request.change),
          why: request.why,
          outcome: request.outcome,
          decisionReason: request.decision_reason,
          precondition: preconditionFromWire(request.precondition),
          actor: actorFromContext(c),
        },
        capabilities
      );
      return c.json({
        success: true as const,
        data: {
          transition: decided.transition,
          precondition: preconditionToWire(decided.precondition),
          runner: decided.runner,
          decision_digest: decided.decisionDigest,
          ...(decided.commit === undefined ? {} : { commit: decided.commit }),
          ...(decided.workspace === undefined ? {} : { workspace: decided.workspace }),
        },
      });
    } catch (error) {
      return sourceTransitionErrorResponse(c, error);
    }
  });

  routes.openapi(reviewRevertRoute, async (c) => {
    const { projectId, workspaceId } = c.req.valid('param');
    const request = c.req.valid('json');
    const db = await getDB();
    const access = await assertProjectAccess(c, db, projectId);
    if (access instanceof Response) return access;

    try {
      const reviewed = await reviewWorkspaceSourceRevert(
        db,
        {
          projectId,
          workspaceId,
          commitId: request.commit_id,
          why: request.why,
          expectedRevision: request.if_revision,
          actor: actorFromContext(c),
        },
        capabilities
      );
      return c.json({
        success: true as const,
        data: {
          transition: reviewed.transition,
          precondition: preconditionToWire(reviewed.precondition),
          runner: reviewed.runner,
        },
      });
    } catch (error) {
      return sourceTransitionErrorResponse(c, error);
    }
  });

  routes.openapi(decideRevertRoute, async (c) => {
    const { projectId, workspaceId } = c.req.valid('param');
    const request = c.req.valid('json');
    const db = await getDB();
    const access = await assertProjectAccess(c, db, projectId);
    if (access instanceof Response) return access;

    try {
      const decided = await decideWorkspaceSourceRevert(
        db,
        {
          projectId,
          workspaceId,
          commitId: request.commit_id,
          why: request.why,
          outcome: request.outcome,
          decisionReason: request.decision_reason,
          precondition: preconditionFromWire(request.precondition),
          actor: actorFromContext(c),
        },
        capabilities
      );
      return c.json({
        success: true as const,
        data: {
          transition: decided.transition,
          precondition: preconditionToWire(decided.precondition),
          runner: decided.runner,
          decision_digest: decided.decisionDigest,
          ...(decided.commit === undefined ? {} : { commit: decided.commit }),
          ...(decided.workspace === undefined ? {} : { workspace: decided.workspace }),
        },
      });
    } catch (error) {
      return sourceTransitionErrorResponse(c, error);
    }
  });

  return routes;
}

export const workspaceSourceTransitionRoutes = createWorkspaceSourceTransitionRoutes();
