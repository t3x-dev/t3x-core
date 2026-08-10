import {
  T3xApiError,
  type T3xClient,
  type TransitionProtocolValue,
  type TransitionReplaceScalarOperation,
  type TransitionSourceArtifactSelector,
  type TransitionSourceMaterialSelector,
} from '@t3x-dev/api-client';
import { getApiClient, isApiBackend } from '../../backend.js';
import { fail, ok, type ToolDef, type ToolHandler, type ToolResult } from '../types.js';

export const API_BACKEND_REQUIRED = 'API_BACKEND_REQUIRED' as const;

function errorResult(
  code: string,
  message: string,
  status?: number,
  details?: Record<string, unknown>
): ToolResult {
  return fail(
    JSON.stringify(
      {
        error: {
          code,
          message,
          ...(status === undefined ? {} : { status }),
          ...(details === undefined ? {} : { details }),
        },
      },
      null,
      2
    )
  );
}

async function withTransitionApi(
  action: (client: T3xClient) => Promise<unknown>
): Promise<ToolResult> {
  if (!isApiBackend()) {
    return errorResult(
      API_BACKEND_REQUIRED,
      'Transition tools require T3X_MCP_BACKEND=api so authority stays at the API boundary.'
    );
  }

  try {
    return ok(await action(getApiClient()));
  } catch (error) {
    if (error instanceof T3xApiError) {
      return errorResult(error.code, error.message, error.status, error.details);
    }
    throw error;
  }
}

function stringArg(args: Record<string, unknown>, name: string): string | undefined {
  const value = args[name];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function optionalStringArg(args: Record<string, unknown>, name: string): string | undefined {
  const value = args[name];
  if (value === undefined) return undefined;
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function optionalRevision(args: Record<string, unknown>): number | undefined {
  const value = args.if_revision;
  if (value === undefined) return undefined;
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : undefined;
}

const commonProposalProperties = {
  project_id: { type: 'string', description: 'Project that owns the Workspace and Transition.' },
  request_id: {
    type: 'string',
    description: 'Caller idempotency key. Reuse only for an exact retry.',
  },
  workspace_id: { type: 'string', description: 'Existing Workspace to prepare from.' },
  kind: {
    type: 'string',
    enum: ['structured_yops', 'exact_source_import', 'exact_source_edit', 'exact_source_revert'],
    description: 'Closed task request family.',
  },
  operations: {
    type: 'array',
    description: 'YOps operations or exact-source replace_scalar operations, depending on kind.',
    items: { type: 'object' },
  },
  extraction_candidate_id: {
    type: 'string',
    description:
      'Server-owned Workspace extraction candidate to load as structured_yops; mutually exclusive with operations.',
  },
  artifact: {
    type: 'object',
    description: 'Exact-source artifact selector for import or edit.',
  },
  root: {
    type: 'object',
    description: 'Exact-source root material selector for import.',
  },
  commit_id: {
    type: 'string',
    description: 'Current CommitV2 identifier used for a server-derived exact-source revert.',
  },
  why: {
    type: 'string',
    description: 'Concise rationale supplied by the calling agent or human.',
  },
  if_revision: {
    type: 'number',
    description: 'Optional positive Workspace revision precondition.',
  },
} as const;

export const proposeTransitionDef: ToolDef = {
  name: 'propose_transition',
  description: [
    'Prepare and persist a replayable state-change Proposal without deciding or committing it.',
    'The server re-resolves the Workspace, Base, source inputs, and authenticated actor.',
    'Returns a task-oriented Transition view, immutable digests, and explicit preconditions.',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: commonProposalProperties,
    required: ['project_id', 'request_id', 'workspace_id', 'kind'],
  },
  annotations: { idempotentHint: true },
};

export const proposeTransitionHandler: ToolHandler = async (args) =>
  withTransitionApi(async (client) => {
    const projectId = stringArg(args, 'project_id');
    const requestId = stringArg(args, 'request_id');
    const workspaceId = stringArg(args, 'workspace_id');
    const kind = stringArg(args, 'kind');
    if (!projectId || !requestId || !workspaceId || !kind) {
      throw new T3xApiError(
        'INVALID_ARGUMENT',
        'project_id, request_id, workspace_id, and kind are required.',
        400
      );
    }
    const why = optionalStringArg(args, 'why');
    if (args.why !== undefined && why === undefined) {
      throw new T3xApiError('INVALID_ARGUMENT', 'why must be a non-empty string.', 400);
    }
    const ifRevision = optionalRevision(args);
    if (args.if_revision !== undefined && ifRevision === undefined) {
      throw new T3xApiError('INVALID_ARGUMENT', 'if_revision must be a positive integer.', 400);
    }
    const common = {
      request_id: requestId,
      workspace_id: workspaceId,
      ...(why === undefined ? {} : { why }),
      ...(ifRevision === undefined ? {} : { if_revision: ifRevision }),
    };

    if (kind === 'structured_yops') {
      const extractionCandidateId = stringArg(args, 'extraction_candidate_id');
      const hasOperations = Array.isArray(args.operations) && args.operations.length > 0;
      if (hasOperations === Boolean(extractionCandidateId)) {
        throw new T3xApiError(
          'INVALID_ARGUMENT',
          'structured_yops requires exactly one of non-empty operations or extraction_candidate_id.',
          400
        );
      }
      if (extractionCandidateId !== undefined) {
        return client.proposeTransition(projectId, {
          ...common,
          kind,
          extraction_candidate_id: extractionCandidateId,
        });
      }
      return client.proposeTransition(projectId, {
        ...common,
        kind,
        operations: args.operations as TransitionProtocolValue[],
      });
    }
    if (kind === 'exact_source_import') {
      if (!args.artifact || typeof args.artifact !== 'object' || !args.root) {
        throw new T3xApiError(
          'INVALID_ARGUMENT',
          'exact_source_import requires artifact and root selectors.',
          400
        );
      }
      return client.proposeTransition(projectId, {
        ...common,
        kind,
        artifact: args.artifact as TransitionSourceArtifactSelector,
        root: args.root as TransitionSourceMaterialSelector,
      });
    }
    if (kind === 'exact_source_edit') {
      if (
        !args.artifact ||
        typeof args.artifact !== 'object' ||
        !Array.isArray(args.operations) ||
        args.operations.length === 0
      ) {
        throw new T3xApiError(
          'INVALID_ARGUMENT',
          'exact_source_edit requires an artifact selector and non-empty operations.',
          400
        );
      }
      return client.proposeTransition(projectId, {
        ...common,
        kind,
        artifact: args.artifact as TransitionSourceArtifactSelector,
        operations: args.operations as TransitionReplaceScalarOperation[],
      });
    }
    if (kind === 'exact_source_revert') {
      const commitId = stringArg(args, 'commit_id');
      if (!commitId) {
        throw new T3xApiError('INVALID_ARGUMENT', 'exact_source_revert requires commit_id.', 400);
      }
      return client.proposeTransition(projectId, { ...common, kind, commit_id: commitId });
    }
    throw new T3xApiError('INVALID_ARGUMENT', `Unsupported Transition request kind: ${kind}`, 400);
  });

export const inspectTransitionDef: ToolDef = {
  name: 'inspect_transition',
  description:
    'Inspect one project-scoped Transition as a derived task view. This does not decide, commit, or advance a ref.',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string', description: 'Project that owns the Transition.' },
      transition_id: { type: 'string', description: 'Opaque trn_ Transition identifier.' },
    },
    required: ['project_id', 'transition_id'],
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
};

export const inspectTransitionHandler: ToolHandler = async (args) =>
  withTransitionApi(async (client) => {
    const projectId = stringArg(args, 'project_id');
    const transitionId = stringArg(args, 'transition_id');
    if (!projectId || !transitionId) {
      throw new T3xApiError('INVALID_ARGUMENT', 'project_id and transition_id are required.', 400);
    }
    return client.inspectTransition(projectId, transitionId);
  });

export const verifyTransitionDef: ToolDef = {
  name: 'verify_transition',
  description: [
    'Run mandatory deterministic Replay, then collect configured external verification Statements.',
    'Operational provider failures remain separate from conclusive evidence.',
    'This does not decide, commit, or advance a ref.',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string', description: 'Project that owns the Transition.' },
      transition_id: { type: 'string', description: 'Opaque trn_ Transition identifier.' },
      request_id: {
        type: 'string',
        description: 'Verification idempotency key. Reuse only for an exact retry.',
      },
    },
    required: ['project_id', 'transition_id', 'request_id'],
  },
  annotations: { idempotentHint: true },
};

export const verifyTransitionHandler: ToolHandler = async (args) =>
  withTransitionApi(async (client) => {
    const projectId = stringArg(args, 'project_id');
    const transitionId = stringArg(args, 'transition_id');
    const requestId = stringArg(args, 'request_id');
    if (!projectId || !transitionId || !requestId) {
      throw new T3xApiError(
        'INVALID_ARGUMENT',
        'project_id, transition_id, and request_id are required.',
        400
      );
    }
    return client.verifyTransition(projectId, transitionId, { request_id: requestId });
  });

export const attachStatementDef: ToolDef = {
  name: 'attach_statement',
  description: [
    'Attach one allowlisted external claim to verified Effect, Result, or Proposal roles.',
    'The API constructs the Statement envelope and authenticated issuer; callers cannot supply either.',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string', description: 'Project that owns the Transition.' },
      transition_id: { type: 'string', description: 'Opaque trn_ Transition identifier.' },
      request_id: {
        type: 'string',
        description: 'Statement idempotency key. Reuse only for an exact retry.',
      },
      predicate_type: { type: 'string', description: 'Configured external predicate type.' },
      predicate: { description: 'External predicate payload as a protocol-safe JSON value.' },
      subjects: {
        type: 'array',
        items: { type: 'string', enum: ['effect', 'result', 'proposal'] },
        description: 'Verified graph roles to which the Statement applies.',
      },
    },
    required: [
      'project_id',
      'transition_id',
      'request_id',
      'predicate_type',
      'predicate',
      'subjects',
    ],
  },
  annotations: { idempotentHint: true },
};

export const attachStatementHandler: ToolHandler = async (args) =>
  withTransitionApi(async (client) => {
    const projectId = stringArg(args, 'project_id');
    const transitionId = stringArg(args, 'transition_id');
    const requestId = stringArg(args, 'request_id');
    const predicateType = stringArg(args, 'predicate_type');
    const subjects = Array.isArray(args.subjects) ? args.subjects : [];
    if (!projectId || !transitionId || !requestId || !predicateType) {
      throw new T3xApiError(
        'INVALID_ARGUMENT',
        'project_id, transition_id, request_id, and predicate_type are required.',
        400
      );
    }
    if (
      args.predicate === undefined ||
      subjects.length === 0 ||
      subjects.some((subject) => !['effect', 'result', 'proposal'].includes(String(subject)))
    ) {
      throw new T3xApiError(
        'INVALID_ARGUMENT',
        'predicate and at least one valid subject role are required.',
        400
      );
    }
    return client.attachTransitionStatement(projectId, transitionId, {
      request_id: requestId,
      predicate_type: predicateType,
      predicate: args.predicate as TransitionProtocolValue,
      subjects: subjects as Array<'effect' | 'result' | 'proposal'>,
    });
  });

export const TRANSITION_TOOLS = [
  { def: proposeTransitionDef, handler: proposeTransitionHandler },
  { def: inspectTransitionDef, handler: inspectTransitionHandler },
  { def: verifyTransitionDef, handler: verifyTransitionHandler },
  { def: attachStatementDef, handler: attachStatementHandler },
] as const;
