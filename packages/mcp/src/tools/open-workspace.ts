import { T3xApiError } from '@t3x-dev/api-client';
import { withTransitionApi } from './transition/index.js';
import type { ToolDef, ToolHandler } from './types.js';

const digest = /^sha256:[0-9a-f]{64}$/;

export const openWorkspaceDef: ToolDef = {
  name: 't3x_open_workspace',
  description:
    'Open the caller’s private Workspace at an explicit branch head. An existing open Workspace is returned with its own basis and is preserved.',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string' },
      ref: { type: 'string' },
      expected_head: { type: ['string', 'null'] },
      request_id: { type: 'string' },
    },
    required: ['project_id', 'ref', 'expected_head', 'request_id'],
  },
};

export const openWorkspaceHandler: ToolHandler = async (args) =>
  withTransitionApi(async (client) => {
    const { project_id, ref, expected_head, request_id } = args;
    if (
      typeof project_id !== 'string' ||
      !project_id.trim() ||
      typeof ref !== 'string' ||
      !ref.trim() ||
      typeof request_id !== 'string' ||
      !request_id.trim() ||
      (expected_head !== null && (typeof expected_head !== 'string' || !digest.test(expected_head)))
    ) {
      throw new T3xApiError(
        'INVALID_ARGUMENT',
        'Provide project_id, ref, request_id and exact expected_head (null for an empty ref).',
        400
      );
    }
    return client.workspaces.open(project_id, { ref, expected_head, request_id });
  });
