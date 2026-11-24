import {
  SaveStudioSchemaEditCandidateInputSchema,
  SchemaPreparationInputSchema,
  StudioPreviewInputSchema,
  T3xApiError,
} from '@t3x-dev/api-client';
import { isSafeBusinessIdentifier, isSafeWorkspaceIdentifier } from '../business-capabilities.js';
import { withTransitionApi } from './transition/index.js';
import type { ToolDef, ToolHandler } from './types.js';

const workspaceScope = {
  project_id: { type: 'string', description: 'Project ID.' },
  workspace_id: { type: 'string', description: 'Owned Workspace ID.' },
};

export const schemaCandidateDef: ToolDef = {
  name: 't3x_schema_candidate',
  description: 'Read the saved Schema candidate, preview a definition, or save a candidate.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['read', 'preview', 'save'] },
      ...workspaceScope,
      input: {
        type: 'object',
        description: [
          'Omit for read. For preview and save, pass candidateIds (empty for the bound or empty Workspace base).',
          'Preview accepts schemaEditCandidate {candidateId, revision} for a saved revision and returns its reviewHash.',
          'Save requires ifRevision (candidate revision, 0 for initial save), retryKey, intent, and localContribution.',
          'For a complete definition, pass schemaDefinition and baseSchemaHash from its exact preview base. Set rebase explicitly when changing the editing base.',
          'Saving records a candidate only. Use the signed-in Web Workspace for adoption.',
        ].join(' '),
      },
    },
    required: ['action', 'project_id', 'workspace_id'],
  },
};

export const schemaPreparationDef: ToolDef = {
  name: 't3x_schema_preparation',
  description:
    'Preview the effect of a Schema candidate and proposed Content migrations on an exact Draft. Adopt in the signed-in Web Workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['preview'] },
      ...workspaceScope,
      input: {
        type: 'object',
        description:
          'Provide ifRevision (Workspace revision), commands (migration operations), and target. Use {kind:"studio", candidateIds, schemaEditCandidate:{candidateId, revision}, reviewHash} from the candidate definition preview or {kind:"pending", pendingId}. confirmedChanges names mapping paths for this preview only.',
      },
    },
    required: ['action', 'project_id', 'workspace_id', 'input'],
  },
  annotations: { readOnlyHint: true },
};

function invalid(message: string): never {
  throw new T3xApiError('INVALID_ARGUMENT', message, 400);
}

export const schemaCandidateHandler: ToolHandler = (args) =>
  withTransitionApi(async (client) => {
    const { action, project_id: projectId, workspace_id: workspaceId, input } = args;
    if (!isSafeBusinessIdentifier(projectId) || !isSafeWorkspaceIdentifier(workspaceId)) {
      invalid('Provide project_id and workspace_id.');
    }
    if (action === 'read') return client.readStudioSchemaEditCandidate(projectId, workspaceId);
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      invalid('Provide the candidate input object.');
    }
    if (action === 'preview') {
      const preview = StudioPreviewInputSchema.safeParse({ ...input, workspaceId });
      if (!preview.success) invalid('Invalid preview input: ' + preview.error.message);
      return client.previewStudioSchema(projectId, preview.data);
    }
    if (action === 'save') {
      const save = SaveStudioSchemaEditCandidateInputSchema.safeParse({
        ...input,
        workspaceId,
        origin: 'api',
      });
      if (!save.success) invalid('Invalid candidate input: ' + save.error.message);
      return client.saveStudioSchemaEditCandidate(projectId, save.data);
    }
    invalid('action must be read, preview, or save.');
  });

export const schemaPreparationHandler: ToolHandler = (args) =>
  withTransitionApi(async (client) => {
    const { action, project_id: projectId, workspace_id: workspaceId, input } = args;
    if (!isSafeBusinessIdentifier(projectId) || !isSafeWorkspaceIdentifier(workspaceId)) {
      invalid('Provide project_id and workspace_id.');
    }
    if (action !== 'preview') invalid('action must be preview. Adopt the Schema in Web.');
    const preview = SchemaPreparationInputSchema.safeParse(input);
    if (!preview.success) invalid('Invalid preparation input: ' + preview.error.message);
    return client.previewStudioSchemaPreparation(projectId, workspaceId, preview.data);
  });
