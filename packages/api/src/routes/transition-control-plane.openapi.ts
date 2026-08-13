import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { type ApiKey, ProposalGenerationDraftSchema } from '@t3x-dev/core';
import {
  ConflictError,
  DecisionNotAuthorizedError,
  TransitionCommandConflictError,
  TransitionCommandIntegrityError,
  TransitionHeadConflictError,
  TransitionMembershipIntegrityError,
  TransitionMembershipNotFoundError,
  TransitionRefHeadIntegrityError,
  TransitionRefNotFoundError,
  TransitionRequestConflictError,
  TransitionStatementConflictError,
} from '@t3x-dev/storage';
import { canonicalizeProtocolValue, TransitionProtocolError } from '@t3x-dev/transition';
import type { Context } from 'hono';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import {
  generateTransitionProposal,
  ProposalGenerationContextError,
  ProposalGenerationDraftError,
  type ProposalGenerationModel,
  ProposalGenerationProviderError,
  type ProposalGenerationRequest,
} from '../lib/proposal-generation';
import { createProposalGenerationPostureProvider } from '../lib/proposal-generation-posture-provider';
import { resolveProviderAndModel } from '../lib/provider-resolver';
import {
  requireTransitionAuthority,
  TransitionProjectScopeDeniedError,
  TransitionScopeDeniedError,
} from '../lib/transition-authority';
import {
  attachTransitionStatement,
  inspectTransition,
  proposeTransition,
  type TransitionControlPlaneOptions,
  TransitionPredicateNotAllowedError,
  verifyTransition,
} from '../lib/transition-control-plane';
import {
  GenerationHumanDecisionRequiredError,
  GenerationPolicyIncompatibleError,
  GenerationPolicyIntegrityError,
} from '../lib/transition-control-plane/applicable-policy';
import {
  commitTransition,
  decideTransition,
  TransitionAutomatedOverrideDeniedError,
  TransitionDecisionDeniedError,
  TransitionDecisionMembershipError,
  TransitionReviewStaleError,
} from '../lib/transition-control-plane/lifecycle';
import {
  resolveCanonicalWorkspaceSourceCommitProjection,
  WorkspaceSourceArtifactError,
  WorkspaceSourceInputsError,
  WorkspaceSourceRevertUnavailableError,
} from '../lib/workspace-source-transition';
import {
  WorkspaceTransitionLegacyHeadError,
  WorkspaceTransitionNotFoundError,
  WorkspaceTransitionReviewStaleError,
  WorkspaceTransitionSchemaUnavailableError,
} from '../lib/workspace-transition';
import { pinoLogger } from '../middleware/logger';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

const TransitionIdSchema = z.string().regex(/^trn_[0-9a-f]{32}$/);
const RequestIdSchema = z.string().trim().min(1).max(200);
const WorkspaceIdSchema = z.string().trim().min(1).max(200);
const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const PortablePathSchema = z.string().trim().min(1).max(500);

const ProtocolValueSchema = z.any().superRefine((value, context) => {
  try {
    canonicalizeProtocolValue(value);
  } catch (error) {
    context.addIssue({
      code: 'custom',
      message: error instanceof Error ? error.message : 'Value is not a protocol value',
    });
  }
});

const SourceArtifactSelectorSchema = z
  .object({
    format: z.literal('t3x.dev/workspace-source-artifact/v1'),
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

const SourceMaterialSelectorSchema = z
  .object({
    material_id: z.string().trim().min(1),
    content_hash: z.string().trim().min(1).optional(),
  })
  .strict();

const SourceReplaceScalarOperationSchema = z
  .object({
    op: z.literal('replace_scalar'),
    path: z
      .array(z.union([z.string().min(1).max(500), z.number().int().nonnegative()]))
      .min(1)
      .max(100),
    expect: z.string(),
    value: z.string(),
  })
  .strict();

const ProposeRequestSchema = z
  .discriminatedUnion('kind', [
    z
      .object({
        kind: z.literal('structured_yops'),
        request_id: RequestIdSchema,
        workspace_id: WorkspaceIdSchema,
        operations: z.array(ProtocolValueSchema).min(1).max(1000).optional(),
        extraction_candidate_id: z.string().trim().min(1).max(200).optional(),
        why: z.string().trim().min(1).max(2000).optional(),
        if_revision: z.number().int().min(1).optional(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('exact_source_import'),
        request_id: RequestIdSchema,
        workspace_id: WorkspaceIdSchema,
        artifact: SourceArtifactSelectorSchema,
        root: SourceMaterialSelectorSchema,
        why: z.string().trim().min(1).max(2000).optional(),
        if_revision: z.number().int().min(1).optional(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('exact_source_edit'),
        request_id: RequestIdSchema,
        workspace_id: WorkspaceIdSchema,
        artifact: SourceArtifactSelectorSchema,
        operations: z.array(SourceReplaceScalarOperationSchema).min(1).max(100),
        why: z.string().trim().min(1).max(2000).optional(),
        if_revision: z.number().int().min(1).optional(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('exact_source_revert'),
        request_id: RequestIdSchema,
        workspace_id: WorkspaceIdSchema,
        commit_id: DigestSchema,
        why: z.string().trim().min(1).max(2000).optional(),
        if_revision: z.number().int().min(1).optional(),
      })
      .strict(),
  ])
  .superRefine((value, context) => {
    if (
      value.kind === 'structured_yops' &&
      (value.operations === undefined) === (value.extraction_candidate_id === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Provide exactly one of operations or extraction_candidate_id',
      });
    }
  });

const ProposalGenerationRequestSchema = z
  .object({
    request_id: RequestIdSchema,
    workspace_id: WorkspaceIdSchema,
    posture: z.enum(['source_only', 'guided', 'recommend']).default('guided'),
    instruction: z.string().trim().min(1).max(20_000),
    source_material_ids: z.array(z.string().trim().min(1).max(200)).max(256).default([]),
    if_revision: z.number().int().min(1).optional(),
    provider: z.string().trim().min(1).max(100).optional(),
    model: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

const VerifyRequestSchema = z.object({ request_id: RequestIdSchema }).strict();
const AttachStatementRequestSchema = z
  .object({
    request_id: RequestIdSchema,
    predicate_type: z.string().trim().min(1).max(500),
    predicate: ProtocolValueSchema,
    subjects: z
      .array(z.enum(['effect', 'result', 'proposal']))
      .min(1)
      .max(3),
  })
  .strict();
const TransitionReviewPreconditionSchema = z
  .object({
    workspace_revision: z.number().int().min(1),
    ref_name: z.string().trim().min(1).max(500),
    ref_head: DigestSchema.nullable(),
    effect_digest: DigestSchema,
    proposal_digest: DigestSchema,
    statement_digests: z.array(DigestSchema).max(1000),
    policy_digest: DigestSchema,
  })
  .strict();
const DecideRequestSchema = z
  .object({
    request_id: RequestIdSchema,
    outcome: z.enum(['accepted', 'overridden', 'rejected']),
    rationale: z.string().trim().min(1).max(2000).optional(),
    precondition: TransitionReviewPreconditionSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.outcome === 'overridden' && value.rationale === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['rationale'],
        message: 'An overridden Decision requires an authored rationale',
      });
    }
    if (value.outcome !== 'overridden' && value.rationale !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['rationale'],
        message: 'Only an overridden Decision accepts a rationale',
      });
    }
  });
const CommitRequestSchema = z
  .object({
    request_id: RequestIdSchema,
    decision_digest: DigestSchema,
    expected_head: DigestSchema.nullable(),
  })
  .strict();
const ProjectParamsSchema = z.object({ projectId: z.string().min(1) });
const TransitionParamsSchema = z.object({
  projectId: z.string().min(1),
  transitionId: TransitionIdSchema,
});

const TransitionEnvelopeSchema = z.object({
  transition_id: TransitionIdSchema,
  reused: z.boolean().optional(),
  view: z.any(),
});
const VerifyEnvelopeSchema = TransitionEnvelopeSchema.extend({
  statements: z.array(z.any()),
  operational_results: z.array(z.any()),
});
const DecisionEnvelopeSchema = TransitionEnvelopeSchema.extend({
  decision_digest: DigestSchema,
  decision: z.any(),
});
const CommitEnvelopeSchema = z.object({
  transition_id: TransitionIdSchema,
  reused: z.boolean(),
  commit_digest: DigestSchema,
  commit: z.any(),
  transition: z.any(),
  workspace: z.record(z.string(), z.unknown()).optional(),
});

function apiKey(c: Context): ApiKey | undefined {
  return c.get('apiKey') as ApiKey | undefined;
}

function wireView(view: Awaited<ReturnType<typeof inspectTransition>>) {
  return {
    transition_id: view.transitionId,
    project_id: view.projectId,
    workspace_id: view.workspaceId,
    request_kind: view.requestKind,
    request_id: view.requestId,
    created_at: view.createdAt,
    precondition: {
      workspace_revision: view.precondition.workspaceRevision,
      ref_name: view.precondition.refName,
      ref_head: view.precondition.refHead,
      effect_digest: view.precondition.effectDigest,
      proposal_digest: view.precondition.proposalDigest,
      statement_digests: view.precondition.statementDigests,
      policy_digest: view.precondition.policyDigest,
    },
    transition: view.transition,
    statements: view.statements.map((statement) => ({
      digest: statement.digest,
      source: statement.source,
      issuer: statement.issuer,
      request_id: statement.requestId,
      created_at: statement.createdAt,
    })),
    ...(view.generation === undefined ? {} : { generation: view.generation }),
  };
}

function wireRequest(body: z.infer<typeof ProposeRequestSchema>) {
  const common = {
    workspaceId: body.workspace_id,
    why: body.why,
    ifRevision: body.if_revision,
  };
  if (body.kind === 'structured_yops') {
    return body.extraction_candidate_id === undefined
      ? { ...common, kind: body.kind, operations: body.operations! }
      : {
          ...common,
          kind: body.kind,
          source: {
            type: 'workspace_extraction_proposal' as const,
            candidateId: body.extraction_candidate_id,
          },
        };
  }
  if (body.kind === 'exact_source_revert') {
    return { ...common, kind: body.kind, commitId: body.commit_id } as const;
  }
  const artifact = {
    format: body.artifact.format,
    rootPath: body.artifact.root_path,
    resources: body.artifact.resources.map((resource) => ({
      path: resource.path,
      materialId: resource.material_id,
      contentHash: resource.content_hash,
    })),
  };
  if (body.kind === 'exact_source_import') {
    return {
      ...common,
      kind: body.kind,
      artifact,
      root: { materialId: body.root.material_id, contentHash: body.root.content_hash },
    } as const;
  }
  return { ...common, kind: body.kind, artifact, operations: body.operations } as const;
}

function wireReviewPrecondition(precondition: z.infer<typeof TransitionReviewPreconditionSchema>) {
  return {
    workspaceRevision: precondition.workspace_revision,
    refName: precondition.ref_name,
    refHead: precondition.ref_head,
    effectDigest: precondition.effect_digest,
    proposalDigest: precondition.proposal_digest,
    statementDigests: precondition.statement_digests,
    policyDigest: precondition.policy_digest,
  };
}

function controlPlaneError(c: Context, error: unknown) {
  if (error instanceof ProposalGenerationProviderError) {
    return errorResponse(c, 'GENERATION_NOT_CONFIGURED', error.message, {
      protocol_code: error.code,
    });
  }
  if (error instanceof ProposalGenerationDraftError) {
    return errorResponse(c, 'GENERATION_FAILED', error.message, {
      protocol_code: error.code,
      issues: error.issues,
    });
  }
  if (
    error instanceof TransitionScopeDeniedError ||
    error instanceof TransitionProjectScopeDeniedError ||
    error instanceof GenerationHumanDecisionRequiredError ||
    error instanceof TransitionAutomatedOverrideDeniedError ||
    error instanceof DecisionNotAuthorizedError
  ) {
    return errorResponse(c, 'FORBIDDEN', error.message, { protocol_code: error.code });
  }
  if (
    error instanceof TransitionMembershipNotFoundError ||
    error instanceof TransitionRefNotFoundError ||
    error instanceof WorkspaceTransitionNotFoundError
  ) {
    return errorResponse(c, 'NOT_FOUND', error.message);
  }
  if (
    error instanceof TransitionRequestConflictError ||
    error instanceof TransitionStatementConflictError ||
    error instanceof TransitionCommandConflictError ||
    error instanceof TransitionHeadConflictError ||
    error instanceof TransitionReviewStaleError ||
    error instanceof TransitionDecisionDeniedError ||
    error instanceof GenerationPolicyIncompatibleError ||
    error instanceof WorkspaceTransitionReviewStaleError ||
    error instanceof ConflictError
  ) {
    return errorResponse(c, 'CONFLICT', error.message, {
      protocol_code: 'code' in error ? String(error.code) : undefined,
    });
  }
  if (
    error instanceof TransitionPredicateNotAllowedError ||
    error instanceof TransitionMembershipIntegrityError ||
    error instanceof TransitionCommandIntegrityError ||
    error instanceof TransitionDecisionMembershipError ||
    error instanceof GenerationPolicyIntegrityError ||
    error instanceof TransitionRefHeadIntegrityError ||
    error instanceof TransitionProtocolError ||
    error instanceof WorkspaceTransitionLegacyHeadError ||
    error instanceof WorkspaceTransitionSchemaUnavailableError ||
    error instanceof WorkspaceSourceArtifactError ||
    error instanceof WorkspaceSourceInputsError ||
    error instanceof WorkspaceSourceRevertUnavailableError ||
    error instanceof ProposalGenerationContextError ||
    error instanceof TypeError
  ) {
    return errorResponse(c, 'INVALID_REQUEST', error.message, {
      protocol_code: 'code' in error ? String(error.code) : undefined,
    });
  }
  pinoLogger.error({ err: error }, 'Transition control-plane operation failed');
  return errorResponse(c, 'INTERNAL_ERROR', 'Transition control-plane operation failed');
}

async function defaultProposalGenerationModel(input: {
  db: Awaited<ReturnType<typeof getDB>>;
  projectId: string;
  request: ProposalGenerationRequest;
}): Promise<ProposalGenerationModel> {
  const resolved = await resolveProviderAndModel({
    db: input.db,
    projectId: input.projectId,
    requestedProvider: input.request.requestedProvider,
    requestedModel: input.request.requestedModel,
    unavailableMessage: 'No configured Proposal generation provider is available',
  });
  if (!resolved.ok) throw new ProposalGenerationProviderError(resolved.message);
  const provider = resolved.provider;
  if (!('generateStructured' in provider) || typeof provider.generateStructured !== 'function') {
    throw new ProposalGenerationProviderError(
      `Provider ${resolved.providerId} does not support strict structured generation`
    );
  }
  return {
    provider: resolved.providerId,
    model: resolved.model,
    async generate(generation) {
      const result = await provider.generateStructured!(
        {
          system: generation.prompt,
          messages: [
            {
              role: 'user',
              content: JSON.stringify({
                profile: generation.profile,
                context: generation.context,
                base: generation.base,
                yschema: generation.yschema.value,
                sources: generation.sources.map((source, sourceIndex) => ({
                  sourceIndex,
                  resource: source.resource,
                  title: source.title,
                  content: source.content,
                })),
                instruction: generation.instruction,
              }),
            },
          ],
        },
        ProposalGenerationDraftSchema,
        { model: resolved.model, temperature: 0, maxTokens: 16_000 }
      );
      return result.data;
    },
  };
}

const generateProposalRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/proposal-generations',
  tags: ['Transition'],
  summary: 'Generate one governed Proposal under a server-owned posture',
  request: {
    params: ProjectParamsSchema,
    body: { content: { 'application/json': { schema: ProposalGenerationRequestSchema } } },
  },
  responses: {
    200: {
      description: 'Generated immutable Transition Proposal',
      content: { 'application/json': { schema: SuccessResponseSchema(TransitionEnvelopeSchema) } },
    },
    400: {
      description: 'Invalid context, model selection, or generated Draft',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Forbidden',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Project or workspace not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Idempotency, policy, or Workspace conflict',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Generation provider returned an invalid Draft',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const proposeRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/transitions',
  tags: ['Transition'],
  summary: 'Propose a durable state transition from a task-level request',
  request: {
    params: ProjectParamsSchema,
    body: { content: { 'application/json': { schema: ProposeRequestSchema } } },
  },
  responses: {
    200: {
      description: 'Proposed transition',
      content: { 'application/json': { schema: SuccessResponseSchema(TransitionEnvelopeSchema) } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Forbidden',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Project or workspace not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Idempotency or state conflict',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const inspectRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/transitions/{transitionId}',
  tags: ['Transition'],
  summary: 'Inspect one project-scoped transition aggregate',
  request: { params: TransitionParamsSchema },
  responses: {
    200: {
      description: 'Transition aggregate',
      content: { 'application/json': { schema: SuccessResponseSchema(TransitionEnvelopeSchema) } },
    },
    403: {
      description: 'Forbidden',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Transition not found in project',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const verifyRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/transitions/{transitionId}/verify',
  tags: ['Transition'],
  summary: 'Replay a transition and collect configured external Statements',
  request: {
    params: TransitionParamsSchema,
    body: { content: { 'application/json': { schema: VerifyRequestSchema } } },
  },
  responses: {
    200: {
      description: 'Verification observations',
      content: { 'application/json': { schema: SuccessResponseSchema(VerifyEnvelopeSchema) } },
    },
    400: {
      description: 'Invalid transition',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Forbidden',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Transition not found in project',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Idempotency conflict',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const attachRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/transitions/{transitionId}/statements',
  tags: ['Transition'],
  summary: 'Attach one allowlisted external Statement using the authenticated issuer',
  request: {
    params: TransitionParamsSchema,
    body: { content: { 'application/json': { schema: AttachStatementRequestSchema } } },
  },
  responses: {
    200: {
      description: 'Attached Statement',
      content: { 'application/json': { schema: SuccessResponseSchema(TransitionEnvelopeSchema) } },
    },
    400: {
      description: 'Predicate or Statement rejected',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Forbidden',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Transition not found in project',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Idempotency conflict',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const decideRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/transitions/{transitionId}/decisions',
  tags: ['Transition'],
  summary: 'Create one immutable Decision under the server-selected policy',
  request: {
    params: TransitionParamsSchema,
    body: { content: { 'application/json': { schema: DecideRequestSchema } } },
  },
  responses: {
    200: {
      description: 'Audited Decision',
      content: { 'application/json': { schema: SuccessResponseSchema(DecisionEnvelopeSchema) } },
    },
    400: {
      description: 'Invalid Decision request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Missing outcome authority or automated override denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Transition not found in project',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Review, policy, or idempotency conflict',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const commitRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/transitions/{transitionId}/commits',
  tags: ['Transition'],
  summary: 'Create CommitV2 and atomically advance its server-selected ref',
  request: {
    params: TransitionParamsSchema,
    body: { content: { 'application/json': { schema: CommitRequestSchema } } },
  },
  responses: {
    200: {
      description: 'Committed Transition',
      content: { 'application/json': { schema: SuccessResponseSchema(CommitEnvelopeSchema) } },
    },
    400: {
      description: 'Invalid Commit request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Missing Commit/ref authority or Decision authorization',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Transition or ref not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Expected-head, Workspace, or idempotency conflict',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

export function createTransitionControlPlaneRoutes(options?: TransitionControlPlaneOptions) {
  const routes = new OpenAPIHono({ defaultHook: zodErrorHook });
  const controlPlaneOptions: TransitionControlPlaneOptions = {
    ...options,
    nativeProviders: [
      ...(options?.nativeProviders ?? []),
      createProposalGenerationPostureProvider({
        supportVerifier: options?.proposalGeneration?.supportVerifier,
      }),
    ],
  };

  routes.openapi(generateProposalRoute, async (c) => {
    const { projectId } = c.req.valid('param');
    const body = c.req.valid('json');
    try {
      const db = await getDB();
      const access = await assertProjectAccess(c, db, projectId);
      if (access instanceof Response) return access;
      const principal = requireTransitionAuthority({
        apiKey: apiKey(c),
        projectId,
        scope: 'transition:propose',
      });
      const request: ProposalGenerationRequest = {
        workspaceId: body.workspace_id,
        posture: body.posture,
        instruction: body.instruction,
        sourceMaterialIds: body.source_material_ids,
        ...(body.if_revision === undefined ? {} : { expectedRevision: body.if_revision }),
        ...(body.provider === undefined ? {} : { requestedProvider: body.provider }),
        ...(body.model === undefined ? {} : { requestedModel: body.model }),
      };
      const result = await generateTransitionProposal({
        db,
        projectId,
        requestId: body.request_id,
        requester: principal.actor,
        request,
        resolveModel: () =>
          options?.proposalGeneration?.resolveModel({
            db,
            projectId,
            requester: principal.actor,
            request,
          }) ?? defaultProposalGenerationModel({ db, projectId, request }),
      });
      return c.json(
        {
          success: true as const,
          data: {
            transition_id: result.view.transitionId,
            reused: result.reused,
            view: wireView(result.view),
          },
        },
        200
      );
    } catch (error) {
      return controlPlaneError(c, error);
    }
  });

  routes.openapi(proposeRoute, async (c) => {
    const { projectId } = c.req.valid('param');
    const body = c.req.valid('json');
    try {
      const db = await getDB();
      const access = await assertProjectAccess(c, db, projectId);
      if (access instanceof Response) return access;
      const principal = requireTransitionAuthority({
        apiKey: apiKey(c),
        projectId,
        scope: 'transition:propose',
      });
      const result = await proposeTransition({
        db,
        projectId,
        requestId: body.request_id,
        actor: principal.actor,
        request: wireRequest(body),
      });
      return c.json(
        {
          success: true as const,
          data: {
            transition_id: result.view.transitionId,
            reused: result.reused,
            view: wireView(result.view),
          },
        },
        200
      );
    } catch (error) {
      return controlPlaneError(c, error);
    }
  });

  routes.openapi(inspectRoute, async (c) => {
    const { projectId, transitionId } = c.req.valid('param');
    try {
      const db = await getDB();
      const access = await assertProjectAccess(c, db, projectId);
      if (access instanceof Response) return access;
      const principal = requireTransitionAuthority({
        apiKey: apiKey(c),
        projectId,
        scope: 'transition:inspect',
      });
      const view = await inspectTransition({
        db,
        projectId,
        transitionId,
        actor: principal.actor,
      });
      return c.json(
        {
          success: true as const,
          data: { transition_id: view.transitionId, view: wireView(view) },
        },
        200
      );
    } catch (error) {
      return controlPlaneError(c, error);
    }
  });

  routes.openapi(verifyRoute, async (c) => {
    const { projectId, transitionId } = c.req.valid('param');
    const body = c.req.valid('json');
    try {
      const db = await getDB();
      const access = await assertProjectAccess(c, db, projectId);
      if (access instanceof Response) return access;
      const principal = requireTransitionAuthority({
        apiKey: apiKey(c),
        projectId,
        scope: 'transition:verify',
      });
      const result = await verifyTransition({
        db,
        projectId,
        transitionId,
        requestId: body.request_id,
        actor: principal.actor,
        options: controlPlaneOptions,
      });
      return c.json(
        {
          success: true as const,
          data: {
            transition_id: result.view.transitionId,
            reused: result.reused,
            view: wireView(result.view),
            statements: result.statements,
            operational_results: result.operationalResults,
          },
        },
        200
      );
    } catch (error) {
      return controlPlaneError(c, error);
    }
  });

  routes.openapi(attachRoute, async (c) => {
    const { projectId, transitionId } = c.req.valid('param');
    const body = c.req.valid('json');
    try {
      const db = await getDB();
      const access = await assertProjectAccess(c, db, projectId);
      if (access instanceof Response) return access;
      const principal = requireTransitionAuthority({
        apiKey: apiKey(c),
        projectId,
        scope: 'transition:statement:issue',
      });
      const result = await attachTransitionStatement({
        db,
        projectId,
        transitionId,
        requestId: body.request_id,
        actor: principal.actor,
        statement: {
          predicateType: body.predicate_type,
          predicate: body.predicate,
          subjects: body.subjects,
        },
        options: controlPlaneOptions,
      });
      return c.json(
        {
          success: true as const,
          data: {
            transition_id: result.view.transitionId,
            reused: result.reused,
            view: wireView(result.view),
          },
        },
        200
      );
    } catch (error) {
      return controlPlaneError(c, error);
    }
  });

  routes.openapi(decideRoute, async (c) => {
    const { projectId, transitionId } = c.req.valid('param');
    const body = c.req.valid('json');
    try {
      const db = await getDB();
      const access = await assertProjectAccess(c, db, projectId);
      if (access instanceof Response) return access;
      const scope =
        body.outcome === 'accepted'
          ? 'transition:decide:accept'
          : body.outcome === 'overridden'
            ? 'transition:decide:override'
            : 'transition:decide:reject';
      const principal = requireTransitionAuthority({
        apiKey: apiKey(c),
        projectId,
        scope,
      });
      const result = await decideTransition({
        db,
        projectId,
        transitionId,
        actor: principal.actor,
        requestId: body.request_id,
        outcome: body.outcome,
        rationale: body.rationale,
        precondition: wireReviewPrecondition(body.precondition),
      });
      return c.json(
        {
          success: true as const,
          data: {
            transition_id: result.view.transitionId,
            reused: result.reused,
            decision_digest: result.decisionDigest,
            decision: result.decision,
            view: wireView(result.view),
          },
        },
        200
      );
    } catch (error) {
      return controlPlaneError(c, error);
    }
  });

  routes.openapi(commitRoute, async (c) => {
    const { projectId, transitionId } = c.req.valid('param');
    const body = c.req.valid('json');
    try {
      const db = await getDB();
      const access = await assertProjectAccess(c, db, projectId);
      if (access instanceof Response) return access;
      const principal = requireTransitionAuthority({
        apiKey: apiKey(c),
        projectId,
        scope: 'transition:commit:create',
      });
      requireTransitionAuthority({
        apiKey: apiKey(c),
        projectId,
        scope: 'transition:ref:advance',
      });
      const workspaceProjection = await resolveCanonicalWorkspaceSourceCommitProjection({
        db,
        projectId,
        transitionId,
      });
      const result = await commitTransition({
        db,
        projectId,
        transitionId,
        actor: principal.actor,
        requestId: body.request_id,
        decisionDigest: body.decision_digest,
        expectedHead: body.expected_head,
        ...(workspaceProjection === undefined ? {} : { workspaceProjection }),
      });
      return c.json(
        {
          success: true as const,
          data: {
            transition_id: transitionId,
            reused: result.reused,
            commit_digest: result.commitDigest,
            commit: result.commit,
            transition: result.view,
            ...(result.workspace === undefined ? {} : { workspace: result.workspace }),
          },
        },
        200
      );
    } catch (error) {
      return controlPlaneError(c, error);
    }
  });

  return routes;
}
