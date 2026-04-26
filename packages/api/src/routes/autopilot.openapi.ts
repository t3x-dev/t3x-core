/**
 * Autopilot Routes (OpenAPI)
 *
 * Knowledge autopilot configuration and auto-commit endpoints.
 *
 * GET  /v1/projects/:projectId/autopilot/config     - Get autopilot config
 * PUT  /v1/projects/:projectId/autopilot/config     - Update autopilot config
 * GET  /v1/projects/:projectId/autopilot/adaptive   - Get adaptive threshold suggestion
 * POST /v1/drafts/:draftId/auto-commit              - Evaluate and auto-commit a draft
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  computeAdaptiveConfig,
  DEFAULT_AUTOPILOT_CONFIG,
  evaluateAutoCommit,
  mergeAutopilotConfig,
} from '@t3x-dev/core';
import {
  commitDraft,
  createCommit,
  drafts,
  findDraftById,
  getAdaptiveFeedbackStats,
  getAutopilotConfig,
  updateAutopilotConfig,
} from '@t3x-dev/storage';
import { eq } from 'drizzle-orm';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { webhookDispatcher } from '../lib/webhook-dispatcher';
import { findUncommittedYOpsIds, mapSupersededError } from '../lib/yops-commit-link';
import { ErrorResponseSchema } from '../schemas/common';
import { pushNotification } from './notifications.openapi';

export const autopilotRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });

// ── Shared Schemas ──────────────────────────────────────────

const ProjectIdParam = z.object({
  projectId: z.string().openapi({ description: 'Project ID' }),
});

const DraftIdParam = z.object({
  draftId: z.string().openapi({ description: 'Draft ID' }),
});

const AutopilotConfigSchema = z.object({
  enabled: z.boolean(),
  min_nodes: z.number(),
  auto_create_leaf: z.boolean(),
  target_branch: z.string(),
});

// ── GET /v1/projects/:projectId/autopilot/config ────────────

const GetConfigResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    config: AutopilotConfigSchema,
  }),
});

const getConfigRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/autopilot/config',
  tags: ['Autopilot'],
  summary: 'Get autopilot configuration for a project',
  description:
    'Returns the current autopilot configuration. Falls back to defaults if not configured.',
  request: { params: ProjectIdParam },
  responses: {
    200: {
      description: 'Autopilot config',
      content: { 'application/json': { schema: GetConfigResponseSchema } },
    },
    500: {
      description: 'Internal error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

autopilotRoutes.openapi(getConfigRoute, async (c) => {
  const { projectId } = c.req.valid('param');

  try {
    const db = await getDB();
    const stored = await getAutopilotConfig(db, projectId);
    const config = stored ?? { ...DEFAULT_AUTOPILOT_CONFIG };

    return c.json({ success: true as const, data: { config } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
  }
});

// ── PUT /v1/projects/:projectId/autopilot/config ────────────

const UpdateConfigBodySchema = z.object({
  enabled: z.boolean().optional(),
  min_nodes: z.number().int().min(1).optional(),
  auto_create_leaf: z.boolean().optional(),
  target_branch: z.string().min(1).optional(),
});

const UpdateConfigResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    config: AutopilotConfigSchema,
  }),
});

const updateConfigRoute = createRoute({
  method: 'put',
  path: '/v1/projects/{projectId}/autopilot/config',
  tags: ['Autopilot'],
  summary: 'Update autopilot configuration',
  description:
    'Partially updates autopilot configuration. Missing fields are preserved from existing config.',
  request: {
    params: ProjectIdParam,
    body: {
      content: {
        'application/json': { schema: UpdateConfigBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Updated config',
      content: { 'application/json': { schema: UpdateConfigResponseSchema } },
    },
    400: {
      description: 'Invalid config',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Internal error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

autopilotRoutes.openapi(updateConfigRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();
    const config = await updateAutopilotConfig(db, projectId, body);

    return c.json({ success: true as const, data: { config } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'UPDATE_FAILED', message);
  }
});

// ── GET /v1/projects/:projectId/autopilot/adaptive ──────────

const AdaptiveResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    adaptive: z
      .object({
        suppressedTypes: z.array(z.string()),
        cosineThresholdDelta: z.number(),
      })
      .nullable(),
    message: z.string().optional(),
    stats: z
      .object({
        total: z.number(),
        accepted: z.number(),
        rejected: z.number(),
        edited: z.number(),
        accept_rate: z.number(),
      })
      .optional(),
  }),
});

const getAdaptiveRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/autopilot/adaptive',
  tags: ['Autopilot'],
  summary: 'Get adaptive threshold suggestion based on feedback',
  description:
    'Computes an adaptive configuration from extraction feedback statistics. ' +
    'Requires at least 10 feedback entries to provide a meaningful suggestion.',
  request: { params: ProjectIdParam },
  responses: {
    200: {
      description: 'Adaptive suggestion (or null if insufficient data)',
      content: { 'application/json': { schema: AdaptiveResponseSchema } },
    },
    500: {
      description: 'Internal error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

autopilotRoutes.openapi(getAdaptiveRoute, async (c) => {
  const { projectId } = c.req.valid('param');

  try {
    const db = await getDB();
    const stats = await getAdaptiveFeedbackStats(db, projectId);

    if (stats.overall.total < 10) {
      return c.json(
        {
          success: true as const,
          data: {
            adaptive: null,
            message: 'Insufficient feedback data',
          },
        },
        200
      );
    }

    const adaptive = computeAdaptiveConfig(stats);

    return c.json(
      {
        success: true as const,
        data: {
          adaptive,
          stats: {
            total: stats.overall.total,
            accepted: Math.round(stats.overall.acceptRate * stats.overall.total),
            rejected: Math.round(stats.overall.rejectRate * stats.overall.total),
            edited:
              stats.overall.total -
              Math.round(stats.overall.acceptRate * stats.overall.total) -
              Math.round(stats.overall.rejectRate * stats.overall.total),
            accept_rate: stats.overall.acceptRate,
          },
        },
      },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
  }
});

// ── POST /v1/drafts/:draftId/auto-commit ────────────────────

const AutoCommitResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    auto_committed: z.boolean(),
    reason: z.string().optional(),
    commit: z
      .object({
        hash: z.string(),
        branch: z.string().optional(),
        committed_at: z.string().optional(),
      })
      .optional(),
    nodes_committed: z.number().optional(),
    nodes_skipped: z.number().optional(),
    skipped: z
      .array(
        z.object({
          id: z.string(),
          reason: z.string(),
        })
      )
      .optional(),
  }),
});

const autoCommitRoute = createRoute({
  method: 'post',
  path: '/v1/drafts/{draftId}/auto-commit',
  tags: ['Autopilot'],
  summary: 'Evaluate and auto-commit a draft',
  description:
    'Evaluates a draft against autopilot rules. If all criteria are met, ' +
    'creates a commit automatically. Only works for LLM-mode drafts in editing status.',
  request: { params: DraftIdParam },
  responses: {
    200: {
      description: 'Auto-commit result (committed or skipped)',
      content: { 'application/json': { schema: AutoCommitResponseSchema } },
    },
    400: {
      description: 'Draft not in valid state for auto-commit',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Draft not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Internal error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

autopilotRoutes.openapi(autoCommitRoute, async (c) => {
  const { draftId } = c.req.valid('param');

  try {
    const db = await getDB();

    // 1. Fetch draft
    const draft = await findDraftById(db, draftId);
    if (!draft) {
      return errorResponse(c, 'DRAFT_NOT_FOUND', `Draft not found: ${draftId}`);
    }

    // 2. Validate status
    if (draft.status !== 'editing') {
      return errorResponse(
        c,
        'INVALID_STATUS',
        `Draft status must be 'editing', got '${draft.status}'`
      );
    }

    // 3. Validate extraction mode
    if (draft.extraction_mode !== 'llm') {
      return errorResponse(
        c,
        'INVALID_REQUEST',
        `Auto-commit requires extraction_mode 'llm', got '${draft.extraction_mode ?? 'none'}'`
      );
    }

    // 4. Get autopilot config (with fallback to defaults)
    const storedConfig = await getAutopilotConfig(db, draft.project_id);
    const config = mergeAutopilotConfig(storedConfig ?? undefined);

    // 5. Build candidates from semantic points
    // SemanticPoint type is no longer exported; use structural typing
    const sps = (draft.semantic_points ?? []) as Array<{
      id: string;
      text: string;
      zone: string;
      status: string;
      staged: boolean;
    }>;
    const candidates = sps.map((sp) => ({
      id: sp.id,
      text: sp.text,
      zone: sp.zone as 'ready' | 'review',
      status: sp.status,
      staged: sp.staged,
    }));

    // 6. Evaluate
    const plan = evaluateAutoCommit(candidates, config);

    if (!plan.should_commit) {
      return c.json(
        {
          success: true as const,
          data: {
            auto_committed: false,
            reason: plan.reason,
            skipped: plan.skipped,
          },
        },
        200
      );
    }

    // 7. Convert qualifying SPs directly to tree nodes
    const qualifyingIds = new Set(plan.nodes.map((s) => s.id));
    const qualifyingSPs = sps.filter((sp) => qualifyingIds.has(sp.id));

    // 8. Atomically claim the draft (status WHERE guard prevents double-commit)
    //    Must run BEFORE createCommit to avoid orphan commits on race.
    //    We pass a placeholder hash; it will be updated after commit creation.
    const PLACEHOLDER_HASH = 'pending';
    const claimed = await commitDraft(db, draftId, PLACEHOLDER_HASH);
    if (!claimed) {
      return errorResponse(
        c,
        'ALREADY_COMMITTED',
        'Draft was already committed by another request'
      );
    }

    // 9. Create commit (only the winner of step 8 reaches here)
    const autoTrees = qualifyingSPs.map((sp) => ({
      key: sp.id || 'legacy_node',
      slots: { text: sp.text } as Record<string, string>,
      children: [] as import('@t3x-dev/core').TreeNode[],
    }));

    // Find uncommitted yops for this conversation
    const autoConversationId = draft.goal?.startsWith('auto:') ? draft.goal.slice(5) : undefined;
    const yopsLogIds = autoConversationId
      ? await findUncommittedYOpsIds(db, autoConversationId, draft.project_id)
      : [];

    const commit = await createCommit(db, {
      parents: draft.parent_commit_hash ? [draft.parent_commit_hash] : [],
      author: { type: 'agent' as const, name: 'autopilot' },
      content: { trees: autoTrees, relations: [] },
      project_id: draft.project_id,
      message: `Auto-commit: ${qualifyingSPs.length} node(s)`,
      branch: config.target_branch,
      provenance: { method: 'human_curation' },
      yops_log_ids: yopsLogIds,
    });

    // 10. Update draft with the real commit hash
    await db
      .update(drafts)
      .set({ committedAs: commit.hash, updatedAt: new Date() })
      .where(eq(drafts.id, draftId));

    // 11. Push notification (fire-and-forget)
    pushNotification({
      project_id: draft.project_id,
      type: 'commit.created',
      title: 'Auto-commit completed',
      message: `Autopilot committed ${qualifyingSPs.length} node(s) from draft "${draft.title}"`,
      ref_id: commit.hash,
    });

    // 12. Dispatch webhook (fire-and-forget)
    webhookDispatcher.dispatch(
      'commit.created',
      {
        commit_hash: commit.hash,
        project_id: draft.project_id,
        nodes_count: qualifyingSPs.length,
        source: 'autopilot',
      },
      draft.project_id
    );

    return c.json(
      {
        success: true as const,
        data: {
          auto_committed: true,
          commit: {
            hash: commit.hash,
            branch: commit.branch ?? undefined,
            committed_at: commit.committed_at,
          },
          nodes_committed: qualifyingSPs.length,
          nodes_skipped: plan.skipped.length,
          skipped: plan.skipped,
        },
      },
      200
    );
  } catch (err) {
    // Suggestion-vs-baseline: surface concurrent-supersede races as
    // 409 retryable conflict, not opaque 500.
    const conflict = mapSupersededError(c, err);
    if (conflict) return conflict;
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'INTERNAL_ERROR', message);
  }
});
