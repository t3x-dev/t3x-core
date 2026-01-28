/**
 * Merge Routes with OpenAPI
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
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { prepareMerge, executeMerge, type Merge2WayResult } from '@t3x/core';
import {
  findCommitV4ByHash,
  createCommitV4,
  updateBranchHead,
  createMergeDraft,
  getMergeDraft,
  updateMergeDraft,
  deleteMergeDraft,
  commitMergeDraft,
  findPendingMergeDraft,
} from '@t3x/storage';
import { getDB } from '../lib/db';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';
import {
  PrepareMergeRequestSchema,
  ExecuteMergeRequestSchema,
  PrepareMergeResponseSchema,
  ExecuteMergeResponseSchema,
} from '../schemas/merge';
import { getAuthorFromContext } from '../lib/auth';

export const mergeRoutes = new OpenAPIHono();

// ============================================================================
// POST /v1/merge/prepare
// ============================================================================

const prepareMergeRoute = createRoute({
  method: 'post',
  path: '/v1/merge/prepare',
  tags: ['Merge'],
  summary: 'Prepare a two-way merge',
  description: `
Analyzes two commits and returns a merge preparation result.

This endpoint performs a two-way merge analysis (no common ancestor required) and returns:
- **identical**: Sentences that are exactly the same in both commits
- **similarPairs**: Pairs of similar sentences that require user resolution
- **onlyInSource**: Sentences only present in the source commit
- **onlyInTarget**: Sentences only present in the target commit

The client must resolve all similarPairs (choose 'source' or 'target') and decide which onlyInSource/onlyInTarget sentences to keep before calling /execute.
  `.trim(),
  request: {
    body: {
      content: {
        'application/json': {
          schema: PrepareMergeRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Merge preparation successful',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(PrepareMergeResponseSchema),
        },
      },
    },
    404: {
      description: 'Source or target commit not found',
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

mergeRoutes.openapi(prepareMergeRoute, async (c) => {
  const { source_hash, target_hash } = c.req.valid('json');
  const db = await getDB();

  // Load commits
  const sourceCommit = await findCommitV4ByHash(db, source_hash);
  if (!sourceCommit) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'NOT_FOUND',
          message: `Source commit not found: ${source_hash}`,
        },
      },
      404
    );
  }

  const targetCommit = await findCommitV4ByHash(db, target_hash);
  if (!targetCommit) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'NOT_FOUND',
          message: `Target commit not found: ${target_hash}`,
        },
      },
      404
    );
  }

  // Prepare merge
  const prepared = prepareMerge(sourceCommit.content, targetCommit.content);

  return c.json({ success: true as const, data: prepared }, 200);
});

// ============================================================================
// POST /v1/merge/execute
// ============================================================================

const executeMergeRoute = createRoute({
  method: 'post',
  path: '/v1/merge/execute',
  tags: ['Merge'],
  summary: 'Execute a merge with user resolutions',
  description: `
Executes a merge after the user has made all resolution decisions.

**Requirements:**
- All \`similarPairs[].resolution\` must be set to either 'source' or 'target'
- All \`onlyInSource[].keep\` and \`onlyInTarget[].keep\` must be set to true or false

**Result:**
- Creates a new merge commit with 2 parents: [source_hash, target_hash]
- Merged sentences get new IDs: 'm1', 'm2', ...
- Merged constraints get new IDs: 'mc1', 'mc2', ...
- Optionally updates the branch pointer if \`branch\` is specified

**Author Information:**
- If \`X-User-Name\` and \`X-User-Email\` headers are present, uses those (verified author)
- Otherwise, uses local author (verification: 'none')
  `.trim(),
  request: {
    body: {
      content: {
        'application/json': {
          schema: ExecuteMergeRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Merge executed successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ExecuteMergeResponseSchema),
        },
      },
    },
    400: {
      description: 'Invalid request (e.g., unresolved similar pairs)',
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

mergeRoutes.openapi(executeMergeRoute, async (c) => {
  const { source_hash, target_hash, prepared, message, branch } = c.req.valid('json');

  // Validate all similar pairs are resolved
  const unresolved = prepared.similarPairs.filter((p) => !p.resolution);
  if (unresolved.length > 0) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'UNRESOLVED_PAIRS',
          message: `${unresolved.length} similar pair(s) have no resolution`,
        },
      },
      400
    );
  }

  // Get author from context
  const author = getAuthorFromContext(c);
  const db = await getDB();

  // Get project_id from source commit
  const sourceCommit = await findCommitV4ByHash(db, source_hash);
  const projectId = sourceCommit?.projectId || project_id;

  try {
    // Execute merge - V4 requires projectId
    const mergeCommit = executeMerge(
      prepared as Merge2WayResult,
      source_hash,
      target_hash,
      { type: 'human' as const, name: author.name, id: author.identity },
      message,
      projectId
    );

    // Set branch if provided
    if (branch) {
      mergeCommit.branch = branch;
    }

    // Save as V4 commit directly (source_ref preserved)
    await createCommitV4(db, {
      hash: mergeCommit.hash,
      parents: mergeCommit.parents,
      author: mergeCommit.author,
      committedAt: new Date(mergeCommit.committed_at),
      content: mergeCommit.content,
      projectId,
      message: mergeCommit.message,
      branch: mergeCommit.branch,
    });

    // Update branch head if branch specified
    if (branch && projectId) {
      await updateBranchHead(db, projectId, branch, mergeCommit.hash);
    }

    return c.json({ success: true as const, data: mergeCommit }, 200);
  } catch (error) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'MERGE_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      500
    );
  }
});

// ============================================================================
// Merge Draft Routes (for Merge Workspace)
// ============================================================================

// Schemas for draft routes
const CreateDraftRequestSchema = z.object({
  project_id: z.string().min(1),
  source_hash: z.string().min(1),
  target_hash: z.string().min(1),
  source_branch: z.string().optional(),
  target_branch: z.string().optional(),
});

const UpdateDraftRequestSchema = z.object({
  prepared: z.any().optional(),
  message: z.string().optional(),
});

const CommitDraftRequestSchema = z.object({
  message: z.string().min(1),
  branch: z.string().optional(),
});

const DraftIdParamSchema = z.object({
  id: z.string().min(1),
});

// POST /v1/merge/drafts - Create a new merge draft
const createDraftRoute = createRoute({
  method: 'post',
  path: '/v1/merge/drafts',
  tags: ['Merge'],
  summary: 'Create a new merge draft',
  description: 'Creates a merge draft for the workspace. If a pending draft already exists for the same source/target, returns that instead.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateDraftRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Draft created or existing draft returned',
      content: { 'application/json': { schema: z.any() } },
    },
    201: {
      description: 'New draft created',
      content: { 'application/json': { schema: z.any() } },
    },
    404: {
      description: 'Source or target commit not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

mergeRoutes.openapi(createDraftRoute, async (c) => {
  const { project_id, source_hash, target_hash, source_branch, target_branch } = c.req.valid('json');
  const db = await getDB();

  // Check if pending draft already exists
  const existingDraft = await findPendingMergeDraft(db, project_id, source_hash, target_hash);
  if (existingDraft) {
    return c.json({
      success: true as const,
      data: {
        ...existingDraft,
        prepared: JSON.parse(existingDraft.preparedJson),
        preparedJson: undefined,
      },
    }, 200);
  }

  // Load commits
  const sourceCommit = await findCommitV4ByHash(db, source_hash);
  if (!sourceCommit) {
    return c.json({
      success: false as const,
      error: { code: 'NOT_FOUND', message: `Source commit not found: ${source_hash}` },
    }, 404);
  }

  const targetCommit = await findCommitV4ByHash(db, target_hash);
  if (!targetCommit) {
    return c.json({
      success: false as const,
      error: { code: 'NOT_FOUND', message: `Target commit not found: ${target_hash}` },
    }, 404);
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

  return c.json({
    success: true as const,
    data: {
      ...draft,
      prepared: JSON.parse(draft.preparedJson),
      preparedJson: undefined,
    },
  }, 201);
});

// GET /v1/merge/drafts/:id - Get a merge draft
const getDraftRoute = createRoute({
  method: 'get',
  path: '/v1/merge/drafts/{id}',
  tags: ['Merge'],
  summary: 'Get a merge draft by ID',
  request: {
    params: DraftIdParamSchema,
  },
  responses: {
    200: {
      description: 'Draft found',
      content: { 'application/json': { schema: z.any() } },
    },
    404: {
      description: 'Draft not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

mergeRoutes.openapi(getDraftRoute, async (c) => {
  const { id } = c.req.valid('param');
  const db = await getDB();

  const draft = await getMergeDraft(db, id);
  if (!draft) {
    return c.json({
      success: false as const,
      error: { code: 'NOT_FOUND', message: `Merge draft not found: ${id}` },
    }, 404);
  }

  return c.json({
    success: true as const,
    data: {
      ...draft,
      prepared: JSON.parse(draft.preparedJson),
      preparedJson: undefined,
    },
  }, 200);
});

// PATCH /v1/merge/drafts/:id - Update merge draft decisions
const updateDraftRoute = createRoute({
  method: 'patch',
  path: '/v1/merge/drafts/{id}',
  tags: ['Merge'],
  summary: 'Update merge draft decisions',
  description: 'Updates the draft with new user decisions (for auto-save).',
  request: {
    params: DraftIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: UpdateDraftRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Draft updated',
      content: { 'application/json': { schema: z.any() } },
    },
    400: {
      description: 'Invalid status',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Draft not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

mergeRoutes.openapi(updateDraftRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { prepared, message } = c.req.valid('json');
  const db = await getDB();

  const draft = await getMergeDraft(db, id);
  if (!draft) {
    return c.json({
      success: false as const,
      error: { code: 'NOT_FOUND', message: `Merge draft not found: ${id}` },
    }, 404);
  }

  if (draft.status !== 'pending') {
    return c.json({
      success: false as const,
      error: { code: 'INVALID_STATUS', message: `Cannot update draft with status: ${draft.status}` },
    }, 400);
  }

  const updated = await updateMergeDraft(db, id, { prepared, message });
  if (!updated) {
    return c.json({
      success: false as const,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update merge draft' },
    }, 500);
  }

  return c.json({
    success: true as const,
    data: {
      ...updated,
      prepared: JSON.parse(updated.preparedJson),
      preparedJson: undefined,
    },
  }, 200);
});

// POST /v1/merge/drafts/:id/commit - Commit a merge draft
const commitDraftRoute = createRoute({
  method: 'post',
  path: '/v1/merge/drafts/{id}/commit',
  tags: ['Merge'],
  summary: 'Commit a merge draft',
  description: 'Finalizes the merge by creating a CommitV3.',
  request: {
    params: DraftIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: CommitDraftRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Merge committed',
      content: { 'application/json': { schema: z.any() } },
    },
    400: {
      description: 'Invalid status or unresolved pairs',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Draft not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

mergeRoutes.openapi(commitDraftRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { message, branch } = c.req.valid('json');
  const db = await getDB();

  const draft = await getMergeDraft(db, id);
  if (!draft) {
    return c.json({
      success: false as const,
      error: { code: 'NOT_FOUND', message: `Merge draft not found: ${id}` },
    }, 404);
  }

  if (draft.status !== 'pending') {
    return c.json({
      success: false as const,
      error: { code: 'INVALID_STATUS', message: `Cannot commit draft with status: ${draft.status}` },
    }, 400);
  }

  const prepared = JSON.parse(draft.preparedJson) as Merge2WayResult;

  // Validate all similar pairs are resolved
  const unresolved = prepared.similarPairs.filter(p => !p.resolution);
  if (unresolved.length > 0) {
    return c.json({
      success: false as const,
      error: { code: 'UNRESOLVED_PAIRS', message: `${unresolved.length} similar pair(s) have no resolution` },
    }, 400);
  }

  const authorV3 = getAuthorFromContext(c);
  const author = { type: 'human' as const, name: authorV3.name, id: authorV3.identity };

  try {
    // Execute merge - V4 requires projectId
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

    // Save as V4 commit directly (source_ref preserved)
    await createCommitV4(db, {
      hash: mergeCommit.hash,
      parents: mergeCommit.parents,
      author: mergeCommit.author,
      committedAt: new Date(mergeCommit.committed_at),
      content: mergeCommit.content,
      projectId: draft.projectId,
      message: mergeCommit.message,
      branch: mergeCommit.branch,
    });

    // Update branch head
    await updateBranchHead(db, draft.projectId, targetBranch, mergeCommit.hash);

    // Mark draft as committed
    await commitMergeDraft(db, id);

    return c.json({ success: true as const, data: mergeCommit }, 200);
  } catch (error) {
    return c.json({
      success: false as const,
      error: { code: 'MERGE_FAILED', message: error instanceof Error ? error.message : 'Unknown error' },
    }, 500);
  }
});

// DELETE /v1/merge/drafts/:id - Delete a merge draft
const deleteDraftRoute = createRoute({
  method: 'delete',
  path: '/v1/merge/drafts/{id}',
  tags: ['Merge'],
  summary: 'Delete a merge draft',
  request: {
    params: DraftIdParamSchema,
  },
  responses: {
    200: {
      description: 'Draft deleted',
      content: { 'application/json': { schema: z.any() } },
    },
    404: {
      description: 'Draft not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

mergeRoutes.openapi(deleteDraftRoute, async (c) => {
  const { id } = c.req.valid('param');
  const db = await getDB();

  const draft = await getMergeDraft(db, id);
  if (!draft) {
    return c.json({
      success: false as const,
      error: { code: 'NOT_FOUND', message: `Merge draft not found: ${id}` },
    }, 404);
  }

  const deleted = await deleteMergeDraft(db, id);
  if (!deleted) {
    return c.json({
      success: false as const,
      error: { code: 'DELETE_FAILED', message: 'Failed to delete merge draft' },
    }, 500);
  }

  return c.json({ success: true as const, data: { deleted: true } }, 200);
});
