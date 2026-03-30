/**
 * Leaves ML/Learning Routes
 *
 * Machine learning and intelligent constraint features.
 *
 * Endpoints:
 * - POST   /v1/leaves/:id/suggest-constraints  - Suggest constraints via LLM
 * - POST   /v1/leaves/:id/extract-nodes          - Extract nodes from leaf output
 * - POST   /v1/leaves/:id/learn-from-edits      - Learn constraints from user edits
 * - POST   /v1/leaves/:id/reverse-learn         - Learn constraints from failed assertions
 * - POST   /v1/leaves/:id/compare               - Compare models for leaf generation
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  collectLessons,
  generateLeafOutput,
  suggestConstraints,
  suggestionsToConstraints,
} from '@t3x-dev/core';
import {
  createLeafHistory,
  findEditsByLeafId,
  findLeafById,
  findLeavesByCommit,
  getCommitUnified,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { getLLMProvider, getProviderRegistry } from '../lib/provider-registry';
import { getUserId, recordUsageFireAndForget, wrapWithUsageTracking } from '../lib/usage-tracking';
import { pinoLogger } from '../middleware/logger';
import { ErrorResponseSchema, IdParamSchema, SuccessResponseSchema } from '../schemas/common';

export const leavesMLRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Local Schemas
// ============================================================

const SuggestConstraintsRequest = z.object({
  max_suggestions: z.number().int().min(1).max(20).optional().openapi({
    description: 'Maximum number of suggestions (default: 10)',
    example: 10,
  }),
  instructions: z.string().optional().openapi({
    description: 'Additional instructions for the LLM',
  }),
});

const SuggestedConstraintSchema = z.object({
  type: z.enum(['require', 'exclude']),
  match_mode: z.enum(['exact', 'semantic']),
  value: z.string(),
  reason: z.string(),
  confidence: z.number(),
});

const SuggestConstraintsResponse = z.object({
  success: z.literal(true),
  data: z.object({
    suggestions: z.array(SuggestedConstraintSchema),
    constraints: z.array(
      z.object({
        id: z.string(),
        type: z.enum(['require', 'exclude']),
        match_mode: z.enum(['exact', 'semantic']),
        value: z.string(),
        description: z.string().optional(),
        reason: z.string().optional(),
      })
    ),
    model: z.string(),
  }),
});

const ExtractFromLeafRequest = z.object({
  max_nodes: z.number().int().min(1).max(50).optional().openapi({
    description: 'Maximum number of nodes to extract (default: 20)',
  }),
});

const ExtractFromLeafResponse = z.object({
  success: z.literal(true),
  data: z.object({
    nodes: z.array(
      z.object({
        id: z.string(),
        text: z.string(),
        origin: z.object({
          type: z.literal('extracted'),
          segment_id: z.string(),
          confidence: z.number(),
        }),
        position: z.number(),
        included: z.boolean(),
      })
    ),
    model: z.string(),
    stats: z.object({
      total_turns: z.number(),
      extracted: z.number(),
      with_source_ref: z.number(),
      removed: z.number(),
    }),
  }),
});

const LearnFromEditsRequest = z
  .object({
    max_suggestions: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .default(5)
      .openapi({ description: 'Max number of constraint suggestions' }),
    min_confidence: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .default(0.8)
      .openapi({ description: 'Minimum confidence threshold for suggestions' }),
  })
  .openapi('LearnFromEditsRequest');

const LearnFromEditsResponse = SuccessResponseSchema(
  z.object({
    suggestions: z.array(
      z.object({
        type: z.enum(['require', 'exclude']),
        match_mode: z.enum(['exact', 'semantic']),
        value: z.string(),
        reason: z.string(),
        confidence: z.number(),
        dimension: z.enum(['style', 'content', 'format']),
      })
    ),
    edits_analyzed: z.number(),
    model: z.string(),
  })
);

const ReverseLearningRequest = z
  .object({
    max_suggestions: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .default(5)
      .openapi({ description: 'Max number of constraint suggestions' }),
  })
  .openapi('ReverseLearningRequest');

const ReverseLearningResponse = SuccessResponseSchema(
  z.object({
    suggestions: z.array(
      z.object({
        type: z.enum(['require', 'exclude']),
        match_mode: z.enum(['exact', 'semantic']),
        value: z.string(),
        reason: z.string(),
        confidence: z.number(),
      })
    ),
    lessons_used: z.array(z.string()),
    model: z.string(),
  })
);

const CompareModelsRequest = z.object({
  models: z.array(z.string()).min(1).max(3),
});

const CompareModelsResponse = SuccessResponseSchema(
  z.object({
    results: z.array(
      z.object({
        model: z.string(),
        provider_id: z.string(),
        output: z.string().nullable(),
        latency_ms: z.number(),
        error: z.string().optional(),
      })
    ),
  })
);

// ============================================================
// Route Definitions
// ============================================================

const suggestConstraintsRoute = createRoute({
  method: 'post',
  path: '/v1/leaves/{id}/suggest-constraints',
  tags: ['Leaves'],
  summary: 'Suggest constraints via LLM',
  description:
    'Uses LLM to analyze commit nodes and suggest appropriate require/exclude constraints for the leaf type.',
  request: {
    params: IdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: SuggestConstraintsRequest,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: SuggestConstraintsResponse,
        },
      },
      description: 'Constraint suggestions',
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Leaf or commit not found',
    },
    503: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'LLM not configured',
    },
  },
});

const extractFromLeafRoute = createRoute({
  method: 'post',
  path: '/v1/leaves/{id}/extract-nodes',
  tags: ['Leaves'],
  summary: 'Extract nodes from leaf output',
  description:
    "Uses LLM to extract structured knowledge nodes from a leaf's generated output. Enables the Leaf → Commit feedback loop.",
  request: {
    params: IdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: ExtractFromLeafRequest,
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: ExtractFromLeafResponse } },
      description: 'Nodes extracted from leaf output',
    },
    400: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Leaf has no output',
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Leaf not found',
    },
    503: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'LLM not configured',
    },
  },
});

const learnFromEditsRoute = createRoute({
  method: 'post',
  path: '/v1/leaves/{id}/learn-from-edits',
  tags: ['Leaves'],
  summary: 'Learn constraints from user output edits',
  description:
    "Analyzes patterns in user edits on this leaf's output and suggests constraints that capture the user's implicit preferences (style, content, format).",
  request: {
    params: IdParamSchema,
    body: {
      content: { 'application/json': { schema: LearnFromEditsRequest } },
    },
  },
  responses: {
    200: {
      description: 'Constraint suggestions from edit patterns',
      content: { 'application/json': { schema: LearnFromEditsResponse } },
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Leaf not found',
    },
    422: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'No edits found to learn from',
    },
    503: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'LLM not configured',
    },
  },
});

const reverseLearnRoute = createRoute({
  method: 'post',
  path: '/v1/leaves/{id}/reverse-learn',
  tags: ['Leaves'],
  summary: 'Learn constraints from failed assertions',
  description:
    'Collects lessons from failed assertions on this leaf and sibling leaves, then uses LLM to suggest constraints that would prevent those failures.',
  request: {
    params: IdParamSchema,
    body: {
      content: { 'application/json': { schema: ReverseLearningRequest } },
    },
  },
  responses: {
    200: {
      description: 'Reverse-learned constraint suggestions',
      content: { 'application/json': { schema: ReverseLearningResponse } },
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Leaf or commit not found',
    },
    422: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'No lessons available to learn from',
    },
    503: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'LLM not configured',
    },
  },
});

const compareModelsRoute = createRoute({
  method: 'post',
  path: '/v1/leaves/{id}/compare',
  tags: ['Leaves'],
  summary: 'Compare models for leaf generation',
  description:
    'Generates output from multiple models in parallel for side-by-side comparison. Max 3 models.',
  request: {
    params: IdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: CompareModelsRequest,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Comparison results',
      content: {
        'application/json': {
          schema: CompareModelsResponse,
        },
      },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Leaf or commit not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// ============================================================
// Route Handlers
// ============================================================

// POST /v1/leaves/:id/suggest-constraints
leavesMLRoutes.openapi(suggestConstraintsRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();
    const leaf = await findLeafById(db, id);
    if (!leaf) {
      return errorResponse(c, 'NOT_FOUND', `Leaf ${id} not found`);
    }

    const unifiedCommit = await getCommitUnified(db, leaf.commit_hash);
    if (!unifiedCommit) {
      return errorResponse(c, 'NOT_FOUND', `Commit ${leaf.commit_hash} not found`);
    }
    const knowledge = unifiedCommit.content;

    if (knowledge.trees.length === 0) {
      return c.json(
        {
          success: true as const,
          data: { suggestions: [], constraints: [], model: 'none' },
        },
        200
      );
    }

    const registry = await getProviderRegistry();
    const trackedUsage = { inputTokens: 0, outputTokens: 0 };
    // biome-ignore lint/suspicious/noExplicitAny: generic error handler
    const result = await registry.tryWithFallback('generation', async (provider: any) => {
      const { provider: tracked, usage } = wrapWithUsageTracking(provider);
      trackedUsage.inputTokens = 0;
      trackedUsage.outputTokens = 0;
      const r = await suggestConstraints(
        tracked as Parameters<typeof suggestConstraints>[0],
        knowledge,
        leaf.type,
        {
          maxSuggestions: body.max_suggestions,
          instructions: body.instructions,
        }
      );
      trackedUsage.inputTokens = usage.inputTokens;
      trackedUsage.outputTokens = usage.outputTokens;
      return r;
    });

    // Record usage (fire-and-forget)
    if (trackedUsage.inputTokens || trackedUsage.outputTokens) {
      recordUsageFireAndForget(db, {
        user_id: getUserId(c) ?? undefined,
        project_id: leaf.project_id,
        endpoint: 'leaf_suggest_constraints',
        model: result.model,
        input_tokens: trackedUsage.inputTokens,
        output_tokens: trackedUsage.outputTokens,
      });
    }

    // Convert suggestions to proper Constraint objects with IDs
    const constraints = await suggestionsToConstraints(result.suggestions);

    return c.json(
      {
        success: true as const,
        data: {
          suggestions: result.suggestions,
          constraints,
          model: result.model,
        },
      },
      200
    );
  } catch (err) {
    if (err instanceof Error && err.name === 'AllProvidersFailedError') {
      return c.json(
        {
          success: false as const,
          error: {
            code: 'LLM_NOT_CONFIGURED',
            message:
              'No LLM provider is configured. Set ANTHROPIC_API_KEY or another provider key.',
          },
        },
        503
      );
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GENERATION_FAILED', message);
  }
});

// POST /v1/leaves/:id/extract-nodes
leavesMLRoutes.openapi(extractFromLeafRoute, async (c) => {
  // Node extraction from leaf output is deprecated (replaced by tree-based extraction).
  return errorResponse(
    c,
    'DEPRECATED',
    'Node extraction from leaf output has been replaced by tree-based extraction. Use /v1/extract/trees instead.'
  );
});

// POST /v1/leaves/:id/learn-from-edits
leavesMLRoutes.openapi(learnFromEditsRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();
    const leaf = await findLeafById(db, id);
    if (!leaf) {
      return errorResponse(c, 'LEAF_NOT_FOUND', `Leaf not found: ${id}`);
    }

    // Collect edit history for this leaf
    const edits = await findEditsByLeafId(db, id, { limit: 20 });
    if (edits.length === 0) {
      return c.json(
        {
          success: false as const,
          error: {
            code: 'NO_EDITS',
            message:
              'No output edits found for this leaf. Edit the output manually to build edit history.',
          },
        },
        422
      );
    }

    const llm = await getLLMProvider();
    if (!llm) {
      return c.json(
        {
          success: false as const,
          error: { code: 'LLM_NOT_CONFIGURED', message: 'No LLM provider configured.' },
        },
        503
      );
    }

    // Build edit summaries for the LLM prompt.
    // Each edit is truncated to 500 chars per side (before/after), max 20 edits.
    // Worst case: ~20 * 1100 ≈ 22k chars of edit data + ~1k prompt = ~23k chars total.
    const editSummaries = edits.map((e, i) => {
      const origLines = e.originalOutput.split('\n').length;
      const modLines = e.modifiedOutput.split('\n').length;
      return `Edit ${i + 1}:
BEFORE (${origLines} lines):
${e.originalOutput.slice(0, 500)}${e.originalOutput.length > 500 ? '...' : ''}

AFTER (${modLines} lines):
${e.modifiedOutput.slice(0, 500)}${e.modifiedOutput.length > 500 ? '...' : ''}`;
    });

    const prompt = `You are an expert at analyzing user editing patterns to discover implicit quality constraints.

The user has edited the output of a "${leaf.type}" leaf ${edits.length} time(s). Analyze the patterns in their edits and suggest constraints that capture their preferences.

## User's Edits

${editSummaries.join('\n\n---\n\n')}

## Analysis Instructions

Look for patterns across ALL edits in three dimensions:
1. **Style preferences**: tone, formality, word choice, voice (active/passive), salutations
2. **Content preferences**: information consistently added/removed, topics emphasized/de-emphasized
3. **Format preferences**: structure (lists vs paragraphs), length, spacing, headers

For each pattern you find, suggest a constraint:
- type: "require" (something the output should always have) or "exclude" (something to avoid)
- match_mode: "exact" (literal string match) or "semantic" (meaning-based)
- value: the constraint text
- reason: why you inferred this from the edits
- confidence: 0.0-1.0 (how confident you are based on consistency across edits)
- dimension: "style", "content", or "format"

Only suggest constraints with confidence >= ${body.min_confidence}.
Return at most ${body.max_suggestions} suggestions.

Respond with ONLY a JSON array of constraint objects, no markdown or explanation:
[{"type": "require", "match_mode": "semantic", "value": "...", "reason": "...", "confidence": 0.95, "dimension": "style"}, ...]`;

    const genResult = await llm.generate(prompt, { temperature: 0.3, maxTokens: 2000 });
    const raw = genResult.text;

    // Record usage (fire-and-forget)
    if (genResult.usage.inputTokens || genResult.usage.outputTokens) {
      recordUsageFireAndForget(db, {
        user_id: getUserId(c) ?? undefined,
        project_id: leaf.project_id,
        endpoint: 'leaf_learn_from_edits',
        model: llm.id,
        input_tokens: genResult.usage.inputTokens,
        output_tokens: genResult.usage.outputTokens,
      });
    }

    // Parse the LLM response
    let suggestions: Array<{
      type: 'require' | 'exclude';
      match_mode: 'exact' | 'semantic';
      value: string;
      reason: string;
      confidence: number;
      dimension: 'style' | 'content' | 'format';
    }> = [];

    try {
      const parsed = JSON.parse(
        raw
          .replace(/```json?\n?/g, '')
          .replace(/```/g, '')
          .trim()
      );
      if (Array.isArray(parsed)) {
        suggestions = parsed
          .filter(
            (s: Record<string, unknown>) =>
              ['require', 'exclude'].includes(s.type as string) &&
              ['exact', 'semantic'].includes(s.match_mode as string) &&
              s.value &&
              typeof s.confidence === 'number' &&
              s.confidence >= body.min_confidence
          )
          .slice(0, body.max_suggestions)
          .map((s: Record<string, unknown>) => ({
            type: s.type as 'require' | 'exclude',
            match_mode: s.match_mode as 'exact' | 'semantic',
            value: String(s.value),
            reason: String(s.reason || ''),
            confidence: Number(s.confidence),
            dimension: (['style', 'content', 'format'].includes(s.dimension as string)
              ? s.dimension
              : 'content') as 'style' | 'content' | 'format',
          }));
      }
    } catch (parseErr) {
      pinoLogger.warn({ parseErr, leafId: id }, 'LLM returned non-JSON for learn-from-edits');
    }

    return c.json(
      {
        success: true as const,
        data: {
          suggestions,
          edits_analyzed: edits.length,
          model: llm.id,
        },
      },
      200
    );
  } catch (err) {
    if (err instanceof Error && err.name === 'AllProvidersFailedError') {
      return c.json(
        {
          success: false as const,
          error: { code: 'LLM_NOT_CONFIGURED', message: 'No LLM provider is configured.' },
        },
        503
      );
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'LEARN_FAILED', message);
  }
});

// POST /v1/leaves/:id/reverse-learn
leavesMLRoutes.openapi(reverseLearnRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();
    const leaf = await findLeafById(db, id);
    if (!leaf) {
      return errorResponse(c, 'NOT_FOUND', `Leaf ${id} not found`);
    }

    const unifiedCommit = await getCommitUnified(db, leaf.commit_hash);
    if (!unifiedCommit) {
      return errorResponse(c, 'NOT_FOUND', `Commit ${leaf.commit_hash} not found`);
    }
    const rlKnowledge = unifiedCommit.content;

    // Collect lessons from failed assertions on this leaf and siblings
    const allLeaves = await findLeavesByCommit(db, leaf.commit_hash);
    const lessons = collectLessons(allLeaves);

    if (lessons.length === 0) {
      return c.json(
        {
          success: false as const,
          error: {
            code: 'NO_LESSONS',
            message: 'No failed assertion lessons found for this leaf or its siblings.',
          },
        },
        422
      );
    }

    const llm = await getLLMProvider();
    if (!llm) {
      return c.json(
        {
          success: false as const,
          error: { code: 'LLM_NOT_CONFIGURED', message: 'No LLM provider configured.' },
        },
        503
      );
    }

    // Use suggestConstraints but augment the instructions with lessons
    const lessonsContext = lessons
      .slice(0, 10)
      .map((l, i) => `${i + 1}. ${l}`)
      .join('\n');

    const { provider: trackedLlm, usage: rlUsage } = wrapWithUsageTracking(llm);
    const result = await suggestConstraints(trackedLlm, rlKnowledge, leaf.type, {
      maxSuggestions: body.max_suggestions,
      instructions: `The following lessons were learned from FAILED validations on previous outputs.
Generate constraints that would PREVENT these failures:

${lessonsContext}

Focus on constraints that directly address these failures.`,
    });

    // Record usage (fire-and-forget)
    if (rlUsage.inputTokens || rlUsage.outputTokens) {
      recordUsageFireAndForget(db, {
        user_id: getUserId(c) ?? undefined,
        project_id: leaf.project_id,
        endpoint: 'leaf_reverse_learn',
        model: result.model,
        input_tokens: rlUsage.inputTokens,
        output_tokens: rlUsage.outputTokens,
      });
    }

    return c.json(
      {
        success: true as const,
        data: {
          suggestions: result.suggestions,
          lessons_used: lessons.slice(0, 10),
          model: result.model,
        },
      },
      200
    );
  } catch (err) {
    if (err instanceof Error && err.name === 'AllProvidersFailedError') {
      return c.json(
        {
          success: false as const,
          error: { code: 'LLM_NOT_CONFIGURED', message: 'No LLM provider is configured.' },
        },
        503
      );
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GENERATION_FAILED', message);
  }
});

// POST /v1/leaves/:id/compare
leavesMLRoutes.openapi(compareModelsRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { models } = c.req.valid('json');

  try {
    const db = await getDB();

    const leaf = await findLeafById(db, id);
    if (!leaf) {
      return errorResponse(c, 'LEAF_NOT_FOUND', `Leaf not found: ${id}`);
    }

    const unifiedCommit = await getCommitUnified(db, leaf.commit_hash);
    if (!unifiedCommit) {
      return errorResponse(c, 'COMMIT_NOT_FOUND', `Source commit not found: ${leaf.commit_hash}`);
    }
    const compareKnowledge = unifiedCommit.content;

    const registry = await getProviderRegistry();
    const additionalInstructions =
      typeof leaf.config?.user_instruction === 'string' ? leaf.config.user_instruction : undefined;

    // Run all models in parallel
    const results = await Promise.allSettled(
      models.map(async (modelSpec) => {
        const start = Date.now();

        // Resolve model to provider
        const resolved = registry.resolveModel(modelSpec);
        if (!resolved) {
          return {
            model: modelSpec,
            provider_id: 'unknown',
            output: null as string | null,
            latency_ms: Date.now() - start,
            error: `No provider found for model: ${modelSpec}`,
          };
        }

        try {
          const result = await generateLeafOutput({
            knowledge: compareKnowledge,
            leaf,
            // biome-ignore lint/suspicious/noExplicitAny: generic error handler
            provider: resolved.provider as any,
            additionalInstructions,
          });

          const latencyMs = Date.now() - start;

          // Record token usage (fire-and-forget)
          recordUsageFireAndForget(db, {
            user_id: getUserId(c) ?? undefined,
            project_id: leaf.project_id,
            endpoint: 'leaf_generate',
            model: result.model,
            input_tokens: result.usage.inputTokens,
            output_tokens: result.usage.outputTokens,
          });

          // Save each result to history
          try {
            await createLeafHistory(db, {
              leaf_id: id,
              output: result.output,
              config: { ...leaf.config, model: modelSpec },
              model: result.model,
            });
          } catch {
            // Non-critical
          }

          return {
            model: result.model,
            provider_id: resolved.provider.id,
            output: result.output as string | null,
            latency_ms: latencyMs,
          };
        } catch (err) {
          return {
            model: modelSpec,
            provider_id: resolved.provider.id,
            output: null as string | null,
            latency_ms: Date.now() - start,
            error: err instanceof Error ? err.message : 'Generation failed',
          };
        }
      })
    );

    const data = results.map((r) => {
      if (r.status === 'fulfilled') return r.value;
      return {
        model: 'unknown',
        provider_id: 'unknown',
        output: null,
        latency_ms: 0,
        error: r.reason instanceof Error ? r.reason.message : 'Unknown error',
      };
    });

    return c.json({ success: true as const, data: { results: data } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'COMPARE_FAILED', message);
  }
});
