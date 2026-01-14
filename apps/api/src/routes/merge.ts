/**
 * Merge Routes
 *
 * POST /v1/merge/prepare - Prepare a merge between two commits
 * POST /v1/merge/execute - Execute merge with user resolutions
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { prepareMerge, executeMerge, type Merge2WayResult } from '@t3x/core';
import { getCommitV3, createCommitV3, updateBranchHead } from '@t3x/storage';
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
