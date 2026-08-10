import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { ApiKey } from '@t3x-dev/core';
import {
  ConflictError,
  findWorkspaceDraft,
  listTransitionProposalsForWorkspaceRevision,
  TransitionRefHeadIntegrityError,
  TransitionRefNotFoundError,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess, getUserId } from '../lib/project-access';
import {
  requireTransitionAuthority,
  TransitionProjectScopeDeniedError,
  TransitionScopeDeniedError,
} from '../lib/transition-authority';
import {
  createWorkspaceExtractionProposal,
  WorkspaceExtractionProposalError,
} from '../lib/workspace-extraction-proposal';
import { WorkspaceTransitionNotFoundError } from '../lib/workspace-transition';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

const WorkspaceExtractionProposalRequestSchema = z
  .object({
    source: z
      .object({
        type: z.literal('conversation'),
        id: z.string().trim().min(1),
        turn_hashes: z.array(z.string().trim().min(1)).min(1).max(200),
      })
      .strict(),
    provider: z.string().trim().min(1).optional(),
    model: z.string().trim().min(1).optional(),
    if_revision: z.number().int().min(1).optional(),
  })
  .strict();

const WorkspaceExtractionProposalResponseSchema = z.object({
  candidate_id: z.string(),
  proposal: z.object({
    schema: z.literal('t3x.dev/workspace-extraction-proposal/v1'),
    sourceSelector: z.object({
      type: z.literal('conversation'),
      id: z.string(),
      turnHashes: z.array(z.string()),
    }),
    sourceSelectorDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    baseCommitHash: z.string().nullable(),
    mode: z.enum(['bootstrap', 'incremental']),
    operations: z.array(z.any()),
    result: z.object({ trees: z.array(z.any()), relations: z.array(z.any()) }),
    actor: z.object({ kind: z.enum(['human', 'agent', 'service']), id: z.string() }),
    createdAt: z.string(),
  }),
  workspace: z.record(z.string(), z.unknown()),
});

const WorkspaceExtractionTransitionLinkSchema = z.object({
  transition_id: z.string().regex(/^trn_[0-9a-f]{32}$/),
  candidate_id: z.string(),
  workspace_revision: z.number().int().min(1),
  created_at: z.string(),
});

const route = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/extraction-proposals',
  tags: ['Workspaces'],
  summary: 'Create a v2 extraction proposal from immutable repository Source turns',
  description:
    'Re-resolves the selected Source Thread turns and target ref baseline on the server, runs the shared v2 extraction pipeline, and persists canonical SourcedYOps in the existing Workspace staged state.',
  request: {
    params: z.object({ projectId: z.string().min(1), workspaceId: z.string().min(1) }),
    body: {
      content: { 'application/json': { schema: WorkspaceExtractionProposalRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Persisted Workspace extraction proposal',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(WorkspaceExtractionProposalResponseSchema),
        },
      },
    },
    400: {
      description: 'Invalid selector or unavailable extraction provider',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Project access or Transition proposal scope denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Workspace, Source, or target ref not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Workspace revision or target ref conflict',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Extraction or stored Transition integrity failure',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const linkRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/extraction-transition',
  tags: ['Workspaces'],
  summary: 'Resolve the durable Transition linked to the current extraction candidate',
  request: {
    params: z.object({ projectId: z.string().min(1), workspaceId: z.string().min(1) }),
  },
  responses: {
    200: {
      description: 'Current extraction Transition link',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(WorkspaceExtractionTransitionLinkSchema),
        },
      },
    },
    403: {
      description: 'Project access or Transition inspect scope denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Workspace or current extraction Transition not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function linkedExtractionCandidate(requestCanonicalJson: string): string | null {
  try {
    const request = JSON.parse(requestCanonicalJson) as unknown;
    if (!isRecord(request) || request.kind !== 'structured_yops' || !isRecord(request.source)) {
      return null;
    }
    return request.source.type === 'workspace_extraction_proposal' &&
      typeof request.source.candidate_id === 'string'
      ? request.source.candidate_id
      : null;
  } catch {
    return null;
  }
}

function proposalErrorResponse(c: Parameters<typeof errorResponse>[0], error: unknown) {
  if (
    error instanceof TransitionScopeDeniedError ||
    error instanceof TransitionProjectScopeDeniedError
  ) {
    return errorResponse(c, 'FORBIDDEN', error.message);
  }
  if (error instanceof WorkspaceTransitionNotFoundError) {
    return errorResponse(c, 'WORKSPACE_NOT_FOUND', error.message);
  }
  if (error instanceof TransitionRefNotFoundError) {
    return errorResponse(c, 'NOT_FOUND', error.message);
  }
  if (error instanceof ConflictError) {
    return errorResponse(
      c,
      'CONFLICT',
      'Workspace changed since it was loaded. Refresh and retry.'
    );
  }
  if (error instanceof TransitionRefHeadIntegrityError) {
    return errorResponse(c, 'VERIFY_FAILED', error.message);
  }
  if (error instanceof WorkspaceExtractionProposalError) {
    if (error.kind === 'source_not_found' || error.kind === 'source_project_mismatch') {
      return errorResponse(c, 'NOT_FOUND', error.message);
    }
    if (error.kind === 'source_selector_invalid') {
      return errorResponse(c, 'INVALID_REQUEST', error.message, error.details);
    }
    if (error.kind === 'provider_unavailable') {
      return errorResponse(c, 'PROVIDER_KEY_MISSING', error.message);
    }
    return errorResponse(c, 'EXTRACTION_FAILED', error.message, error.details);
  }
  console.error(error);
  return errorResponse(c, 'INTERNAL_ERROR', 'Workspace extraction proposal failed');
}

export const workspaceExtractionProposalRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });

workspaceExtractionProposalRoutes.openapi(linkRoute, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;
  try {
    requireTransitionAuthority({
      apiKey: c.get('apiKey') as ApiKey | undefined,
      projectId,
      scope: 'transition:inspect',
    });
    const draft = await findWorkspaceDraft(db, projectId, workspaceId);
    if (!draft?.workspace_state) {
      return errorResponse(c, 'NOT_FOUND', 'Workspace not found');
    }
    const candidateId = draft.workspace_state.backendCandidateId;
    if (typeof candidateId !== 'string') {
      return errorResponse(c, 'NOT_FOUND', 'Workspace has no current extraction candidate');
    }
    const memberships = await listTransitionProposalsForWorkspaceRevision(db, {
      projectId,
      workspaceId,
      workspaceRevision: draft.revision,
    });
    const membership = memberships.find(
      (candidate) => linkedExtractionCandidate(candidate.requestCanonicalJson) === candidateId
    );
    if (membership === undefined) {
      return errorResponse(c, 'NOT_FOUND', 'Current extraction candidate has no Transition');
    }
    return c.json({
      success: true as const,
      data: {
        transition_id: membership.transitionId,
        candidate_id: candidateId,
        workspace_revision: membership.workspaceRevision,
        created_at: membership.createdAt,
      },
    });
  } catch (error) {
    return proposalErrorResponse(c, error);
  }
});

workspaceExtractionProposalRoutes.openapi(route, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const request = c.req.valid('json');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;

  try {
    const principal = requireTransitionAuthority({
      apiKey: c.get('apiKey') as ApiKey | undefined,
      projectId,
      scope: 'transition:propose',
    });
    const created = await createWorkspaceExtractionProposal(db, {
      projectId,
      workspaceId,
      source: {
        type: request.source.type,
        id: request.source.id,
        turnHashes: request.source.turn_hashes,
      },
      expectedRevision: request.if_revision,
      provider: request.provider,
      model: request.model,
      userId: getUserId(c),
      actor: principal.actor,
    });
    return c.json({
      success: true as const,
      data: {
        candidate_id: created.candidateId,
        proposal: created.proposal,
        workspace: created.workspace,
      },
    });
  } catch (error) {
    return proposalErrorResponse(c, error);
  }
});
