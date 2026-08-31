/** t3x_extract — compatibility name for server-owned Workspace extraction. */

import { getApiClient, isApiBackend } from '../../backend.js';
import { fail, ok, type ToolDef, type ToolHandler } from '../types.js';

export const extractDef: ToolDef = {
  name: 't3x_extract',
  description: [
    'Create a canonical extraction proposal from exact immutable Source turns in a Repository Workspace.',
    'The API re-resolves Source turns, the Workspace revision, target ref, actor, and provider policy.',
    'Raw-text Draft extraction is retired; create or append a Source Thread first.',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string', description: 'Project that owns the Workspace.' },
      workspace_id: { type: 'string', description: 'Existing Repository Workspace.' },
      source_thread_id: { type: 'string', description: 'Existing immutable Source Thread.' },
      turn_hashes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Exact immutable Source turn hashes.',
      },
      if_revision: { type: 'number', description: 'Optional positive Workspace revision.' },
      provider: { type: 'string', description: 'Optional configured provider override.' },
      model: { type: 'string', description: 'Optional model override.' },
    },
    required: ['project_id', 'workspace_id', 'source_thread_id', 'turn_hashes'],
  },
  annotations: { readOnlyHint: false, idempotentHint: false },
};

export const extractHandler: ToolHandler = async (args) => {
  const projectId = nonEmptyString(args.project_id);
  const workspaceId = nonEmptyString(args.workspace_id);
  const sourceThreadId = nonEmptyString(args.source_thread_id);
  const turnHashes = Array.isArray(args.turn_hashes)
    ? args.turn_hashes.filter((value): value is string => nonEmptyString(value) !== undefined)
    : [];
  if (!projectId || !workspaceId || !sourceThreadId || turnHashes.length === 0) {
    return fail('project_id, workspace_id, source_thread_id, and turn_hashes are required.');
  }
  if (!isApiBackend()) {
    return fail(
      't3x_extract requires T3X_MCP_BACKEND=api so Source resolution, authorization, and Workspace concurrency stay server-owned.'
    );
  }
  const ifRevision = args.if_revision;
  if (ifRevision !== undefined && (!Number.isInteger(ifRevision) || Number(ifRevision) < 1)) {
    return fail('if_revision must be a positive integer.');
  }

  return ok(
    await getApiClient().workspaces.createExtractionProposal(projectId, workspaceId, {
      source: { type: 'conversation', id: sourceThreadId, turn_hashes: turnHashes },
      ...(ifRevision === undefined ? {} : { if_revision: Number(ifRevision) }),
      ...(nonEmptyString(args.provider) ? { provider: String(args.provider) } : {}),
      ...(nonEmptyString(args.model) ? { model: String(args.model) } : {}),
    })
  );
};

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}
