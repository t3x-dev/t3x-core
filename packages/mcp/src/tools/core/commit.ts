/**
 * t3x_commit — snapshot a draft into an immutable commit.
 *
 * Reads the draft's tree data, computes a content hash,
 * creates an immutable commit record, and marks the draft
 * as committed.
 */

import { commitDraft, createCommit, findDraftById } from '@t3x-dev/storage';

import { getApiClient, isApiBackend } from '../../backend.js';
import { getDB } from '../../db.js';
import { fail, ok, type ToolDef, type ToolHandler } from '../types.js';

// ── Tool definition ──

export const commitDef: ToolDef = {
  name: 't3x_commit',
  description: [
    'Snapshot a draft into an immutable commit with a hash-chained record.',
    '',
    'Takes a draft_id (from a previous extract or edit), reads its tree data,',
    'computes a content hash, creates the commit, and marks the draft as committed.',
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

  const db = await getDB();

  // Step 1: Find draft and verify ownership
  const draft = await findDraftById(db, draftId);
  if (!draft) {
    return fail(`Draft not found: ${draftId}`);
  }
  if (draft.project_id !== projectId) {
    return fail(`Draft ${draftId} does not belong to project ${projectId}.`);
  }

  // Step 2: Validate draft status
  if (draft.status !== 'editing') {
    return fail(
      `Draft status is "${draft.status}", must be "editing".\n` +
        (draft.status === 'committed'
          ? `This draft was already committed as ${draft.committed_as}.`
          : 'Only drafts in "editing" status can be committed.')
    );
  }

  // Step 3: Read tree data from draft nodes
  const draftNodes = (draft.nodes ?? []) as Array<{
    key?: string;
    id?: string;
    slots?: Record<string, unknown>;
    text?: string;
    children?: unknown[];
  }>;

  if (draftNodes.length === 0) {
    return fail('Draft has no trees to commit.\nExtract or edit content before committing.');
  }

  // Step 4: Resolve parent commit
  const parents = draft.parent_commit_hash ? [draft.parent_commit_hash] : [];

  // Step 5: Convert draft nodes to commit trees
  const commitTrees = draftNodes.map((node, i) => ({
    key: node.key || node.id || `s_${i}`,
    slots: node.slots || (node.text ? { text: node.text } : {}),
    children: (node.children ?? []) as never[],
  }));

  // Step 6: Create the immutable commit
  const commit = await createCommit(db, {
    parents,
    author: { type: 'human' as const, name: 'mcp' },
    content: { trees: commitTrees, relations: [] },
    project_id: projectId,
    message,
    branch,
    provenance: { method: 'human_curation' },
    enforceBranchLinearity: true,
  });

  // Step 7: Mark draft as committed
  await commitDraft(db, draftId, commit.hash);

  return ok({
    commit_hash: commit.hash,
    branch: commit.branch ?? branch,
    parents,
    committed_at: commit.committed_at,
    tree_count: commitTrees.length,
    next_steps: [
      'Use t3x_query { "target": "commit", "id": "<hash>" } to inspect the commit.',
      'Use t3x_query { "target": "commits", "project_id": "..." } to list all commits.',
      'Create a leaf from this commit, or continue editing with a new extract.',
    ],
  });
};
