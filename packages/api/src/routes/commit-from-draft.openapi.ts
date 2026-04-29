/**
 * Commit-from-Draft Route — Integration Layer "Commit" Verb
 *
 * Takes a draft_id (from the extract step), reads its tree data,
 * computes a hash, creates an immutable commit, and marks the draft
 * as committed.
 *
 * Endpoints:
 * - POST /v1/commit — Create commit from a draft
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: draft commit route adapts mixed node payload shapes pending stricter request schemas */

import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { commitDraft, createCommit, findDraftById } from '@t3x-dev/storage';
import { mapMainBranchLinearityError } from '../lib/commit-linearity';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { webhookDispatcher } from '../lib/webhook-dispatcher';
import { findUncommittedYOpsIds, mapSupersededError } from '../lib/yops-commit-link';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';
import { CommitFromDraftRequest, CommitFromDraftResponse } from '../schemas/integration-contracts';

export const commitFromDraftRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Route Definition
// ============================================================

const postCommitFromDraftRoute = createRoute({
  method: 'post',
  path: '/v1/commit',
  tags: ['Integration'],
  summary: 'Create commit from a draft',
  description:
    'Takes a draft_id (from the extract step), reads its tree data, ' +
    'computes a content hash, creates an immutable commit, marks the draft ' +
    'as committed, and fires a commit.created webhook.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CommitFromDraftRequest,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Commit created successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(CommitFromDraftResponse),
        },
      },
    },
    400: {
      description: 'Invalid request (empty draft or wrong status)',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'Draft or project not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// ============================================================
// Route Handler
// ============================================================

commitFromDraftRoutes.openapi(postCommitFromDraftRoute, async (c) => {
  const { project_id, draft_id, message, branch } = c.req.valid('json');
  const targetBranch = branch ?? 'main';

  try {
    const db = await getDB();

    // Step 1: Find the draft and verify ownership
    const draft = await findDraftById(db, draft_id);
    if (!draft) {
      return errorResponse(c, 'NOT_FOUND', `Draft ${draft_id} not found`);
    }
    if (draft.project_id !== project_id) {
      return errorResponse(c, 'NOT_FOUND', `Draft ${draft_id} not found in project ${project_id}`);
    }

    // Step 2: Validate draft state
    if (draft.status !== 'editing') {
      return errorResponse(
        c,
        'INVALID_REQUEST',
        `Draft status is '${draft.status}', must be 'editing'`
      );
    }

    // Step 3: Read tree data from draft
    // The extract endpoint stores trees in the draft's nodes field
    const draftNodes = (draft.nodes ?? []) as Array<{
      key?: string;
      id?: string;
      slots?: Record<string, unknown>;
      text?: string;
      children?: unknown[];
    }>;

    if (draftNodes.length === 0) {
      return errorResponse(c, 'INVALID_REQUEST', 'Draft has no trees to commit');
    }

    // Step 4: Resolve parent commit (from draft or branch HEAD)
    const parents = draft.parent_commit_hash ? [draft.parent_commit_hash] : [];

    // Step 5: Convert draft nodes to commit trees
    const commitTrees = draftNodes.map((node, i) => ({
      key: node.key || node.id || `s_${i}`,
      slots: node.slots || (node.text ? { text: node.text } : {}),
      children: (node.children ?? []) as any[],
    }));

    // Find uncommitted yops for this conversation (if draft is from a conversation)
    const conversationId = draft.goal?.startsWith('auto:') ? draft.goal.slice(5) : undefined;
    const yopsLogIds = conversationId
      ? await findUncommittedYOpsIds(db, conversationId, project_id)
      : [];

    // Drafts intentionally persist trees only (no relations_json column on
    // the drafts table; relate/unrelate ops are rejected by drafts-yops).
    // Therefore the commit derived from a draft has no relations to carry
    // forward — the empty array is correct here, not a placeholder. If
    // draft-side relations land in a follow-up, replace this with the
    // draft's persisted relations.
    const commit = await createCommit(db, {
      parents,
      author: { type: 'human' as const, name: 'api' },
      content: { trees: commitTrees, relations: [] },
      project_id,
      message: message ?? `Draft: ${draft.title}`,
      branch: targetBranch,
      provenance: { method: 'human_curation' },
      yops_log_ids: yopsLogIds,
      enforceMainLinearity: true,
    });

    // Step 6: Mark draft as committed
    await commitDraft(db, draft_id, commit.hash);

    // Step 7: Fire commit.created webhook
    const treeCount = commitTrees.length;
    webhookDispatcher.dispatch(
      'commit.created',
      {
        project_id,
        commit_hash: commit.hash,
        tree_count: treeCount,
        branch: commit.branch ?? targetBranch,
      },
      project_id
    );

    // Step 8: Return response
    return c.json(
      {
        success: true as const,
        data: {
          commit_hash: commit.hash,
          tree_count: treeCount,
          branch: commit.branch ?? targetBranch,
        },
      },
      201
    );
  } catch (err) {
    const linearity = mapMainBranchLinearityError(c, err);
    if (linearity) return linearity;
    // Suggestion-vs-baseline: if a concurrent re-extract superseded
    // any of the candidate yops_log_ids between findUncommittedYOpsIds
    // and createCommit, surface as 409 retryable conflict instead of
    // an opaque 500. Client should re-fetch the active draft and retry.
    const conflict = mapSupersededError(c, err);
    if (conflict) return conflict;
    const message_ = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'COMMIT_FAILED', message_);
  }
});
