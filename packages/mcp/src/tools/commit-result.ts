import { T3xApiError } from '@t3x-dev/api-client';
import { findApiBranch } from './repository-location.js';
import { withTransitionApi } from './transition/index.js';
import type { ToolDef, ToolHandler } from './types.js';

const digest = /^sha256:[0-9a-f]{64}$/;

export const commitResultDef: ToolDef = {
  name: 't3x_commit_result',
  description:
    'Read an exact completed Transition Commit, the currently observed ref, and the current Workspace if the caller can read it.',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string' },
      transition_id: { type: 'string' },
      commit_digest: { type: 'string', pattern: digest.source },
    },
    required: ['project_id', 'transition_id', 'commit_digest'],
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
};

export const commitResultHandler: ToolHandler = async (args, options) =>
  withTransitionApi(async (client) => {
    const { project_id, transition_id, commit_digest } = args;
    if (
      typeof project_id !== 'string' ||
      !project_id.trim() ||
      typeof transition_id !== 'string' ||
      !transition_id.trim() ||
      typeof commit_digest !== 'string' ||
      !digest.test(commit_digest)
    ) {
      throw new T3xApiError(
        'INVALID_ARGUMENT',
        'Provide project_id, transition_id and exact commit_digest.',
        400
      );
    }
    // The commit receipt is durable after the mutable ref and Workspace advance.
    const commit = await client.getCommitForTransition(project_id, commit_digest, transition_id);
    if (commit.digest !== commit_digest) {
      throw new T3xApiError(
        'HASH_CONFLICT',
        'The returned Commit does not match the requested digest.',
        409
      );
    }
    const { view } = await client.inspectTransition(project_id, transition_id);
    const [branch, workspace] = await Promise.all([
      findApiBranch(
        client,
        project_id,
        view.precondition.ref_name,
        options?.skipMainBranchInitialization
      ),
      client.workspaces.get(project_id, view.workspace_id).catch((error: unknown) => {
        if (error instanceof T3xApiError && (error.status === 403 || error.status === 404))
          return null;
        throw error;
      }),
    ]);
    return {
      commit_digest,
      commit,
      branch,
      workspace,
    };
  });
