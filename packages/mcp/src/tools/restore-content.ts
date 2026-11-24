import { T3xApiError } from '@t3x-dev/api-client';
import { isSafeBusinessIdentifier, isSafeWorkspaceIdentifier } from '../business-capabilities.js';
import { withTransitionApi } from './transition/index.js';
import type { ToolDef, ToolHandler } from './types.js';

const digest = /^sha256:[a-f0-9]{64}$/;
export const restoreContentDef: ToolDef = {
  name: 't3x_restore_content',
  description:
    'Restore the Content of an exact project Commit to a fresh owned authoring Draft. Keep the effective Schema and inspect returned issues before preparing Review.',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string' },
      workspace_id: { type: 'string' },
      source_commit_digest: { type: 'string', pattern: digest.source },
      request_id: { type: 'string' },
      expected_workspace_revision: { type: 'integer', minimum: 1 },
      expected_ref_head: { type: ['string', 'null'] },
    },
    required: [
      'project_id',
      'workspace_id',
      'source_commit_digest',
      'request_id',
      'expected_workspace_revision',
      'expected_ref_head',
    ],
  },
  annotations: { idempotentHint: true },
};
export const restoreContentHandler: ToolHandler = (args) =>
  withTransitionApi(async (client) => {
    const {
      project_id,
      workspace_id,
      source_commit_digest,
      request_id,
      expected_workspace_revision,
      expected_ref_head,
    } = args;
    if (
      !isSafeBusinessIdentifier(project_id) ||
      !isSafeWorkspaceIdentifier(workspace_id) ||
      typeof source_commit_digest !== 'string' ||
      !digest.test(source_commit_digest) ||
      typeof request_id !== 'string' ||
      !request_id.trim() ||
      typeof expected_workspace_revision !== 'number' ||
      !Number.isSafeInteger(expected_workspace_revision) ||
      expected_workspace_revision < 1 ||
      (expected_ref_head !== null &&
        (typeof expected_ref_head !== 'string' || !digest.test(expected_ref_head)))
    )
      throw new T3xApiError(
        'INVALID_ARGUMENT',
        'Provide an exact source Commit, owned Workspace, revision, expected head and request ID.',
        400
      );
    return client.workspaces.authoring.restoreContent(project_id, workspace_id, {
      source_commit_digest,
      request_id,
      expected_workspace_revision,
      expected_ref_head,
    });
  });
