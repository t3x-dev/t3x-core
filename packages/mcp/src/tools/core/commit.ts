/**
 * t3x_commit — snapshot a draft into an immutable commit.
 *
 * Reads the draft's tree data, runs the governed repository Transition,
 * advances the ref with CAS, and marks the draft as committed.
 */

import { getApiClient, isApiBackend } from '../../backend.js';
import { fail, ok, type ToolDef, type ToolHandler } from '../types.js';

// ── Tool definition ──

export const commitDef: ToolDef = {
  name: 't3x_commit',
  description: [
    'Commit a draft through a verified state Transition and immutable CommitV2.',
    '',
    'Takes a draft_id (from a previous extract or edit), reads its tree data,',
    'verifies deterministic replay, records the Decision, creates CommitV2, and marks the draft as committed.',
    '',
    'The draft must be in "editing" status and must contain at least one tree node.',
    '',
    'Example:',
    '  { "project_id": "proj_abc", "draft_id": "draft_xyz", "message": "Initial extraction" }',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'Project ID that owns the draft.',
      },
      draft_id: {
        type: 'string',
        description: 'Draft ID from a previous extract or edit step.',
      },
      message: {
        type: 'string',
        description: 'Commit message describing what this snapshot captures.',
      },
      branch: {
        type: 'string',
        description: 'Target branch name (default: "main").',
      },
    },
    required: ['project_id', 'draft_id', 'message'],
  },
  annotations: {
    readOnlyHint: false,
    idempotentHint: true,
  },
};

// ── Handler ──

export const commitHandler: ToolHandler = async (args) => {
  const projectId = args.project_id as string | undefined;
  const draftId = args.draft_id as string | undefined;
  const message = args.message as string | undefined;
  const branch = (args.branch as string | undefined) ?? 'main';

  if (!projectId) {
    return fail('"project_id" is required.\nProvide the project that owns the draft.');
  }
  if (!draftId) {
    return fail('"draft_id" is required.\nProvide the draft ID from a previous extract or edit.');
  }
  if (!message) {
    return fail('"message" is required.\nProvide a commit message describing this snapshot.');
  }

  if (isApiBackend()) {
    const client = getApiClient();
    const result = await client.commitFromDraft({
      project_id: projectId,
      draft_id: draftId,
      message,
      branch,
    });

    return ok({
      ...result,
      next_steps: [
        'Use t3x_query { "target": "commit", "id": "<hash>" } to inspect the commit.',
        'Use t3x_query { "target": "commits", "project_id": "..." } to list all commits.',
        'Create a leaf from this commit, or continue editing with a new extract.',
      ],
    });
  }

  return fail(
    [
      't3x_commit requires T3X_MCP_BACKEND=api.',
      'CommitV2 writes must go through the shared API/application command and authorization kernel.',
      'The legacy storage backend remains available for local read/prepare workflows, but it may not mint actors or advance refs directly.',
    ].join('\n')
  );
};
