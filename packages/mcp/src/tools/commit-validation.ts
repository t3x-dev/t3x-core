import { type CommitYSchemaRun, T3xApiError } from '@t3x-dev/api-client';
import { isSafeBusinessIdentifier } from '../business-capabilities.js';
import { withTransitionApi } from './transition/index.js';
import type { ToolDef, ToolHandler } from './types.js';

const digest = /^sha256:[0-9a-f]{64}$/;

export const commitValidationDef: ToolDef = {
  name: 't3x_commit_validation',
  description:
    'Run YSchema validation on an exact Commit and Schema version, or read a saved result by Run ID. Each run creates a new record.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['read', 'run'] },
      project_id: { type: 'string' },
      run_id: { type: 'string', description: 'Required for read.' },
      commit_hash: { type: 'string', pattern: digest.source, description: 'Required for run.' },
      schema_name: { type: 'string', description: 'Exact canonical Schema name required for run.' },
      schema_version: { type: 'string', description: 'Exact Schema version required for run.' },
    },
    required: ['action', 'project_id'],
  },
  annotations: { idempotentHint: false },
};

function view({ result, ...run }: CommitYSchemaRun) {
  return {
    ...run,
    findings: result.validation ?? null,
    provenance_by_path: result.provenance_by_path ?? null,
  };
}

export const commitValidationHandler: ToolHandler = (args) =>
  withTransitionApi(async (client) => {
    const { action, project_id, run_id, commit_hash, schema_name, schema_version } = args;
    if (!isSafeBusinessIdentifier(project_id)) {
      throw new T3xApiError('INVALID_ARGUMENT', 'Provide project_id.', 400);
    }
    if (action === 'read' && isSafeBusinessIdentifier(run_id)) {
      const run = await client.getCommitYSchemaRun(run_id);
      if (run.project_id !== project_id || run.id !== run_id) {
        throw new T3xApiError('NOT_FOUND', 'Validation Run unavailable in this project.', 404);
      }
      return view(run);
    }
    if (
      action !== 'run' ||
      typeof commit_hash !== 'string' ||
      !digest.test(commit_hash) ||
      typeof schema_name !== 'string' ||
      !schema_name.trim() ||
      !isSafeBusinessIdentifier(schema_version) ||
      schema_version.toLowerCase() === 'latest'
    ) {
      throw new T3xApiError(
        'INVALID_ARGUMENT',
        'Provide run_id for read, or an exact commit_hash, schema_name and schema_version for run.',
        400
      );
    }

    const canonicalName = schema_name.trim().toLowerCase();
    const run = await client.createCommitYSchemaRun(project_id, {
      commit_hash,
      schema_name: canonicalName,
      schema_version,
    });
    if (
      run.project_id !== project_id ||
      run.commit_hash !== commit_hash ||
      run.schema_name !== canonicalName ||
      run.schema_version !== schema_version ||
      !digest.test(run.schema_hash)
    ) {
      throw new T3xApiError(
        'HASH_CONFLICT',
        'Run does not match the requested subject or Schema.',
        409
      );
    }
    return view(run);
  });
