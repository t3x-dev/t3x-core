import { createHash } from 'node:crypto';
import { T3xApiError } from '@t3x-dev/api-client';
import { getApiClient, isApiBackend } from '../backend.js';
import { apiToolError, fail, ok, type ToolDef, type ToolHandler } from './types.js';

const DIGEST = /^sha256:[0-9a-f]{64}$/;

export const committedStateDef: ToolDef = {
  name: 't3x_committed_state',
  description:
    'Read the complete committed State value, inspect its historical Schema binding, or export its exact YAML or JSON bytes for a selected Commit. Requires the API backend. Use t3x_query for history and t3x_diff to compare commits.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['read', 'export', 'schema_binding'] },
      project_id: { type: 'string', description: 'Project that owns the selected Commit.' },
      commit_digest: {
        type: 'string',
        pattern: DIGEST.source,
        description: 'Exact CommitV2 digest. An empty branch has no Commit to read.',
      },
      state_digest: {
        type: 'string',
        pattern: DIGEST.source,
        description: 'Optional expected State digest for the selected Commit.',
      },
      format: { type: 'string', enum: ['json', 'yaml'], description: 'Required for export.' },
    },
    required: ['action', 'project_id', 'commit_digest'],
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
};

function errorResult(code: string, message: string, status?: number) {
  return fail(JSON.stringify({ error: { code, message, status } }));
}

export const committedStateHandler: ToolHandler = async ({
  action,
  project_id: projectId,
  commit_digest: commitDigest,
  state_digest: stateDigest,
  format,
}) => {
  if (!isApiBackend()) {
    return errorResult('API_BACKEND_REQUIRED', 'Committed State requires T3X_MCP_BACKEND=api.');
  }
  if (
    (action !== 'read' && action !== 'export' && action !== 'schema_binding') ||
    typeof projectId !== 'string' ||
    !projectId.trim() ||
    typeof commitDigest !== 'string' ||
    !DIGEST.test(commitDigest) ||
    (stateDigest !== undefined &&
      (action === 'schema_binding' || typeof stateDigest !== 'string' || !DIGEST.test(stateDigest)))
  ) {
    return errorResult(
      'INVALID_ARGUMENT',
      'Provide action read, export or schema_binding, project_id, an exact commit_digest and optionally an exact state_digest.',
      400
    );
  }

  try {
    if (action === 'schema_binding') {
      const binding = await getApiClient().getCommittedSchemaBinding(projectId, commitDigest);
      if (binding.commit_digest !== commitDigest) {
        return errorResult(
          'HASH_CONFLICT',
          'Schema binding does not match the requested Commit.',
          409
        );
      }
      return ok(binding);
    }
    if (action === 'read') {
      const overview = await getApiClient().getStateOverview(projectId, commitDigest, {
        stateDigest,
      });
      const { sourceCommit, sourceState, value } = overview.render.context;
      if (
        overview.revision.commitDigest !== commitDigest ||
        sourceCommit.digest !== commitDigest ||
        overview.revision.stateDigest !== sourceState.digest ||
        (stateDigest !== undefined && sourceState.digest !== stateDigest) ||
        value === undefined
      ) {
        return errorResult(
          'HASH_CONFLICT',
          'State read does not match the requested revision.',
          409
        );
      }
      return ok({ project_id: projectId, sourceCommit, sourceState, value });
    }

    if (format !== 'json' && format !== 'yaml') {
      return errorResult('INVALID_ARGUMENT', 'Export requires format json or yaml.', 400);
    }
    const artifact = await getApiClient().exportCommitState(
      projectId,
      commitDigest,
      format,
      stateDigest
    );
    if (
      artifact.sourceCommit.digest !== commitDigest ||
      (stateDigest !== undefined && artifact.sourceState.digest !== stateDigest) ||
      artifact.format !== format ||
      artifact.mimeType !== (format === 'json' ? 'application/json' : 'application/yaml') ||
      artifact.serialization !== `t3x.${format}-value/v1` ||
      artifact.byteLength !== Buffer.byteLength(artifact.content, 'utf8') ||
      artifact.byteDigest !==
        `sha256:${createHash('sha256').update(artifact.content, 'utf8').digest('hex')}`
    ) {
      return errorResult(
        'HASH_CONFLICT',
        'State export failed revision or byte integrity checks.',
        409
      );
    }
    return ok(artifact);
  } catch (error) {
    if (error instanceof T3xApiError) {
      return apiToolError(error);
    }
    throw error;
  }
};
