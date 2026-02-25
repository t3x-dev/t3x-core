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
import type { CreateCommitV4Input, MergeSummaryData } from '@t3x/core';
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
import { getAuthorFromContext } from '../lib/auth';
import { getDB } from '../lib/db';
import { computeMergeChecks } from '../lib/merge-checks';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';
import {
  ExecuteMergeRequestSchema,
  ExecuteMergeResponseSchema,
  PrepareMergeRequestSchema,
  PrepareMergeResponseSchema,
} from '../schemas/merge';

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

  // Load V4 commits
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

  // Prepare merge using V4 sentences (DiffableSentence[])
  const prepared = prepareMerge(sourceCommit.content.sentences, targetCommit.content.sentences);

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

  try {
    // Get project_id from source commit for executeMerge
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

    const projectId = sourceCommit.project_id || '';

    // Execute merge - returns CommitV4
    const mergeCommit = executeMerge(
      prepared as Merge2WayResult,
      source_hash,
      target_hash,
      author,
      message,
      projectId
    );

    // Set branch if provided
    if (branch) {
      mergeCommit.branch = branch;
    }

    // Compute merge summary from prepared data
    const keptFromSource = prepared.onlyInSource.filter((c: { keep: boolean }) => c.keep).length;
    const keptFromTarget = prepared.onlyInTarget.filter((c: { keep: boolean }) => c.keep).length;
    const discardedSource = prepared.onlyInSource.filter((c: { keep: boolean }) => !c.keep).length;
    const discardedTarget = prepared.onlyInTarget.filter((c: { keep: boolean }) => !c.keep).length;
    const mergeSummary: MergeSummaryData = {
      kept_identical: prepared.identical.length,
      resolved_conflicts: prepared.similarPairs.filter((p: { resolution?: string }) => p.resolution)
        .length,
      kept_from_source: keptFromSource,
      kept_from_target: keptFromTarget,
      discarded: discardedSource + discardedTarget,
      total_sentences: mergeCommit.content.sentences.length,
    };

    // Convert to CreateCommitV4Input format
    const commitInput: CreateCommitV4Input = {
      parents: mergeCommit.parents,
      author: mergeCommit.author,
      sentences: mergeCommit.content.sentences,
      project_id: projectId,
      message: mergeCommit.message,
      branch: mergeCommit.branch,
      merge_summary: mergeSummary,
    };

    // Save to storage as V4 commit
    await createCommitV4(db, commitInput, { strictParents: false });

    // Update branch head if branch specified
    if (branch && projectId) {
      await updateBranchHead(db, projectId, branch, mergeCommit.hash);
    }

    return c.json(
      { success: true as const, data: { ...mergeCommit, merge_summary: mergeSummary } },
      200
    );
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
  description:
    'Creates a merge draft for the workspace. If a pending draft already exists for the same source/target, returns that instead.',
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
  const { project_id, source_hash, target_hash, source_branch, target_branch } =
    c.req.valid('json');
  const db = await getDB();

  // Check if pending draft already exists
  const existingDraft = await findPendingMergeDraft(db, project_id, source_hash, target_hash);
  if (existingDraft) {
    return c.json(
      {
        success: true as const,
        data: {
          ...existingDraft,
          prepared: JSON.parse(existingDraft.preparedJson),
          preparedJson: undefined,
        },
      },
      200
    );
  }

  // Load V4 commits
  const sourceCommit = await findCommitV4ByHash(db, source_hash);
  if (!sourceCommit) {
    return c.json(
      {
        success: false as const,
        error: { code: 'NOT_FOUND', message: `Source commit not found: ${source_hash}` },
      },
      404
    );
  }

  const targetCommit = await findCommitV4ByHash(db, target_hash);
  if (!targetCommit) {
    return c.json(
      {
        success: false as const,
        error: { code: 'NOT_FOUND', message: `Target commit not found: ${target_hash}` },
      },
      404
    );
  }

  // Prepare merge using V4 sentences
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

  return c.json(
    {
      success: true as const,
      data: {
        ...draft,
        prepared: JSON.parse(draft.preparedJson),
        preparedJson: undefined,
      },
    },
    201
  );
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
    return c.json(
      {
        success: false as const,
        error: { code: 'NOT_FOUND', message: `Merge draft not found: ${id}` },
      },
      404
    );
  }

  return c.json(
    {
      success: true as const,
      data: {
        ...draft,
        prepared: JSON.parse(draft.preparedJson),
        preparedJson: undefined,
      },
    },
    200
  );
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
    return c.json(
      {
        success: false as const,
        error: { code: 'NOT_FOUND', message: `Merge draft not found: ${id}` },
      },
      404
    );
  }

  if (draft.status !== 'pending') {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'INVALID_STATUS',
          message: `Cannot update draft with status: ${draft.status}`,
        },
      },
      400
    );
  }

  const updated = await updateMergeDraft(db, id, { prepared, message });
  if (!updated) {
    return c.json(
      {
        success: false as const,
        error: { code: 'UPDATE_FAILED', message: 'Failed to update merge draft' },
      },
      500
    );
  }

  return c.json(
    {
      success: true as const,
      data: {
        ...updated,
        prepared: JSON.parse(updated.preparedJson),
        preparedJson: undefined,
      },
    },
    200
  );
});

// POST /v1/merge/drafts/:id/commit - Commit a merge draft
const commitDraftRoute = createRoute({
  method: 'post',
  path: '/v1/merge/drafts/{id}/commit',
  tags: ['Merge'],
  summary: 'Commit a merge draft',
  description: 'Finalizes the merge by creating a CommitV4.',
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
    return c.json(
      {
        success: false as const,
        error: { code: 'NOT_FOUND', message: `Merge draft not found: ${id}` },
      },
      404
    );
  }

  if (draft.status !== 'pending') {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'INVALID_STATUS',
          message: `Cannot commit draft with status: ${draft.status}`,
        },
      },
      400
    );
  }

  const prepared = JSON.parse(draft.preparedJson) as Merge2WayResult;

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

  const author = getAuthorFromContext(c);

  try {
    // Execute merge - returns CommitV4
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

    // Compute merge summary from prepared data
    const draftKeptSource = prepared.onlyInSource.filter((c: { keep: boolean }) => c.keep).length;
    const draftKeptTarget = prepared.onlyInTarget.filter((c: { keep: boolean }) => c.keep).length;
    const draftDiscardedSource = prepared.onlyInSource.filter(
      (c: { keep: boolean }) => !c.keep
    ).length;
    const draftDiscardedTarget = prepared.onlyInTarget.filter(
      (c: { keep: boolean }) => !c.keep
    ).length;
    const draftMergeSummary: MergeSummaryData = {
      kept_identical: prepared.identical.length,
      resolved_conflicts: prepared.similarPairs.filter((p: { resolution?: string }) => p.resolution)
        .length,
      kept_from_source: draftKeptSource,
      kept_from_target: draftKeptTarget,
      discarded: draftDiscardedSource + draftDiscardedTarget,
      total_sentences: mergeCommit.content.sentences.length,
    };

    // Convert to CreateCommitV4Input format
    const commitInput: CreateCommitV4Input = {
      parents: mergeCommit.parents,
      author: mergeCommit.author,
      sentences: mergeCommit.content.sentences,
      project_id: draft.projectId,
      message: mergeCommit.message,
      branch: mergeCommit.branch,
      merge_summary: draftMergeSummary,
    };

    // Save to storage as V4 commit
    await createCommitV4(db, commitInput, { strictParents: false });

    // Update branch head
    await updateBranchHead(db, draft.projectId, targetBranch, mergeCommit.hash);

    // Mark draft as committed
    await commitMergeDraft(db, id);

    return c.json(
      { success: true as const, data: { ...mergeCommit, merge_summary: draftMergeSummary } },
      200
    );
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
    return c.json(
      {
        success: false as const,
        error: { code: 'NOT_FOUND', message: `Merge draft not found: ${id}` },
      },
      404
    );
  }

  const deleted = await deleteMergeDraft(db, id);
  if (!deleted) {
    return c.json(
      {
        success: false as const,
        error: { code: 'DELETE_FAILED', message: 'Failed to delete merge draft' },
      },
      500
    );
  }

  return c.json({ success: true as const, data: { deleted: true } }, 200);
});

// ============================================================================
// GET /v1/merge/drafts/:id/checks - Get merge validation checks
// ============================================================================

const MergeCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  passed: z.boolean(),
  detail: z.string().optional(),
});

const getDraftChecksRoute = createRoute({
  method: 'get',
  path: '/v1/merge/drafts/{id}/checks',
  tags: ['Merge'],
  summary: 'Get merge validation checks for a draft',
  description: `
Returns server-side validation checks for a merge draft:
- **constraints_satisfied**: Whether merged text satisfies all Leaf constraints
- **evidence_chain_complete**: Whether all sentences have source references
- **eval_passed**: (Optional) Latest evaluation run status for associated Leaves
  `.trim(),
  request: {
    params: DraftIdParamSchema,
  },
  responses: {
    200: {
      description: 'Merge checks computed',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(MergeCheckSchema)),
        },
      },
    },
    404: {
      description: 'Draft not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

mergeRoutes.openapi(getDraftChecksRoute, async (c) => {
  const { id } = c.req.valid('param');
  const db = await getDB();

  const draft = await getMergeDraft(db, id);
  if (!draft) {
    return c.json(
      {
        success: false as const,
        error: { code: 'NOT_FOUND', message: `Merge draft not found: ${id}` },
      },
      404
    );
  }

  const checks = await computeMergeChecks(db, draft);
  return c.json({ success: true as const, data: checks }, 200);
});
