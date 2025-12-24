/**
 * Commits Routes
 *
 * GET  /v1/commits - List commits (requires project_id query)
 * POST /v1/commits - Create commit
 * GET  /v1/commits/:hash - Get commit by hash
 */
import { Hono } from 'hono';
import { getDB } from '../lib/db';
import { jsonSuccess, jsonError } from '../lib/response';
import {
  insertCommit,
  findCommitsByProject,
  findCommitByHash,
  findProjectById,
  CommitError,
} from '@t3x/storage/pglite';

export const commitRoutes = new Hono();

/**
 * GET /v1/commits - List commits
 */
commitRoutes.get('/v1/commits', async (c) => {
  const projectId = c.req.query('project_id');

  if (!projectId) {
    return jsonError(c, 'INVALID_REQUEST', 'project_id query param is required', 400);
  }

  const branch = c.req.query('branch') ?? undefined;
  const limit = parseInt(c.req.query('limit') ?? '100', 10);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  try {
    const db = await getDB();
    const commitList = await findCommitsByProject(db, { projectId, branch, limit, offset });

    const apiCommits = commitList.map((commit) => ({
      commit_hash: commit.commitHash,
      project_id: commit.projectId,
      branch: commit.branch,
      message: commit.message,
      parents_json: commit.parentsJson,
      turn_window_json: commit.turnWindowJson,
      facet_snapshot_json: commit.facetSnapshotJson,
      pipeline_config_json: commit.pipelineConfigJson,
      draft_id: commit.draftId,
      draft_text_hash: commit.draftTextHash,
      signature_json: commit.signatureJson,
      source_excerpt_json: commit.sourceExcerptJson,
      must_have_json: commit.mustHaveJson,
      mustnt_have_json: commit.mustntHaveJson,
      position_x: commit.positionX,
      position_y: commit.positionY,
      source_refs_json: commit.sourceRefsJson,
      created_at: commit.createdAt.toISOString(),
    }));

    return jsonSuccess(c, { commits: apiCommits, project_id: projectId, branch, limit, offset });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'LIST_FAILED', message, 500);
  }
});

/**
 * POST /v1/commits - Create commit
 */
commitRoutes.post('/v1/commits', async (c) => {
  let body: {
    project_id?: string;
    branch?: string;
    message?: string;
    turn_window?: {
      start_turn_hash: string;
      end_turn_hash: string;
    };
    facet_snapshot?: unknown[];
    merge_parents?: string[];
    pipeline_config?: unknown;
    draft_id?: string;
    signature?: unknown;
    source_excerpt?: unknown;
    must_have?: unknown[];
    mustnt_have?: unknown[];
    position_x?: number;
    position_y?: number;
    source_refs?: unknown[];
  } | null = null;

  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'INVALID_JSON', 'Invalid JSON body', 400);
  }

  if (!body?.project_id) {
    return jsonError(c, 'INVALID_REQUEST', 'project_id is required', 400);
  }

  // Validate: either turn_window or merge_parents required
  const hasMergeParents = body.merge_parents && body.merge_parents.length > 0;
  const hasTurnWindow = !!body.turn_window;

  if (!hasMergeParents && !hasTurnWindow) {
    return jsonError(c, 'INVALID_REQUEST', 'Either turn_window or merge_parents is required', 400);
  }

  if (hasMergeParents && hasTurnWindow) {
    return jsonError(c, 'INVALID_REQUEST', 'Cannot specify both merge_parents and turn_window', 400);
  }

  try {
    const db = await getDB();

    // Verify project exists
    const project = await findProjectById(db, body.project_id);
    if (!project) {
      return jsonError(c, 'NOT_FOUND', `Project ${body.project_id} not found`, 404);
    }

    const commit = await insertCommit(db, {
      projectId: body.project_id,
      branch: body.branch,
      message: body.message,
      turnWindow: body.turn_window ? {
        startTurnHash: body.turn_window.start_turn_hash,
        endTurnHash: body.turn_window.end_turn_hash,
      } : undefined,
      facetSnapshot: body.facet_snapshot ?? [],
      mergeParents: body.merge_parents,
      pipelineConfig: body.pipeline_config,
      draftId: body.draft_id,
      signature: body.signature,
      sourceExcerpt: body.source_excerpt,
      mustHave: body.must_have,
      mustntHave: body.mustnt_have,
      positionX: body.position_x,
      positionY: body.position_y,
      sourceRefs: body.source_refs,
    });

    const apiCommit = {
      commit_hash: commit.commitHash,
      project_id: commit.projectId,
      branch: commit.branch,
      message: commit.message,
      parents_json: commit.parentsJson,
      turn_window_json: commit.turnWindowJson,
      facet_snapshot_json: commit.facetSnapshotJson,
      pipeline_config_json: commit.pipelineConfigJson,
      draft_id: commit.draftId,
      draft_text_hash: commit.draftTextHash,
      signature_json: commit.signatureJson,
      source_excerpt_json: commit.sourceExcerptJson,
      must_have_json: commit.mustHaveJson,
      mustnt_have_json: commit.mustntHaveJson,
      position_x: commit.positionX,
      position_y: commit.positionY,
      source_refs_json: commit.sourceRefsJson,
      created_at: commit.createdAt.toISOString(),
    };

    return jsonSuccess(c, apiCommit, 201);
  } catch (err) {
    if (err instanceof CommitError) {
      const status = err.code === 'BRANCH_NOT_FOUND' ? 404 : 400;
      return jsonError(c, err.code, err.message, status);
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'CREATE_FAILED', message, 500);
  }
});

/**
 * GET /v1/commits/:hash - Get commit by hash
 */
commitRoutes.get('/v1/commits/:hash', async (c) => {
  const commitHash = decodeURIComponent(c.req.param('hash'));

  try {
    const db = await getDB();
    const commit = await findCommitByHash(db, commitHash);

    if (!commit) {
      return jsonError(c, 'NOT_FOUND', `Commit ${commitHash} not found`, 404);
    }

    const apiCommit = {
      commit_hash: commit.commitHash,
      project_id: commit.projectId,
      branch: commit.branch,
      message: commit.message,
      parents_json: commit.parentsJson,
      turn_window_json: commit.turnWindowJson,
      facet_snapshot_json: commit.facetSnapshotJson,
      pipeline_config_json: commit.pipelineConfigJson,
      draft_id: commit.draftId,
      draft_text_hash: commit.draftTextHash,
      signature_json: commit.signatureJson,
      source_excerpt_json: commit.sourceExcerptJson,
      must_have_json: commit.mustHaveJson,
      mustnt_have_json: commit.mustntHaveJson,
      position_x: commit.positionX,
      position_y: commit.positionY,
      source_refs_json: commit.sourceRefsJson,
      created_at: commit.createdAt.toISOString(),
    };

    return jsonSuccess(c, apiCommit);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'GET_FAILED', message, 500);
  }
});
