import { T3xApiError } from '@t3x-dev/api-client';
import { isSafeBusinessIdentifier, isSafeWorkspaceIdentifier } from '../business-capabilities.js';
import { withTransitionApi } from './transition/index.js';
import type { ToolDef, ToolHandler } from './types.js';

const transitionIdPattern = /^trn_[0-9a-f]{32}$/;

export const workspaceCandidateDef: ToolDef = {
  name: 't3x_publish_candidate',
  description: [
    'Apply an existing governed proposal-generation candidate to its saved Workspace Draft.',
    'Use the exact transition_id from t3x_query workspace_activity pendingCandidates, and reuse request_id for an exact retry.',
    'For generated deletions, have the signed-in person confirm the precise action in Web Draft activity, then prepare a fresh Review.',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string', minLength: 1, maxLength: 200 },
      workspace_id: { type: 'string', minLength: 1, maxLength: 200 },
      transition_id: { type: 'string', pattern: transitionIdPattern.source },
      request_id: { type: 'string', minLength: 1, maxLength: 200 },
    },
    required: ['project_id', 'workspace_id', 'transition_id', 'request_id'],
  },
  annotations: { readOnlyHint: false, idempotentHint: true },
};

function isRequestId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 200 && value.trim() === value && value !== '';
}

export const workspaceCandidateHandler: ToolHandler = async (args) =>
  withTransitionApi(async ({ workspaces }) => {
    const { project_id, workspace_id, transition_id, request_id } = args;
    if (
      !isSafeBusinessIdentifier(project_id) ||
      project_id.length > 200 ||
      !isSafeWorkspaceIdentifier(workspace_id) ||
      workspace_id.length > 200 ||
      !isRequestId(request_id) ||
      typeof transition_id !== 'string' ||
      !transitionIdPattern.test(transition_id)
    ) {
      throw new T3xApiError(
        'INVALID_ARGUMENT',
        'Provide project_id, workspace_id, a governed transition_id, and request_id.',
        400
      );
    }
    return workspaces.authoring.publishCandidate(project_id, workspace_id, transition_id, {
      request_id,
    });
  });
