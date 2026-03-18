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
import type { MergeSummaryData, SlotValue } from '@t3x-dev/core';
import {
  executeMerge,
  type FrameMergeInput,
  framesToTextSegments,
  type Merge2WayResult,
  prepareMerge,
  suggestFrameMerge,
  suggestMerge,
} from '@t3x-dev/core';
import {
  commitMergeDraft,
  createCommit,
  createMergeDraft,
  deleteMergeDraft,
  findPendingMergeDraft,
  getCommitUnified,
  getMergeDraft,
  updateBranchHead,
  updateMergeDraft,
} from '@t3x-dev/storage';
import { getV4AuthorFromContext } from '../lib/auth';
import { getDB } from '../lib/db';
import { computeMergeChecks } from '../lib/merge-checks';
import { getLLMProvider } from '../lib/provider-registry';
import { getUserId, recordUsageFireAndForget, wrapWithUsageTracking } from '../lib/usage-tracking';
import { webhookDispatcher } from '../lib/webhook-dispatcher';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';
import {
  ExecuteMergeRequestSchema,
  ExecuteMergeResponseSchema,
  PrepareMergeRequestSchema,
  PrepareMergeResponseSchema,
} from '../schemas/merge';
import { pushNotification } from './notifications.openapi';

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

  try {
    const db = await getDB();

    // Load commits (V5 unified, auto-upgrades V4)
    const sourceCommit = await getCommitUnified(db, source_hash);
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

    const targetCommit = await getCommitUnified(db, target_hash);
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

    // Prepare merge using text segments extracted from frames
    const prepared = prepareMerge(
      framesToTextSegments(sourceCommit.content),
      framesToTextSegments(targetCommit.content)
    );

    return c.json({ success: true as const, data: prepared }, 200);
  } catch (error) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'Unexpected error during merge preparation',
        },
      },
      500
    );
  }
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
    201: {
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

  // Validate that all onlyInSource and onlyInTarget items have keep explicitly set
  const undefinedKeepSource = prepared.onlyInSource.filter(
    (item: { keep?: boolean }) => item.keep === undefined || item.keep === null
  );
  const undefinedKeepTarget = prepared.onlyInTarget.filter(
    (item: { keep?: boolean }) => item.keep === undefined || item.keep === null
  );
  if (undefinedKeepSource.length > 0 || undefinedKeepTarget.length > 0) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'INVALID_REQUEST',
          message: `All onlyInSource and onlyInTarget items must have 'keep' explicitly set to true or false. Missing: ${undefinedKeepSource.length} source item(s), ${undefinedKeepTarget.length} target item(s)`,
        },
      },
      400
    );
  }

  // Get author from context
  const author = await getV4AuthorFromContext(c);
  const db = await getDB();

  try {
    // Get project_id from source commit for executeMerge
    const sourceCommit = await getCommitUnified(db, source_hash);
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

    if (!sourceCommit.project_id) {
      return c.json(
        {
          success: false as const,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Source commit has no project_id',
          },
        },
        400
      );
    }
    const projectId = sourceCommit.project_id;

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

    // Convert sentences to V5 legacy_sentence frames
    const frames = mergeCommit.content.sentences.map((s, i) => ({
      id: s.id || `f_${String(i + 1).padStart(3, '0')}`,
      type: 'legacy_sentence' as const,
      slots: { text: s.text },
      confidence: s.confidence,
    }));

    // Save to storage as V5 commit
    await createCommit(db, {
      parents: mergeCommit.parents,
      author: {
        type: mergeCommit.author.type as 'human' | 'agent' | 'system',
        name: mergeCommit.author.name,
        id: mergeCommit.author.id,
      },
      content: { frames, relations: [] },
      project_id: projectId,
      message: mergeCommit.message,
      branch: mergeCommit.branch,
      provenance: { method: 'merge' },
    });

    // Update branch head if branch specified
    if (branch && projectId) {
      await updateBranchHead(db, projectId, branch, mergeCommit.hash);
    }

    // Fire webhook event (fire-and-forget)
    webhookDispatcher.dispatch(
      'merge.completed',
      {
        commit_hash: mergeCommit.hash,
        project_id: projectId,
        source_hash,
        target_hash,
        branch: branch || null,
      },
      projectId
    );

    // Push notification (fire-and-forget)
    pushNotification({
      type: 'merge.completed',
      title: 'Merge Completed',
      message: `Merge completed on ${branch || 'main'}`,
      project_id: projectId,
      ref_id: mergeCommit.hash,
    });

    return c.json(
      { success: true as const, data: { ...mergeCommit, merge_summary: mergeSummary } },
      201
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

  // Load commits (V5 unified, auto-upgrades V4)
  const sourceCommit = await getCommitUnified(db, source_hash);
  if (!sourceCommit) {
    return c.json(
      {
        success: false as const,
        error: { code: 'NOT_FOUND', message: `Source commit not found: ${source_hash}` },
      },
      404
    );
  }

  const targetCommit = await getCommitUnified(db, target_hash);
  if (!targetCommit) {
    return c.json(
      {
        success: false as const,
        error: { code: 'NOT_FOUND', message: `Target commit not found: ${target_hash}` },
      },
      404
    );
  }

  // Prepare merge using text segments extracted from frames
  const prepared = prepareMerge(
    framesToTextSegments(sourceCommit.content),
    framesToTextSegments(targetCommit.content)
  );

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
    201: {
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

  const author = await getV4AuthorFromContext(c);

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

    // Convert sentences to V5 legacy_sentence frames
    const draftFrames = mergeCommit.content.sentences.map((s, i) => ({
      id: s.id || `f_${String(i + 1).padStart(3, '0')}`,
      type: 'legacy_sentence' as const,
      slots: { text: s.text },
      confidence: s.confidence,
    }));

    // Save commit + update branch head + mark draft committed atomically
    // biome-ignore lint/suspicious/noExplicitAny: AnyDB union doesn't expose .transaction() but all concrete types do
    await (db as any).transaction(async (tx: typeof db) => {
      await createCommit(tx, {
        parents: mergeCommit.parents,
        author: {
          type: mergeCommit.author.type as 'human' | 'agent' | 'system',
          name: mergeCommit.author.name,
          id: mergeCommit.author.id,
        },
        content: { frames: draftFrames, relations: [] },
        project_id: draft.projectId,
        message: mergeCommit.message,
        branch: mergeCommit.branch,
        provenance: { method: 'merge' },
      });
      await updateBranchHead(tx, draft.projectId, targetBranch, mergeCommit.hash);
      await commitMergeDraft(tx, id);
    });

    // Fire webhook + notification (fire-and-forget)
    webhookDispatcher.dispatch(
      'merge.completed',
      {
        commit_hash: mergeCommit.hash,
        project_id: draft.projectId,
        branch: targetBranch,
        source_hash: draft.sourceHash,
        target_hash: draft.targetHash,
        sentence_count: mergeCommit.content.sentences.length,
      },
      draft.projectId
    );
    pushNotification({
      type: 'merge.completed',
      title: 'Merge Completed',
      message: `Merged into ${targetBranch} with ${mergeCommit.content.sentences.length} sentence${mergeCommit.content.sentences.length === 1 ? '' : 's'}`,
      project_id: draft.projectId,
      ref_id: mergeCommit.hash,
    });

    return c.json(
      { success: true as const, data: { ...mergeCommit, merge_summary: draftMergeSummary } },
      201
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

// ============================================================================
// POST /v1/merge/drafts/:id/suggest/:pairIndex — AI merge suggestion
// ============================================================================

const MergeSuggestionSchema = z.object({
  suggestion: z.string(),
  reasoning: z.string(),
});

const suggestRoute = createRoute({
  method: 'post',
  path: '/v1/merge/drafts/{id}/suggest/{pairIndex}',
  tags: ['Merge'],
  summary: 'Get AI suggestion for a conflicting pair',
  description: 'Uses LLM to suggest merged text for a specific similar pair in a merge draft.',
  request: {
    params: z.object({
      id: z.string().openapi({ description: 'Merge draft ID' }),
      pairIndex: z.string().regex(/^\d+$/).openapi({ description: 'Index of the similar pair' }),
    }),
  },
  responses: {
    200: {
      description: 'Merge suggestion',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ suggestion: MergeSuggestionSchema.nullable() })),
        },
      },
    },
    404: {
      description: 'Draft or pair not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    503: {
      description: 'LLM not configured',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

mergeRoutes.openapi(suggestRoute, async (c) => {
  const { id, pairIndex } = c.req.valid('param');
  const idx = Number.parseInt(pairIndex, 10);

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

  const prepared: Merge2WayResult = JSON.parse(draft.preparedJson);
  if (idx < 0 || idx >= prepared.similarPairs.length) {
    return c.json(
      {
        success: false as const,
        error: { code: 'NOT_FOUND', message: `Pair index out of range: ${idx}` },
      },
      404
    );
  }

  const llm = await getLLMProvider();
  if (!llm) {
    return c.json(
      {
        success: false as const,
        error: { code: 'LLM_NOT_CONFIGURED', message: 'No LLM provider configured' },
      },
      503
    );
  }

  const { provider: trackedLlm, usage } = wrapWithUsageTracking(llm);
  const { suggestion } = await suggestMerge(prepared.similarPairs[idx], trackedLlm);

  // Record usage (fire-and-forget)
  if (usage.inputTokens || usage.outputTokens) {
    const db = await getDB();
    recordUsageFireAndForget(db, {
      user_id: getUserId(c) ?? undefined,
      project_id: draft.projectId,
      endpoint: 'merge_suggest',
      model: trackedLlm.id,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
    });
  }

  return c.json({ success: true as const, data: { suggestion } }, 200);
});

// ============================================================================
// POST /v1/merge/drafts/:id/suggest-frame/:frameId — AI frame merge suggestion
// ============================================================================

const FrameSlotSchema = z.record(z.string(), z.unknown());

const FrameMergeSuggestionSchema = z.object({
  slots: FrameSlotSchema,
  reasoning: z.string(),
});

const suggestFrameRoute = createRoute({
  method: 'post',
  path: '/v1/merge/drafts/{id}/suggest-frame/{frameId}',
  tags: ['Merge'],
  summary: 'Get AI suggestion for a conflicting frame',
  description:
    'Uses LLM to suggest merged slot values for a specific semantic frame conflict in a merge draft.',
  request: {
    params: z.object({
      id: z.string().openapi({ description: 'Merge draft ID' }),
      frameId: z.string().openapi({ description: 'Frame ID' }),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            source_frame: z.object({
              type: z.string(),
              slots: FrameSlotSchema,
            }),
            target_frame: z.object({
              type: z.string(),
              slots: FrameSlotSchema,
            }),
            context: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Frame merge suggestion',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({ suggestion: FrameMergeSuggestionSchema.nullable() })
          ),
        },
      },
    },
    404: {
      description: 'Merge draft not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    503: {
      description: 'LLM not configured',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

mergeRoutes.openapi(suggestFrameRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

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

  const llm = await getLLMProvider();
  if (!llm) {
    return c.json(
      {
        success: false as const,
        error: { code: 'LLM_NOT_CONFIGURED', message: 'No LLM provider configured' },
      },
      503
    );
  }

  const input: FrameMergeInput = {
    sourceFrame: {
      type: body.source_frame.type,
      slots: body.source_frame.slots as Record<string, SlotValue>,
    },
    targetFrame: {
      type: body.target_frame.type,
      slots: body.target_frame.slots as Record<string, SlotValue>,
    },
    context: body.context,
  };

  const { provider: trackedLlm, usage } = wrapWithUsageTracking(llm);
  const { suggestion } = await suggestFrameMerge(input, trackedLlm);

  // Record usage (fire-and-forget)
  if (usage.inputTokens || usage.outputTokens) {
    const db = await getDB();
    recordUsageFireAndForget(db, {
      user_id: getUserId(c) ?? undefined,
      project_id: draft.projectId,
      endpoint: 'merge_suggest_frame',
      model: trackedLlm.id,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
    });
  }

  return c.json({ success: true as const, data: { suggestion } }, 200);
});
