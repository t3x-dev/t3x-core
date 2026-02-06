/**
 * Merge Routes
 *
 * POST /v1/merge/prepare - Prepare a merge between two commits
 * POST /v1/merge/execute - Execute merge with user resolutions
 *
 * Merge Draft Routes (for Merge Workspace):
 * POST /v1/merge/drafts - Create a new merge draft
 * GET /v1/merge/drafts/:id - Get a merge draft
 * PATCH /v1/merge/drafts/:id - Update merge draft decisions
 * POST /v1/merge/drafts/:id/commit - Commit a merge draft
 * DELETE /v1/merge/drafts/:id - Delete a merge draft
 */

import { zValidator } from '@hono/zod-validator';
import { executeMerge, type Merge2WayResult, prepareMerge } from '@t3x/core';
import {
  commitMergeDraft,
  createCommitV4,
  createMergeDraft,
  deleteMergeDraft,
  findCommitV4ByHash,
  findPendingMergeDraft,
  getMergeDraft,
  updateBranchHead,
  updateMergeDraft,
} from '@t3x/storage';
import { Hono } from 'hono';
import { z } from 'zod';
import { getAuthorFromContext } from '../lib/auth';
import { getDB } from '../lib/db';
import { jsonError, jsonSuccess } from '../lib/response';

// ============================================================================
// Routes
// ============================================================================

export const mergeRoutes = new Hono();

// ============================================================================
// POST /v1/merge/prepare
// ============================================================================

const prepareSchema = z.object({
  source_hash: z.string().min(1),
  target_hash: z.string().min(1),
});

/**
 * Prepare a merge between two commits
 *
 * Request:
 *   POST /v1/merge/prepare
 *   { "source_hash": "sha256:abc...", "target_hash": "sha256:def..." }
 *
 * Response:
 *   {
 *     "success": true,
 *     "data": {
 *       "identical": [...],
 *       "similarPairs": [...],
 *       "onlyInSource": [...],
 *       "onlyInTarget": [...]
 *     }
 *   }
 */
mergeRoutes.post('/v1/merge/prepare', zValidator('json', prepareSchema), async (c) => {
  const { source_hash, target_hash } = c.req.valid('json');
  const db = await getDB();

  // Load V4 commits
  const sourceCommit = await findCommitV4ByHash(db, source_hash);
  if (!sourceCommit) {
    return jsonError(c, 'NOT_FOUND', `Source commit not found: ${source_hash}`, 404);
  }

  const targetCommit = await findCommitV4ByHash(db, target_hash);
  if (!targetCommit) {
    return jsonError(c, 'NOT_FOUND', `Target commit not found: ${target_hash}`, 404);
  }

  // Prepare merge - V4 sentences with source_ref preserved
  const prepared = prepareMerge(sourceCommit.content.sentences, targetCommit.content.sentences);

  return jsonSuccess(c, prepared);
});

// ============================================================================
// POST /v1/merge/execute
// ============================================================================

// V4 Schema: No constraints (they belong to Leaf)
const executeSchema = z.object({
  source_hash: z.string().min(1),
  target_hash: z.string().min(1),
  project_id: z.string().min(1),
  prepared: z.object({
    identical: z.array(z.any()),
    similarPairs: z.array(
      z.object({
        source: z.any(),
        target: z.any(),
        wordDiff: z.array(z.any()),
        resolution: z.enum(['source', 'target']).optional(),
        // V4: No sourceConstraints, targetConstraints
      })
    ),
    onlyInSource: z.array(
      z.object({
        sentence: z.any(),
        keep: z.boolean(),
        // V4: No constraints
      })
    ),
    onlyInTarget: z.array(
      z.object({
        sentence: z.any(),
        keep: z.boolean(),
        // V4: No constraints
      })
    ),
  }),
  message: z.string(),
  branch: z.string().optional(),
});

/**
 * Execute a merge after user has made all decisions
 *
 * Request:
 *   POST /v1/merge/execute
 *   {
 *     "source_hash": "sha256:abc...",
 *     "target_hash": "sha256:def...",
 *     "prepared": { ... with resolutions filled in ... },
 *     "message": "Merge feature-branch into main",
 *     "branch": "main"
 *   }
 *
 * Response:
 *   { "success": true, "data": { CommitV3 } }
 */
mergeRoutes.post('/v1/merge/execute', zValidator('json', executeSchema), async (c) => {
  const { source_hash, target_hash, project_id, prepared, message, branch } = c.req.valid('json');

  // Validate all similar pairs are resolved
  const unresolved = prepared.similarPairs.filter((p) => !p.resolution);
  if (unresolved.length > 0) {
    return jsonError(
      c,
      'UNRESOLVED_PAIRS',
      `${unresolved.length} similar pair(s) have no resolution`,
      400
    );
  }

  // Get author from context (convert to V4 format)
  const authorV3 = getAuthorFromContext(c);
  const author = { type: 'human' as const, name: authorV3.name, id: authorV3.identity };
  const db = await getDB();

  try {
    // Execute merge - V4 API requires projectId
    const mergeCommit = executeMerge(
      prepared as Merge2WayResult,
      source_hash,
      target_hash,
      author,
      message,
      project_id
    );

    // Set branch if provided
    if (branch) {
      mergeCommit.branch = branch;
    }

    // Save as V4 commit (use correct CreateCommitV4Input format)
    await createCommitV4(
      db,
      {
        parents: mergeCommit.parents,
        author: mergeCommit.author,
        sentences: mergeCommit.content.sentences,
        project_id: project_id,
        message: mergeCommit.message,
        branch: mergeCommit.branch,
      },
      { strictParents: false }
    );

    // Update branch head if branch specified
    if (branch) {
      await updateBranchHead(db, project_id, branch, mergeCommit.hash);
    }

    return jsonSuccess(c, mergeCommit);
  } catch (error) {
    return jsonError(
      c,
      'MERGE_FAILED',
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
});

// ============================================================================
// Merge Draft Routes (for Merge Workspace)
// ============================================================================

const createDraftSchema = z.object({
  project_id: z.string().min(1),
  source_hash: z.string().min(1),
  target_hash: z.string().min(1),
  source_branch: z.string().optional(),
  target_branch: z.string().optional(),
});

/**
 * Create a new merge draft
 *
 * If a pending draft already exists for the same source/target, returns that instead.
 */
mergeRoutes.post('/v1/merge/drafts', zValidator('json', createDraftSchema), async (c) => {
  const { project_id, source_hash, target_hash, source_branch, target_branch } =
    c.req.valid('json');
  const db = await getDB();

  // Check if pending draft already exists
  const existingDraft = await findPendingMergeDraft(db, project_id, source_hash, target_hash);
  if (existingDraft) {
    return jsonSuccess(c, {
      ...existingDraft,
      prepared: JSON.parse(existingDraft.preparedJson),
      preparedJson: undefined,
    });
  }

  // Load V4 commits
  const sourceCommit = await findCommitV4ByHash(db, source_hash);
  if (!sourceCommit) {
    return jsonError(c, 'NOT_FOUND', `Source commit not found: ${source_hash}`, 404);
  }

  const targetCommit = await findCommitV4ByHash(db, target_hash);
  if (!targetCommit) {
    return jsonError(c, 'NOT_FOUND', `Target commit not found: ${target_hash}`, 404);
  }

  // Prepare merge - V4 sentences with source_ref preserved
  const prepared = prepareMerge(sourceCommit.content.sentences, targetCommit.content.sentences);

  // Create draft
  const draft = await createMergeDraft(db, {
    projectId: project_id,
    sourceHash: source_hash,
    targetHash: target_hash,
    sourceBranch: source_branch,
    targetBranch: target_branch,
    prepared,
  });

  return jsonSuccess(
    c,
    {
      ...draft,
      prepared: JSON.parse(draft.preparedJson),
      preparedJson: undefined,
    },
    201
  );
});

/**
 * Get a merge draft by ID
 */
mergeRoutes.get('/v1/merge/drafts/:id', async (c) => {
  const draftId = c.req.param('id');
  const db = await getDB();

  const draft = await getMergeDraft(db, draftId);
  if (!draft) {
    return jsonError(c, 'NOT_FOUND', `Merge draft not found: ${draftId}`, 404);
  }

  return jsonSuccess(c, {
    ...draft,
    prepared: JSON.parse(draft.preparedJson),
    preparedJson: undefined,
  });
});

const updateDraftSchema = z.object({
  prepared: z.any().optional(),
  message: z.string().optional(),
});

/**
 * Update merge draft decisions (for auto-save)
 */
mergeRoutes.patch('/v1/merge/drafts/:id', zValidator('json', updateDraftSchema), async (c) => {
  const draftId = c.req.param('id');
  const { prepared, message } = c.req.valid('json');
  const db = await getDB();

  const draft = await getMergeDraft(db, draftId);
  if (!draft) {
    return jsonError(c, 'NOT_FOUND', `Merge draft not found: ${draftId}`, 404);
  }

  if (draft.status !== 'pending') {
    return jsonError(c, 'INVALID_STATUS', `Cannot update draft with status: ${draft.status}`, 400);
  }

  const updated = await updateMergeDraft(db, draftId, { prepared, message });
  if (!updated) {
    return jsonError(c, 'UPDATE_FAILED', 'Failed to update merge draft', 500);
  }

  return jsonSuccess(c, {
    ...updated,
    prepared: JSON.parse(updated.preparedJson),
    preparedJson: undefined,
  });
});

const commitDraftSchema = z.object({
  message: z.string().min(1),
  branch: z.string().optional(),
});

/**
 * Commit a merge draft (finalize the merge)
 */
mergeRoutes.post(
  '/v1/merge/drafts/:id/commit',
  zValidator('json', commitDraftSchema),
  async (c) => {
    const draftId = c.req.param('id');
    const { message, branch } = c.req.valid('json');
    const db = await getDB();

    const draft = await getMergeDraft(db, draftId);
    if (!draft) {
      return jsonError(c, 'NOT_FOUND', `Merge draft not found: ${draftId}`, 404);
    }

    if (draft.status !== 'pending') {
      return jsonError(
        c,
        'INVALID_STATUS',
        `Cannot commit draft with status: ${draft.status}`,
        400
      );
    }

    const prepared = JSON.parse(draft.preparedJson) as Merge2WayResult;

    // Validate all similar pairs are resolved
    const unresolved = prepared.similarPairs.filter((p) => !p.resolution);
    if (unresolved.length > 0) {
      return jsonError(
        c,
        'UNRESOLVED_PAIRS',
        `${unresolved.length} similar pair(s) have no resolution`,
        400
      );
    }

    // Get author from context (convert to V4 format)
    const authorV3 = getAuthorFromContext(c);
    const author = { type: 'human' as const, name: authorV3.name, id: authorV3.identity };

    try {
      // Execute merge - V4 API requires projectId
      const mergeCommit = executeMerge(
        prepared,
        draft.sourceHash,
        draft.targetHash,
        author,
        message,
        draft.projectId
      );

      // Set branch
      const targetBranch = branch || draft.targetBranch || 'main';
      mergeCommit.branch = targetBranch;

      // Save as V4 commit (use correct CreateCommitV4Input format)
      await createCommitV4(
        db,
        {
          parents: mergeCommit.parents,
          author: mergeCommit.author,
          sentences: mergeCommit.content.sentences,
          project_id: draft.projectId,
          message: mergeCommit.message,
          branch: mergeCommit.branch,
        },
        { strictParents: false }
      );

      // Update branch head
      await updateBranchHead(db, draft.projectId, targetBranch, mergeCommit.hash);

      // Mark draft as committed
      await commitMergeDraft(db, draftId);

      return jsonSuccess(c, mergeCommit);
    } catch (error) {
      return jsonError(
        c,
        'MERGE_FAILED',
        error instanceof Error ? error.message : 'Unknown error',
        500
      );
    }
  }
);

/**
 * Delete (cancel) a merge draft
 */
mergeRoutes.delete('/v1/merge/drafts/:id', async (c) => {
  const draftId = c.req.param('id');
  const db = await getDB();

  const draft = await getMergeDraft(db, draftId);
  if (!draft) {
    return jsonError(c, 'NOT_FOUND', `Merge draft not found: ${draftId}`, 404);
  }

  const deleted = await deleteMergeDraft(db, draftId);
  if (!deleted) {
    return jsonError(c, 'DELETE_FAILED', 'Failed to delete merge draft', 500);
  }

  return jsonSuccess(c, { deleted: true });
});
