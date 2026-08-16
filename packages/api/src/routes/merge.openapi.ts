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

/** biome-ignore-all lint/suspicious/noExplicitAny: merge route adapts dynamic draft payloads pending stricter merge DTOs */
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { collectResult, type MergeDecision, type MergeResult, runOperation } from '@t3x-dev/core';
import {
  commitMergeDraft,
  createMergeDraft,
  deleteMergeDraft,
  findPendingMergeDraft,
  getMergeDraft,
  TransitionHeadConflictError,
  updateMergeDraft,
} from '@t3x-dev/storage';
import { getAuthorFromContext } from '../lib/auth';
import { getDB } from '../lib/db';
import { errorResponse } from '../lib/errors';
import { computeMergeChecks } from '../lib/merge-checks';
import { readMergeDraftDecision } from '../lib/merge-draft-decisions';
import { assertProjectAccess } from '../lib/project-access';
import { getLLMProvider } from '../lib/provider-registry';
import {
  commitRepositoryYOpsMerge,
  prepareRepositoryYOpsMerge,
  RepositoryMergeCommitNotFoundError,
  RepositoryMergeInvalidError,
} from '../lib/repository-state-transition';
import { getUserId, recordUsageFireAndForget, wrapWithUsageTracking } from '../lib/usage-tracking';
import { webhookDispatcher } from '../lib/webhook-dispatcher';
import { buildPipelineContext } from '../ops/context';
import { MergeError, mergeExecuteOp, mergePrepareOp } from '../ops/merge';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';
import {
  ExecuteMergeRequestSchema,
  ExecuteMergeResponseSchema,
  FrameMergeDecisionSchema,
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
Analyzes two commits and returns a frame-level merge preparation result.

This endpoint performs a frame merge analysis and returns:
- **autoKept**: Frames identical in both commits (auto-kept)
- **conflicts**: Frames modified differently in source and target (require user resolution)
- **onlyInSource**: Frames only present in the source commit
- **onlyInTarget**: Frames only present in the target commit
- **relationsOnlyInSource/relationsOnlyInTarget/relationsInBoth**: Relation partitions

The client must resolve all conflicts and decide which onlyInSource/onlyInTarget frames to keep before calling /execute.
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
    400: {
      description: 'Source and target commits must belong to the same project',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Source or target commit not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    403: {
      description: 'Project access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
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

// @ts-expect-error - OpenAPI handler return type
mergeRoutes.openapi(prepareMergeRoute, async (c) => {
  const { project_id, source_hash, target_hash } = c.req.valid('json');

  try {
    const db = await getDB();
    const accessResult = await assertProjectAccess(c, db, project_id);
    if (accessResult instanceof Response) return accessResult;

    const ctx = await buildPipelineContext(c, project_id);
    const { prepared } = await collectResult(
      runOperation(mergePrepareOp, { project_id, source_hash, target_hash }, ctx)
    );

    return c.json({ success: true as const, data: prepared }, 200);
  } catch (error) {
    if (error instanceof MergeError && error.code === 'NOT_FOUND') {
      return c.json(
        { success: false as const, error: { code: 'NOT_FOUND', message: error.message } },
        404
      );
    }
    if (error instanceof MergeError && error.code === 'INVALID_REQUEST') {
      return c.json(
        { success: false as const, error: { code: error.code, message: error.message } },
        400
      );
    }
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
Executes a frame merge after the user has made all resolution decisions.

**Requirements:**
- \`prepared\`: The MergeResult from the prepare step
- \`decisions\`: MergeDecision with conflict resolutions and keep lists

**Result:**
- Creates a new merge commit with 2 parents: [target_hash, source_hash]
- Merged content is SemanticContent (frames + relations)
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
    404: {
      description: 'Source or target commit not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Merge commit does not extend the target branch head',
      content: { 'application/json': { schema: ErrorResponseSchema } },
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

// @ts-expect-error - OpenAPI handler return type
mergeRoutes.openapi(executeMergeRoute, async (c) => {
  const { project_id, source_hash, target_hash, prepared, decisions, message, branch } =
    c.req.valid('json');

  const author = await getAuthorFromContext(c);

  try {
    const db = await getDB();
    const accessResult = await assertProjectAccess(c, db, project_id);
    if (accessResult instanceof Response) return accessResult;
    const ctx = await buildPipelineContext(c, project_id);
    const { commit: savedCommit, merge_summary: mergeSummary } = await collectResult(
      runOperation(
        mergeExecuteOp,
        {
          project_id,
          source_hash,
          target_hash,
          prepared: prepared as unknown as MergeResult,
          decisions: decisions as unknown as MergeDecision,
          message,
          branch,
          author,
        },
        ctx
      )
    );

    const projectId = savedCommit.project_id;

    // Fire webhook event (fire-and-forget)
    webhookDispatcher.dispatch(
      'merge.completed',
      {
        commit_hash: savedCommit.hash,
        project_id: projectId,
        source_hash,
        target_hash,
        branch: savedCommit.branch,
      },
      projectId
    );

    // Push notification (fire-and-forget)
    pushNotification({
      type: 'merge.completed',
      title: 'Merge Completed',
      message: `Merge completed on ${savedCommit.branch}`,
      project_id: projectId,
      ref_id: savedCommit.hash,
    });

    return c.json(
      {
        success: true as const,
        data: {
          schema: savedCommit.schema,
          hash: savedCommit.hash,
          parents: savedCommit.parents,
          author,
          committed_at: savedCommit.committed_at,
          content: savedCommit.content,
          message,
          branch: savedCommit.branch,
          merge_summary: mergeSummary,
        },
      },
      201
    );
  } catch (error) {
    if (error instanceof TransitionHeadConflictError) {
      return errorResponse(c, 'CONFLICT', error.message);
    }
    if (
      error instanceof Error &&
      'code' in error &&
      (error as { code?: unknown }).code === 'UNSUPPORTED_SEMANTICS'
    ) {
      return errorResponse(c, 'INVALID_REQUEST', error.message);
    }
    if (error instanceof MergeError) {
      if (error.code === 'UNRESOLVED_CONFLICTS') {
        return c.json(
          { success: false as const, error: { code: error.code, message: error.message } },
          400
        );
      }
      if (error.code === 'NOT_FOUND') {
        return c.json(
          { success: false as const, error: { code: error.code, message: error.message } },
          404
        );
      }
      if (error.code === 'INVALID_REQUEST') {
        return c.json(
          { success: false as const, error: { code: error.code, message: error.message } },
          400
        );
      }
    }
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
  source_branch: z.string().trim().min(1).optional(),
  target_branch: z.string().trim().min(1),
});

const UpdateDraftRequestSchema = z
  .object({
    prepared: z.any().optional(),
    decisions: FrameMergeDecisionSchema.optional(),
    expected_decision_revision: z.number().int().min(0).optional(),
    message: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.decisions !== undefined && value.expected_decision_revision === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expected_decision_revision'],
        message: 'A decision update requires its expected revision',
      });
    }
  });

const CommitDraftRequestSchema = z.object({
  message: z.string().min(1),
  branch: z.string().trim().min(1).optional(),
  decisions: FrameMergeDecisionSchema.optional(),
});

const DraftIdParamSchema = z.object({
  id: z.string().min(1),
});

function serializeMergeDraft(draft: Awaited<ReturnType<typeof getMergeDraft>> & object) {
  if (!draft) return draft;
  return {
    ...draft,
    prepared: JSON.parse(draft.preparedJson),
    decisions: readMergeDraftDecision(draft) ?? undefined,
    preparedJson: undefined,
    decisionJson: undefined,
  };
}

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
    400: {
      description: 'Source and target commits must belong to the requested project',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Source commit, target commit, or project not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

mergeRoutes.openapi(createDraftRoute, async (c) => {
  const { project_id, source_hash, target_hash, source_branch, target_branch } =
    c.req.valid('json');
  const db = await getDB();
  const accessResult = await assertProjectAccess(c, db, project_id);
  if (accessResult instanceof Response) return accessResult;

  const effectiveSourceBranch = source_branch;
  const effectiveTargetBranch = target_branch;
  const existingDraft = await findPendingMergeDraft(
    db,
    project_id,
    source_hash,
    target_hash,
    effectiveSourceBranch,
    effectiveTargetBranch
  );
  if (existingDraft) {
    return c.json(
      {
        success: true as const,
        data: serializeMergeDraft(existingDraft),
      },
      200
    );
  }

  let prepared: MergeResult;
  try {
    prepared = await prepareRepositoryYOpsMerge({
      db,
      projectId: project_id,
      sourceDigest: source_hash,
      targetDigest: target_hash,
    });
  } catch (error) {
    if (error instanceof RepositoryMergeCommitNotFoundError) {
      return errorResponse(c, 'NOT_FOUND', error.message);
    }
    if (error instanceof RepositoryMergeInvalidError) {
      return errorResponse(c, 'INVALID_REQUEST', error.message);
    }
    throw error;
  }

  // Create draft
  const draft = await createMergeDraft(db, {
    projectId: project_id,
    sourceHash: source_hash,
    targetHash: target_hash,
    sourceBranch: effectiveSourceBranch,
    targetBranch: effectiveTargetBranch,
    prepared,
  });

  return c.json(
    {
      success: true as const,
      data: serializeMergeDraft(draft),
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
      data: serializeMergeDraft(draft),
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
    409: {
      description: 'Decision revision conflict',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// @ts-expect-error - OpenAPI handler return type
mergeRoutes.openapi(updateDraftRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { prepared, decisions, expected_decision_revision, message } = c.req.valid('json');
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

  const updated = await updateMergeDraft(db, id, {
    prepared,
    decision: decisions,
    expectedDecisionRevision: expected_decision_revision,
    message,
  });
  if (!updated) {
    if (decisions !== undefined) {
      return c.json(
        {
          success: false as const,
          error: {
            code: 'DECISION_REVISION_CONFLICT',
            message: 'The merge decisions changed elsewhere. Reload the draft before saving.',
          },
        },
        409
      );
    }
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
      data: serializeMergeDraft(updated),
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
  description: 'Finalizes the merge by creating a commit with the resolved content.',
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
      description: 'Draft, source commit, target commit, or target branch not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Target commit is no longer the target branch head',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// @ts-expect-error - OpenAPI handler return type
mergeRoutes.openapi(commitDraftRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { message, branch, decisions: decisionsInput } = c.req.valid('json');
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

  const accessResult = await assertProjectAccess(c, db, draft.projectId);
  if (accessResult instanceof Response) return accessResult;
  const targetBranch = draft.targetBranch;
  if (targetBranch === null) {
    return errorResponse(c, 'INVALID_REQUEST', 'Merge draft has no explicit target ref');
  }
  if (branch !== undefined && branch !== targetBranch) {
    return errorResponse(
      c,
      'INVALID_REQUEST',
      `Commit branch ${branch} does not match merge target branch ${targetBranch}`
    );
  }

  const prepared = JSON.parse(draft.preparedJson) as MergeResult;

  const author = await getAuthorFromContext(c);

  // Explicit commit input wins, then the durable draft decision. The final
  // fallback preserves behavior for undecided, conflict-free legacy drafts.
  const mergeDecisions: MergeDecision = decisionsInput ??
    readMergeDraftDecision(draft) ?? {
      conflictResolutions: {},
      keepFromSource: prepared.onlyInSource,
      keepFromTarget: prepared.onlyInTarget,
      keepRelationsFromSource: true,
      keepRelationsFromTarget: true,
    };

  // Validate all conflicts have resolutions
  const unresolvedConflicts = prepared.conflicts.filter(
    (conf: any) => !mergeDecisions.conflictResolutions[conf.path ?? conf.frameId]
  );
  if (unresolvedConflicts.length > 0) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'UNRESOLVED_CONFLICTS',
          message: `${unresolvedConflicts.length} conflict(s) have no resolution`,
        },
      },
      400
    );
  }

  try {
    const actorKind = author.type === 'system' ? ('service' as const) : author.type;
    let merged!: Awaited<ReturnType<typeof commitRepositoryYOpsMerge>>;
    await (db as any).transaction(async (tx: typeof db) => {
      // The exact execution decision is part of the durable draft record, even
      // when the caller commits before the autosave debounce has completed.
      const persistedDecision = await updateMergeDraft(tx, id, { decision: mergeDecisions });
      if (!persistedDecision) throw new Error('Merge draft disappeared before commit');
      merged = await commitRepositoryYOpsMerge({
        db: tx,
        projectId: draft.projectId,
        refName: targetBranch,
        sourceDigest: draft.sourceHash,
        targetDigest: draft.targetHash,
        decisions: mergeDecisions,
        actor: {
          kind: actorKind,
          id: author.id ?? `${actorKind}:merge:${author.name?.trim() || 'anonymous'}`,
        },
        message,
      });
      await commitMergeDraft(tx, id);
    });

    webhookDispatcher.dispatch(
      'merge.completed',
      {
        commit_hash: merged.commitDigest,
        project_id: draft.projectId,
        branch: targetBranch,
        source_hash: draft.sourceHash,
        target_hash: draft.targetHash,
        frame_count: merged.mergeSummary.total_nodes,
      },
      draft.projectId
    );
    pushNotification({
      type: 'merge.completed',
      title: 'Merge Completed',
      message: `Merged into ${targetBranch} with ${merged.mergeSummary.total_nodes} frame${merged.mergeSummary.total_nodes === 1 ? '' : 's'}`,
      project_id: draft.projectId,
      ref_id: merged.commitDigest,
    });

    return c.json(
      {
        success: true as const,
        data: {
          schema: merged.commit.schema,
          hash: merged.commitDigest,
          parents: merged.commit.parents.map((parent) => parent.digest),
          author,
          committed_at: merged.recordedAt,
          content: merged.content,
          message,
          branch: targetBranch,
          merge_summary: merged.mergeSummary,
        },
      },
      201
    );
  } catch (error) {
    if (error instanceof TransitionHeadConflictError) {
      return errorResponse(c, 'CONFLICT', error.message);
    }
    if (error instanceof RepositoryMergeCommitNotFoundError) {
      return errorResponse(c, 'NOT_FOUND', error.message);
    }
    if (error instanceof RepositoryMergeInvalidError) {
      return errorResponse(c, 'INVALID_REQUEST', error.message);
    }
    if (
      error instanceof Error &&
      'code' in error &&
      (error as { code?: unknown }).code === 'UNSUPPORTED_SEMANTICS'
    ) {
      return errorResponse(c, 'INVALID_REQUEST', error.message);
    }
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

// @ts-expect-error - OpenAPI handler return type
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
- **evidence_chain_complete**: Whether all nodes have source references
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

  const prepared: MergeResult = JSON.parse(draft.preparedJson);
  if (idx < 0 || idx >= prepared.conflicts.length) {
    return c.json(
      {
        success: false as const,
        error: { code: 'NOT_FOUND', message: `Conflict index out of range: ${idx}` },
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

  // suggestFrameMerge removed in tree-primary refactor — merge uses direct tree comparison
  const _conflict = prepared.conflicts[idx];
  const { provider: trackedLlm, usage } = wrapWithUsageTracking(llm);
  const suggestion = null;

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
  const _body = c.req.valid('json');

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

  // suggestFrameMerge removed in tree-primary refactor — merge uses direct tree comparison
  const { provider: trackedLlm, usage } = wrapWithUsageTracking(llm);
  const suggestion = null;

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
