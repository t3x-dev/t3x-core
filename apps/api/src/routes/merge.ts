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

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { prepareMerge, executeMerge, type Merge2WayResult } from '@t3x/core';
import {
  getCommitV3,
  createCommitV3,
  updateBranchHead,
  createMergeDraft,
  getMergeDraft,
  updateMergeDraft,
  deleteMergeDraft,
  commitMergeDraft,
  findPendingMergeDraft,
} from '@t3x/storage';
import { getDB } from '../lib/db';
import { jsonError, jsonSuccess } from '../lib/response';
import { getAuthorFromContext } from '../lib/auth';

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

  // Load commits
  const sourceCommit = await getCommitV3(db, source_hash);
  if (!sourceCommit) {
    return jsonError(c, 'NOT_FOUND', `Source commit not found: ${source_hash}`, 404);
  }

  const targetCommit = await getCommitV3(db, target_hash);
  if (!targetCommit) {
    return jsonError(c, 'NOT_FOUND', `Target commit not found: ${target_hash}`, 404);
  }

  // Prepare merge
  const prepared = prepareMerge(sourceCommit.content, targetCommit.content);

  return jsonSuccess(c, prepared);
});

// ============================================================================
// POST /v1/merge/execute
// ============================================================================

const executeSchema = z.object({
  source_hash: z.string().min(1),
  target_hash: z.string().min(1),
  prepared: z.object({
    identical: z.array(z.any()),
    similarPairs: z.array(z.object({
      source: z.any(),
      target: z.any(),
      wordDiff: z.array(z.any()),
      resolution: z.enum(['source', 'target']).optional(),
      sourceConstraints: z.array(z.any()),
      targetConstraints: z.array(z.any()),
    })),
    onlyInSource: z.array(z.object({
      sentence: z.any(),
      constraints: z.array(z.any()),
      keep: z.boolean(),
    })),
    onlyInTarget: z.array(z.object({
      sentence: z.any(),
      constraints: z.array(z.any()),
      keep: z.boolean(),
    })),
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
  const { source_hash, target_hash, prepared, message, branch } = c.req.valid('json');

  // Validate all similar pairs are resolved
  const unresolved = prepared.similarPairs.filter(p => !p.resolution);
  if (unresolved.length > 0) {
    return jsonError(
      c,
      'UNRESOLVED_PAIRS',
      `${unresolved.length} similar pair(s) have no resolution`,
      400
    );
  }

  // Get author from context
  const author = getAuthorFromContext(c);
  const db = await getDB();

  try {
    // Execute merge
    const mergeCommit = executeMerge(
      prepared as Merge2WayResult,
      source_hash,
      target_hash,
      author,
      message
    );

    // Set branch if provided
    if (branch) {
      mergeCommit.branch = branch;
    }

    // Convert to CreateCommitV3Input format
    const commitInput = {
      hash: mergeCommit.hash,
      schema: mergeCommit.schema,
      parents: mergeCommit.parents,
      author: mergeCommit.author,
      committedAt: new Date(mergeCommit.committed_at),
      content: {
        sentences: mergeCommit.content.sentences.map((s) => ({
          text: s.text,
          startChar: 0,
          endChar: s.text.length,
          id: s.id,
          confidence: s.confidence,
          source: s.source,
        })),
        constraints: mergeCommit.content.constraints || [],
      },
      message: mergeCommit.message,
      branch: mergeCommit.branch,
    };

    // Save to storage
    await createCommitV3(db, commitInput, { strictParents: false });

    // Update branch head if branch specified
    if (branch) {
      // Get project_id from source commit
      const sourceCommit = await getCommitV3(db, source_hash);
      if (sourceCommit?.projectId) {
        await updateBranchHead(db, sourceCommit.projectId, branch, mergeCommit.hash);
      }
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
  const { project_id, source_hash, target_hash, source_branch, target_branch } = c.req.valid('json');
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

  // Load commits
  const sourceCommit = await getCommitV3(db, source_hash);
  if (!sourceCommit) {
    return jsonError(c, 'NOT_FOUND', `Source commit not found: ${source_hash}`, 404);
  }

  const targetCommit = await getCommitV3(db, target_hash);
  if (!targetCommit) {
    return jsonError(c, 'NOT_FOUND', `Target commit not found: ${target_hash}`, 404);
  }

  // Prepare merge
  const prepared = prepareMerge(sourceCommit.content, targetCommit.content);

  // Create draft
  const draft = await createMergeDraft(db, {
    projectId: project_id,
    sourceHash: source_hash,
    targetHash: target_hash,
    sourceBranch: source_branch,
    targetBranch: target_branch,
    prepared,
  });

  return jsonSuccess(c, {
    ...draft,
    prepared: JSON.parse(draft.preparedJson),
    preparedJson: undefined,
  }, 201);
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
mergeRoutes.post('/v1/merge/drafts/:id/commit', zValidator('json', commitDraftSchema), async (c) => {
  const draftId = c.req.param('id');
  const { message, branch } = c.req.valid('json');
  const db = await getDB();

  const draft = await getMergeDraft(db, draftId);
  if (!draft) {
    return jsonError(c, 'NOT_FOUND', `Merge draft not found: ${draftId}`, 404);
  }

  if (draft.status !== 'pending') {
    return jsonError(c, 'INVALID_STATUS', `Cannot commit draft with status: ${draft.status}`, 400);
  }

  const prepared = JSON.parse(draft.preparedJson) as Merge2WayResult;

  // Validate all similar pairs are resolved
  const unresolved = prepared.similarPairs.filter(p => !p.resolution);
  if (unresolved.length > 0) {
    return jsonError(
      c,
      'UNRESOLVED_PAIRS',
      `${unresolved.length} similar pair(s) have no resolution`,
      400
    );
  }

  const author = getAuthorFromContext(c);

  try {
    // Execute merge
    const mergeCommit = executeMerge(
      prepared,
      draft.sourceHash,
      draft.targetHash,
      author,
      message
    );

    // Set branch
    const targetBranch = branch || draft.targetBranch || 'main';
    mergeCommit.branch = targetBranch;

    // Convert to CreateCommitV3Input format
    const commitInput = {
      hash: mergeCommit.hash,
      schema: mergeCommit.schema,
      parents: mergeCommit.parents,
      author: mergeCommit.author,
      committedAt: new Date(mergeCommit.committed_at),
      content: {
        sentences: mergeCommit.content.sentences.map((s) => ({
          text: s.text,
          startChar: 0,
          endChar: s.text.length,
          id: s.id,
          confidence: s.confidence,
          source: s.source,
        })),
        constraints: mergeCommit.content.constraints || [],
      },
      projectId: draft.projectId,
      message: mergeCommit.message,
      branch: mergeCommit.branch,
    };

    // Save to storage
    await createCommitV3(db, commitInput, { strictParents: false });

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
});

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
