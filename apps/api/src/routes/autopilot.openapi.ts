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
  type SemanticPoint,
  spToSentence,
} from '@t3x/core';
import {
  commitDraftV3,
  createCommitV4,
  findDraftV3ById,
  getAdaptiveFeedbackStats,
  getAutopilotConfig,
  updateAutopilotConfig,
} from '@t3x/storage/pglite';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { webhookDispatcher } from '../lib/webhook-dispatcher';
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
  min_confidence: z.number(),
  min_sentences: z.number(),
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
  min_confidence: z.number().min(0).max(1).optional(),
  min_sentences: z.number().int().min(1).optional(),
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
        confidenceMultipliers: z.record(z.string(), z.number()),
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
    sentences_committed: z.number().optional(),
    sentences_skipped: z.number().optional(),
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
    const draft = await findDraftV3ById(db, draftId);
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
    const sps = (draft.semantic_points ?? []) as SemanticPoint[];
    const candidates = sps.map((sp) => ({
      id: sp.id,
      text: sp.text,
      confidence: sp.confidence ?? 0,
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

    // 7. Convert qualifying SPs to sentences
    const qualifyingIds = new Set(plan.sentences.map((s) => s.id));
    const qualifyingSPs = sps.filter((sp) => qualifyingIds.has(sp.id));
    const sentences = qualifyingSPs.map((sp) => spToSentence(sp));

    // 8. Re-check draft status to guard against concurrent auto-commit calls
    const freshDraft = await findDraftV3ById(db, draftId);
    if (!freshDraft || freshDraft.status !== 'editing') {
      return errorResponse(
        c,
        'ALREADY_COMMITTED',
        'Draft was already committed by another request'
      );
    }

    // 9. Create commit
    const commit = await createCommitV4(
      db,
      {
        parents: draft.parent_commit_hash ? [draft.parent_commit_hash] : [],
        author: { type: 'agent', name: 'autopilot' },
        sentences,
        project_id: draft.project_id,
        message: `Auto-commit: ${sentences.length} sentence(s)`,
        branch: config.target_branch,
      },
      { strictParents: false }
    );

    // 10. Mark draft as committed (status guard prevents double-commit)
    const committed = await commitDraftV3(db, draftId, commit.hash);
    if (!committed) {
      return errorResponse(
        c,
        'ALREADY_COMMITTED',
        'Draft was already committed by another request'
      );
    }

    // 11. Push notification (fire-and-forget)
    pushNotification({
      project_id: draft.project_id,
      type: 'commit.created',
      title: 'Auto-commit completed',
      message: `Autopilot committed ${sentences.length} sentence(s) from draft "${draft.title}"`,
      ref_id: commit.hash,
    });

    // 12. Dispatch webhook (fire-and-forget)
    webhookDispatcher.dispatch(
      'commit.created',
      {
        commit_hash: commit.hash,
        project_id: draft.project_id,
        sentences_count: sentences.length,
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
          sentences_committed: sentences.length,
          sentences_skipped: plan.skipped.length,
          skipped: plan.skipped,
        },
      },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'INTERNAL_ERROR', message);
  }
});
