import { T3xApiError } from '@t3x-dev/api-client';
import { isSafeBusinessIdentifier, isSafeWorkspaceIdentifier } from '../business-capabilities.js';
import { withTransitionApi } from './transition/index.js';
import type { ToolDef, ToolHandler } from './types.js';

export const proposalGenerationDef: ToolDef = {
  name: 't3x_generate_proposal',
  description:
    'Generate a governed candidate from exact authorized material IDs or original user turn hashes at a saved Workspace revision. Publish it separately with t3x_publish_candidate.',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string' },
      workspace_id: { type: 'string' },
      request_id: { type: 'string', description: 'Stable ID for an exact generation retry.' },
      if_revision: { type: 'integer', minimum: 1, description: 'Saved Workspace revision.' },
      instruction: { type: 'string', minLength: 1, maxLength: 20000 },
      posture: { type: 'string', enum: ['source_only', 'guided', 'recommend'], default: 'guided' },
      source_material_ids: { type: 'array', items: { type: 'string' }, maxItems: 256 },
      source_turn_hashes: { type: 'array', items: { type: 'string' }, maxItems: 64 },
      provider: { type: 'string', description: 'Optional provider resolved by the server.' },
      model: { type: 'string', description: 'Optional model resolved by the server.' },
    },
    required: ['project_id', 'workspace_id', 'request_id', 'if_revision', 'instruction'],
  },
  annotations: { readOnlyHint: false, idempotentHint: true },
};

function sourceIds(value: unknown, maximum: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maximum &&
    value.every((id) => isSafeBusinessIdentifier(id) && id.length <= 200)
  );
}

function nonempty(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

function invalid(message: string): never {
  throw new T3xApiError('INVALID_ARGUMENT', message, 400);
}

export const proposalGenerationHandler: ToolHandler = (args) =>
  withTransitionApi(async (client) => {
    const {
      project_id: projectId,
      workspace_id: workspaceId,
      request_id,
      if_revision,
      instruction,
      posture = 'guided',
      source_material_ids = [],
      source_turn_hashes = [],
      provider,
      model,
    } = args;
    if (
      !isSafeBusinessIdentifier(projectId) ||
      !isSafeWorkspaceIdentifier(workspaceId) ||
      !nonempty(request_id, 200) ||
      typeof if_revision !== 'number' ||
      !Number.isSafeInteger(if_revision) ||
      if_revision < 1 ||
      !nonempty(instruction, 20000)
    ) {
      invalid('Provide project_id, workspace_id, request_id, if_revision, and instruction.');
    }
    if (
      (posture !== 'source_only' && posture !== 'guided' && posture !== 'recommend') ||
      (provider !== undefined && !nonempty(provider, 100)) ||
      (model !== undefined && !nonempty(model, 500))
    ) {
      invalid('Provide a supported posture and valid optional provider and model IDs.');
    }
    if (
      !sourceIds(source_material_ids, 256) ||
      !sourceIds(source_turn_hashes, 64) ||
      source_material_ids.length + source_turn_hashes.length === 0
    ) {
      invalid('Provide at least one exact material ID or original user turn hash.');
    }
    return client.generateWorkspaceProposal(projectId, {
      workspace_id: workspaceId,
      request_id,
      if_revision,
      instruction,
      posture,
      source_material_ids,
      source_turn_hashes,
      ...(provider === undefined ? {} : { provider }),
      ...(model === undefined ? {} : { model }),
    });
  });
