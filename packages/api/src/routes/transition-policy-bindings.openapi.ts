import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { ApiKey } from '@t3x-dev/core';
import {
  bindTransitionPolicy,
  getTransitionPolicyBinding,
  TransitionPolicyBindingIntegrityError,
  TransitionPolicyResourceConflictError,
  unbindTransitionPolicy,
} from '@t3x-dev/storage';
import type { Context } from 'hono';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { deriveTrustedTransitionPrincipal } from '../lib/transition-authority';
import {
  INDEPENDENT_REVIEW_REF_POLICY,
  planBranchRuleChange,
} from '../lib/transition-control-plane/applicable-policy';
import { pinoLogger } from '../middleware/logger';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';
import {
  BranchRuleRequest,
  BranchRuleResponse,
  TransitionPolicyBindingQuery,
  TransitionPolicyBindingRequest,
  TransitionPolicyBindingResponse,
} from '../schemas/transition-policy-contracts';

export const transitionPolicyBindingRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });

const projectParams = z.object({ projectId: z.string().min(1) });

function wireBinding(binding: Awaited<ReturnType<typeof bindTransitionPolicy>>) {
  return {
    project_id: binding.projectId,
    ref_name: binding.refName,
    policy: binding.policy,
    resource: {
      uri: binding.resource.uri,
      media_type: binding.resource.mediaType,
      digest: binding.resource.digest,
    },
    updated_by: binding.updatedBy,
    updated_at: binding.updatedAt,
  };
}

function authenticatedApiKey(c: Context): ApiKey | undefined {
  return c.get('apiKey') as ApiKey | undefined;
}

function requireHumanAdministrator(c: Context): Response | null {
  const apiKey = authenticatedApiKey(c);
  if (apiKey !== undefined && apiKey.principal_kind !== 'human') {
    return errorResponse(c, 'FORBIDDEN', 'Policy administration requires a human principal');
  }
  return null;
}

function policyError(c: Context, error: unknown) {
  if (error instanceof TransitionPolicyBindingIntegrityError) {
    return errorResponse(c, 'VERIFY_FAILED', error.message);
  }
  if (error instanceof TransitionPolicyResourceConflictError) {
    return errorResponse(c, 'CONFLICT', error.message);
  }
  if (
    error instanceof TypeError ||
    (error instanceof Error && error.name === 'SchemaInvalidError')
  ) {
    return errorResponse(c, 'INVALID_REQUEST', error.message);
  }
  pinoLogger.error({ err: error }, 'Transition policy binding operation failed');
  return errorResponse(c, 'INTERNAL_ERROR', 'Transition policy binding operation failed');
}

const putRoute = createRoute({
  method: 'put',
  path: '/v1/projects/{projectId}/transition-policy-binding',
  tags: ['Transition'],
  summary: 'Bind a content-addressed AcceptancePolicy to a project ref',
  request: {
    params: projectParams,
    body: { content: { 'application/json': { schema: TransitionPolicyBindingRequest } } },
  },
  responses: {
    200: {
      description: 'Policy binding',
      content: {
        'application/json': { schema: SuccessResponseSchema(TransitionPolicyBindingResponse) },
      },
    },
    400: {
      description: 'Invalid policy',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Forbidden',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Project not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

transitionPolicyBindingRoutes.openapi(putRoute, async (c) => {
  const denied = requireHumanAdministrator(c);
  if (denied) return denied;
  const { projectId } = c.req.valid('param');
  const body = c.req.valid('json');
  try {
    const db = await getDB();
    const access = await assertProjectAccess(c, db, projectId);
    if (access instanceof Response) return access;
    const principal = deriveTrustedTransitionPrincipal(authenticatedApiKey(c));
    const binding = await bindTransitionPolicy(db, {
      projectId,
      refName: body.ref_name,
      uri: body.uri,
      policy: body.policy,
      actor: principal.actor,
    });
    return c.json({ success: true as const, data: wireBinding(binding) }, 200);
  } catch (error) {
    return policyError(c, error);
  }
});

const getRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/transition-policy-binding',
  tags: ['Transition'],
  summary: 'Read the server-selected AcceptancePolicy for a project ref',
  request: { params: projectParams, query: TransitionPolicyBindingQuery },
  responses: {
    200: {
      description: 'Policy binding',
      content: {
        'application/json': { schema: SuccessResponseSchema(TransitionPolicyBindingResponse) },
      },
    },
    403: {
      description: 'Forbidden',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Binding not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

transitionPolicyBindingRoutes.openapi(getRoute, async (c) => {
  const denied = requireHumanAdministrator(c);
  if (denied) return denied;
  const { projectId } = c.req.valid('param');
  const { ref_name } = c.req.valid('query');
  try {
    const db = await getDB();
    const access = await assertProjectAccess(c, db, projectId);
    if (access instanceof Response) return access;
    const binding = await getTransitionPolicyBinding(db, projectId, ref_name);
    if (binding === null) {
      return errorResponse(c, 'NOT_FOUND', `No AcceptancePolicy is bound to ref ${ref_name}`);
    }
    return c.json({ success: true as const, data: wireBinding(binding) }, 200);
  } catch (error) {
    return policyError(c, error);
  }
});

const deleteRoute = createRoute({
  method: 'delete',
  path: '/v1/projects/{projectId}/transition-policy-binding',
  tags: ['Transition'],
  summary: 'Remove the AcceptancePolicy binding for a project ref',
  request: { params: projectParams, query: TransitionPolicyBindingQuery },
  responses: {
    200: {
      description: 'Binding removed',
      content: {
        'application/json': { schema: SuccessResponseSchema(z.object({ removed: z.boolean() })) },
      },
    },
    403: {
      description: 'Forbidden',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Binding not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

transitionPolicyBindingRoutes.openapi(deleteRoute, async (c) => {
  const denied = requireHumanAdministrator(c);
  if (denied) return denied;
  const { projectId } = c.req.valid('param');
  const { ref_name } = c.req.valid('query');
  try {
    const db = await getDB();
    const access = await assertProjectAccess(c, db, projectId);
    if (access instanceof Response) return access;
    const removed = await unbindTransitionPolicy(db, projectId, ref_name);
    if (!removed) {
      return errorResponse(c, 'NOT_FOUND', `No AcceptancePolicy is bound to ref ${ref_name}`);
    }
    return c.json({ success: true as const, data: { removed: true } }, 200);
  } catch (error) {
    return policyError(c, error);
  }
});

function wireBranchRule(
  refName: string,
  binding: Awaited<ReturnType<typeof getTransitionPolicyBinding>>
) {
  return {
    ref_name: refName,
    require_independent_review: binding !== null && !binding.policy.authorization.allowSelfApproval,
    source:
      binding === null
        ? ('default' as const)
        : binding.resource.digest === INDEPENDENT_REVIEW_REF_POLICY.resource.digest
          ? ('preset' as const)
          : ('custom' as const),
  };
}

const branchRuleResponses = {
  200: {
    description: 'Branch rule',
    content: { 'application/json': { schema: SuccessResponseSchema(BranchRuleResponse) } },
  },
  400: {
    description: 'Invalid branch rule',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  403: {
    description: 'Forbidden',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  404: {
    description: 'Project not found',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
};

const getBranchRuleRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/branch-rule',
  tags: ['Transition'],
  summary: 'Read whether a branch requires review by someone other than the proposer',
  request: { params: projectParams, query: TransitionPolicyBindingQuery },
  responses: branchRuleResponses,
});

transitionPolicyBindingRoutes.openapi(getBranchRuleRoute, async (c) => {
  const denied = requireHumanAdministrator(c);
  if (denied) return denied;
  const { projectId } = c.req.valid('param');
  const { ref_name } = c.req.valid('query');
  try {
    const db = await getDB();
    const access = await assertProjectAccess(c, db, projectId);
    if (access instanceof Response) return access;
    const binding = await getTransitionPolicyBinding(db, projectId, ref_name);
    return c.json({ success: true as const, data: wireBranchRule(ref_name, binding) }, 200);
  } catch (error) {
    return policyError(c, error);
  }
});

const putBranchRuleRoute = createRoute({
  method: 'put',
  path: '/v1/projects/{projectId}/branch-rule',
  tags: ['Transition'],
  summary: 'Allow direct commits or require review by someone other than the proposer',
  request: {
    params: projectParams,
    body: { content: { 'application/json': { schema: BranchRuleRequest } } },
  },
  responses: branchRuleResponses,
});

transitionPolicyBindingRoutes.openapi(putBranchRuleRoute, async (c) => {
  const denied = requireHumanAdministrator(c);
  if (denied) return denied;
  const { projectId } = c.req.valid('param');
  const body = c.req.valid('json');
  try {
    const db = await getDB();
    const access = await assertProjectAccess(c, db, projectId);
    if (access instanceof Response) return access;
    const current = await getTransitionPolicyBinding(db, projectId, body.ref_name);
    const change = planBranchRuleChange({
      refName: body.ref_name,
      binding: current,
      requireIndependentReview: body.require_independent_review,
    });
    let binding = current;
    if (change.action === 'unbind') {
      await unbindTransitionPolicy(db, projectId, body.ref_name);
      binding = null;
    } else if (change.action === 'bind') {
      binding = await bindTransitionPolicy(db, {
        projectId,
        refName: body.ref_name,
        uri: change.uri,
        policy: change.policy,
        actor: deriveTrustedTransitionPrincipal(authenticatedApiKey(c)).actor,
      });
    }
    return c.json({ success: true as const, data: wireBranchRule(body.ref_name, binding) }, 200);
  } catch (error) {
    return policyError(c, error);
  }
});
