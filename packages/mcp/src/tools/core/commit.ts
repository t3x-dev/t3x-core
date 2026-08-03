/**
 * t3x_commit — snapshot a draft into an immutable commit.
 *
 * Reads the draft's tree data, runs the governed repository Transition,
 * advances the ref with CAS, and marks the draft as committed.
 */

import {
  type AnyDB,
  commitDraft,
  ensureMainBranch,
  findDraftById,
  getTransitionRefHead,
  TransitionHeadConflictError,
  TransitionRefNotFoundError,
} from '@t3x-dev/storage';

import { getApiClient, isApiBackend } from '../../backend.js';
import { getDB } from '../../db.js';
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

  // Step 4: Convert draft nodes to repository trees.
  const commitTrees = draftNodes.map((node, i) => ({
    key: node.key || node.id || `s_${i}`,
    slots: node.slots || (node.text ? { text: node.text } : {}),
    children: (node.children ?? []) as never[],
  }));

  try {
    // Step 5: Resolve the exact CommitV2 head observed by this command.
    if (branch === 'main') await ensureMainBranch(db, projectId);
    const observedHead = await getTransitionRefHead(db, { projectId, refName: branch });
    const expectedHead = draft.parent_commit_hash ?? observedHead.head;
    if (draft.parent_commit_hash !== undefined && draft.parent_commit_hash !== observedHead.head) {
      return fail('Draft parent does not match the target ref head. Refresh the draft and retry.');
    }

    // Load the shared application use case only for the storage backend. The
    // API backend already executes the same use case behind commitFromDraft.
    const {
      commitRepositoryYOpsState,
      createRepositoryYOpsStateFromSemanticContent,
      getRepositoryConversationEvidence,
    } = await import('@t3x-dev/api/repository-state-transition');
    const target = createRepositoryYOpsStateFromSemanticContent({
      trees: commitTrees,
      relations: [],
    });
    let created: Awaited<ReturnType<typeof commitRepositoryYOpsState>> | undefined;
    const runner = db as unknown as {
      transaction: <T>(fn: (tx: AnyDB) => Promise<T>) => Promise<T>;
    };
    await runner.transaction(async (tx) => {
      const conversationId = draft.goal?.startsWith('auto:') ? draft.goal.slice(5) : undefined;
      const evidence = conversationId
        ? await getRepositoryConversationEvidence(tx, projectId, conversationId)
        : [];
      created = await commitRepositoryYOpsState({
        db: tx,
        projectId,
        refName: branch,
        expectedHead,
        target,
        actor: { kind: 'human', id: 'human:mcp-local' },
        intent: message,
        ...(evidence.length === 0 ? {} : { evidence }),
      });
      if (!(await commitDraft(tx, draftId, created.commitDigest))) {
        throw new Error(`Draft ${draftId} was already committed by another request.`);
      }
    });
    if (created === undefined) throw new Error('CommitV2 transaction did not return a result.');

    return ok({
      commit_hash: created.commitDigest,
      schema: created.commit.schema,
      branch,
      parents: created.commit.parents.map((parent) => parent.digest),
      tree_count: commitTrees.length,
      next_steps: [
        'Use t3x_query { "target": "commit", "id": "<hash>" } to inspect the commit.',
        'Use t3x_query { "target": "commits", "project_id": "..." } to list all commits.',
        'Create a leaf from this commit, or continue editing with a new extract.',
      ],
    });
  } catch (error) {
    if (error instanceof TransitionHeadConflictError) {
      return fail(`Draft parent does not match the target ref head. ${error.message}`);
    }
    if (error instanceof TransitionRefNotFoundError) return fail(error.message);
    throw error;
  }
};
