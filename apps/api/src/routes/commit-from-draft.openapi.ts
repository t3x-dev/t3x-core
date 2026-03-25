/**
 * Commit-from-Draft Route — Integration Layer "Commit" Verb
 *
 * Takes a draft_id (from the extract step), reads its sentences,
 * computes a hash, creates an immutable commit, and marks the draft
 * as committed.
 *
 * Endpoints:
 * - POST /v1/commit — Create commit from a draft
 */

import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { commitDraft, createCommit, findDraftById } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { webhookDispatcher } from '../lib/webhook-dispatcher';
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
    'Takes a draft_id (from the extract step), reads its sentences, ' +
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

    // Step 3: Read sentences from draft
    // The extract endpoint stores sentences as an array of { id, text, confidence, source_ref? }
    const sentences = (draft.sentences ?? []) as Array<{
      id: string;
      text: string;
      confidence?: number;
      source_ref?: {
        conversation_id: string;
        turn_hash: string;
        start_char: number;
        end_char: number;
      };
    }>;

    if (sentences.length === 0) {
      return errorResponse(c, 'INVALID_REQUEST', 'Draft has no sentences to commit');
    }

    // Step 4: Resolve parent commit (from draft or branch HEAD)
    const parents = draft.parent_commit_hash ? [draft.parent_commit_hash] : [];

    // Step 5: Convert sentences to commit frames and create commit
    // Follows the same pattern as drafts-workflows.openapi.ts
    const commitFrames = sentences.map((s, i) => ({
      id: s.id || `f_${String(i + 1).padStart(3, '0')}`,
      type: 'legacy_sentence' as const,
      slots: { text: s.text },
      confidence: s.confidence,
    }));

    const commit = await createCommit(db, {
      parents,
      author: { type: 'human' as const, name: 'api' },
      content: { frames: commitFrames, relations: [] },
      project_id,
      message: message ?? `Draft: ${draft.title}`,
      branch: targetBranch,
      provenance: { method: 'human_curation' },
    });

    // Step 6: Mark draft as committed
    await commitDraft(db, draft_id, commit.hash);

    // Step 7: Fire commit.created webhook
    const sentenceCount = sentences.length;
    webhookDispatcher.dispatch(
      'commit.created',
      {
        project_id,
        commit_hash: commit.hash,
        sentence_count: sentenceCount,
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
          sentence_count: sentenceCount,
          branch: commit.branch ?? targetBranch,
        },
      },
      201
    );
  } catch (err) {
    const message_ = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'COMMIT_FAILED', message_);
  }
});
