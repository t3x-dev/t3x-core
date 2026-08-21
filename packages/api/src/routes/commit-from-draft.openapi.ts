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
import {
  type AnyDB,
  commitDraft,
  ensureMainBranch,
  findDraftById,
  getTransitionRefHead,
  TransitionHeadConflictError,
  TransitionRefNotFoundError,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess, getUserId } from '../lib/project-access';
import {
  commitRepositoryYOpsState,
  createRepositoryYOpsStateFromSemanticContent,
  getRepositoryConversationEvidence,
} from '../lib/repository-state-transition';
import { webhookDispatcher } from '../lib/webhook-dispatcher';
import { findUncommittedYOpsIds, mapSupersededError } from '../lib/yops-commit-link';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';
import { CommitFromDraftRequest, CommitFromDraftResponse } from '../schemas/integration-contracts';

export const commitFromDraftRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

type TxRunner = { transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown> };
type CommitTree = Parameters<
  typeof createRepositoryYOpsStateFromSemanticContent
>[0]['trees'][number];

class DraftCommitClaimConflictError extends Error {
  constructor(readonly draftId: string) {
    super(`Draft ${draftId} was already committed by another request`);
    this.name = 'DraftCommitClaimConflictError';
  }
}

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
    const access = await assertProjectAccess(c, db, project_id);
    if (access instanceof Response) return access;

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

    // Step 4: Resolve the exact CommitV2 ref head observed by this command.
    if (targetBranch === 'main') await ensureMainBranch(db, project_id);
    const observedHead = await getTransitionRefHead(db, {
      projectId: project_id,
      refName: targetBranch,
    });
    const expectedHead = draft.parent_commit_hash ?? observedHead.head;
    if (draft.parent_commit_hash !== undefined && draft.parent_commit_hash !== observedHead.head) {
      return errorResponse(c, 'BRANCH_NOT_HEAD', 'Draft parent does not match the target ref head');
    }

    // Step 5: Convert draft nodes to commit trees
    const commitTrees: CommitTree[] = draftNodes.map(
      (node, i) =>
        ({
          key: node.key || node.id || `s_${i}`,
          slots: node.slots || (node.text ? { text: node.text } : {}),
          children: (node.children ?? []) as CommitTree[],
        }) as CommitTree
    );

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
    const target = createRepositoryYOpsStateFromSemanticContent({
      trees: commitTrees,
      relations: [],
    });
    const userId = getUserId(c);
    let commitDigest: string | undefined;
    await (db as unknown as TxRunner).transaction(async (rawTx) => {
      const tx = rawTx as AnyDB;
      const evidence = conversationId
        ? await getRepositoryConversationEvidence(tx, project_id, conversationId)
        : [];
      const created = await commitRepositoryYOpsState({
        db: tx,
        projectId: project_id,
        refName: targetBranch,
        expectedHead,
        target,
        actor: {
          kind: 'human',
          id: userId ? `user:${userId}` : 'human:local-user',
        },
        intent: message ?? `Draft: ${draft.title}`,
        ...(evidence.length === 0 ? {} : { evidence }),
        ...(yopsLogIds.length === 0 ? {} : { yopsLogIds }),
      });
      const claimed = await commitDraft(tx, draft_id, created.commitDigest);
      if (!claimed) throw new DraftCommitClaimConflictError(draft_id);
      commitDigest = created.commitDigest;
    });
    if (commitDigest === undefined) throw new Error('CommitV2 transaction did not return a digest');

    // Step 7: Fire commit.created webhook
    const treeCount = commitTrees.length;
    webhookDispatcher.dispatch(
      'commit.created',
      {
        project_id,
        commit_hash: commitDigest,
        tree_count: treeCount,
        branch: targetBranch,
      },
      project_id
    );

    // Step 8: Return response
    return c.json(
      {
        success: true as const,
        data: {
          commit_hash: commitDigest,
          tree_count: treeCount,
          branch: targetBranch,
        },
      },
      201
    );
  } catch (err) {
    if (err instanceof TransitionHeadConflictError) {
      return errorResponse(c, 'BRANCH_NOT_HEAD', err.message);
    }
    if (err instanceof TransitionRefNotFoundError) {
      return errorResponse(c, 'NOT_FOUND', err.message);
    }
    if (err instanceof DraftCommitClaimConflictError) {
      return errorResponse(c, 'ALREADY_COMMITTED', err.message);
    }
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
