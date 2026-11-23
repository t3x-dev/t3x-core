import { T3xApiError } from '@t3x-dev/api-client';
import { isSafeBusinessIdentifier, isSafeWorkspaceIdentifier } from '../business-capabilities.js';
import { withTransitionApi } from './transition/index.js';
import type { ToolDef, ToolHandler } from './types.js';

export const workspaceValidationDef: ToolDef = {
  name: 't3x_workspace_validation',
  description:
    'Validate the ESPHome input of an exact saved Draft, or read an owned exact Draft Run by ID.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['read', 'run'] },
      project_id: { type: 'string' },
      workspace_id: { type: 'string' },
      run_id: { type: 'string', description: 'Required for read.' },
      expected_workspace_revision: {
        type: 'integer',
        minimum: 1,
        description: 'Required for run.',
      },
      expected_composition_revision: {
        type: 'integer',
        minimum: 0,
        description: 'Required for an authoring-managed Draft.',
      },
    },
    required: ['action', 'project_id', 'workspace_id'],
  },
  annotations: { idempotentHint: false },
};

function revision(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

export const workspaceValidationHandler: ToolHandler = (args) =>
  withTransitionApi(async (client) => {
    const {
      action,
      project_id,
      workspace_id,
      run_id,
      expected_workspace_revision,
      expected_composition_revision,
    } = args;
    if (!isSafeBusinessIdentifier(project_id) || !isSafeWorkspaceIdentifier(workspace_id)) {
      throw new T3xApiError('INVALID_ARGUMENT', 'Provide project_id and workspace_id.', 400);
    }
    if (action === 'read' && isSafeBusinessIdentifier(run_id)) {
      const details = await client.getWorkspaceValidationRun(run_id);
      const { run } = details;
      if (
        run.id !== run_id ||
        run.project_id !== project_id ||
        run.workspace_id !== workspace_id ||
        !run.result_json.draft_revision
      ) {
        throw new T3xApiError(
          'NOT_FOUND',
          'Exact validation Run unavailable in this Workspace.',
          404
        );
      }
      return details;
    }
    if (
      action !== 'run' ||
      !revision(expected_workspace_revision, 1) ||
      (expected_composition_revision !== undefined && !revision(expected_composition_revision, 0))
    ) {
      throw new T3xApiError(
        'INVALID_ARGUMENT',
        'Provide run_id for read or a saved Workspace revision for run.',
        400
      );
    }
    const details = await client.runWorkspaceValidation(project_id, workspace_id, {
      expected_workspace_revision,
      expected_composition_revision,
    });
    const { run } = details;
    const captured = run.result_json.draft_revision;
    if (
      run.project_id !== project_id ||
      run.workspace_id !== workspace_id ||
      captured?.workspace_revision !== expected_workspace_revision ||
      captured.composition_revision !== (expected_composition_revision ?? null)
    ) {
      throw new T3xApiError('CONFLICT', 'Run does not match the requested Draft revision.', 409);
    }
    return details;
  });
