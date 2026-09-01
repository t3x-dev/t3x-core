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
  collectLessonsFromAssertions,
  generateLeafOutput,
  type LLMProvider,
  suggestConstraints,
  suggestionsToConstraints,
} from '@t3x-dev/core';
import {
  createLeafHistory,
  findEditsByLeafId,
  findLeafById,
  findLeavesByCommit,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import {
  createInferenceRuntime,
  executeMeteredInference,
  getInferenceRuntime,
  InferenceAdmissionDeniedError,
  resolveInferenceActor,
  resolveInferenceRunId,
} from '../lib/inference';
import { bindInferenceProvider } from '../lib/inference-provider';
import { assertProjectAccess } from '../lib/project-access';
import { getLLMProvider, getProviderRegistry } from '../lib/provider-registry';
import { getRepositorySemanticCommit } from '../lib/repository-state-transition';
import { getUserId, recordUsageFireAndForget } from '../lib/usage-tracking';
import { pinoLogger } from '../middleware/logger';
import { ErrorResponseSchema, IdParamSchema, SuccessResponseSchema } from '../schemas/common';

export const leavesMLRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});
const defaultInferenceRuntime = createInferenceRuntime();

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
    const project = await assertProjectAccess(c, db, leaf.project_id);
    if (project instanceof Response) return project;

    const unifiedCommit = await getRepositorySemanticCommit(db, leaf.commit_hash, leaf.project_id);
    if (!unifiedCommit) {
      return errorResponse(c, 'NOT_FOUND', `Commit ${leaf.commit_hash} not found`);
    }
    const knowledge = unifiedCommit.semanticContent;

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
    const runId = resolveInferenceRunId(c);
    const actor = resolveInferenceActor(c);
    const result = await registry.tryWithFallback<
      LLMProvider,
      Awaited<ReturnType<typeof suggestConstraints>>
    >('generation', async (provider) => {
      const resolvedModel = registry.getEntry(provider.id)?.defaultModel ?? provider.id;
      const meteredProvider = bindInferenceProvider(provider, {
        runtime: getInferenceRuntime(c) ?? defaultInferenceRuntime,
        input: {
          runId,
          feature: 'leaf.suggest-constraints',
          requestedModel: resolvedModel,
          scope: {
            actor,
            projectId: leaf.project_id,
            ...(project.namespaceId ? { namespaceId: project.namespaceId } : {}),
            projectVisibility: 'unknown',
          },
        },
        resolvedProvider: provider.id,
        resolvedModel,
      });
      return suggestConstraints(meteredProvider, knowledge, leaf.type, {
        maxSuggestions: body.max_suggestions,
        instructions: body.instructions,
      });
    });

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
    if (err instanceof InferenceAdmissionDeniedError) {
      return c.json(
        { success: false as const, error: { code: 'RATE_LIMITED', message: err.message } },
        429
      );
    }
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
    const project = await assertProjectAccess(c, db, leaf.project_id);
    if (project instanceof Response) return project;

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
- dimension: "style", "content", or "format"

Return at most ${body.max_suggestions} suggestions.

Respond with ONLY a JSON array of constraint objects, no markdown or explanation:
[{"type": "require", "match_mode": "semantic", "value": "...", "reason": "...", "dimension": "style"}, ...]`;

    const execution = await executeMeteredInference({
      runtime: getInferenceRuntime(c) ?? defaultInferenceRuntime,
      input: {
        runId: resolveInferenceRunId(c),
        feature: 'leaf.learn-from-edits',
        requestedModel: llm.id,
        scope: {
          actor: resolveInferenceActor(c),
          projectId: leaf.project_id,
          ...(project.namespaceId ? { namespaceId: project.namespaceId } : {}),
          projectVisibility: 'unknown',
        },
      },
      resolvedProvider: llm.id,
      resolvedModel: llm.id,
      async invoke() {
        const result = await llm.generate(prompt, { temperature: 0.3, maxTokens: 2000 });
        return { value: result, usage: result.usage };
      },
    });
    const genResult = execution.value;
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
              s.value
          )
          .slice(0, body.max_suggestions)
          .map((s: Record<string, unknown>) => ({
            type: s.type as 'require' | 'exclude',
            match_mode: s.match_mode as 'exact' | 'semantic',
            value: String(s.value),
            reason: String(s.reason || ''),
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
    if (err instanceof InferenceAdmissionDeniedError) {
      return c.json(
        { success: false as const, error: { code: 'RATE_LIMITED', message: err.message } },
        429
      );
    }
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
    const project = await assertProjectAccess(c, db, leaf.project_id);
    if (project instanceof Response) return project;

    const unifiedCommit = await getRepositorySemanticCommit(db, leaf.commit_hash, leaf.project_id);
    if (!unifiedCommit) {
      return errorResponse(c, 'NOT_FOUND', `Commit ${leaf.commit_hash} not found`);
    }
    const rlKnowledge = unifiedCommit.semanticContent;

    // Collect lessons from failed assertions on this leaf and siblings
    const allLeaves = await findLeavesByCommit(db, leaf.commit_hash, {
      projectId: leaf.project_id,
    });
    const lessons = collectLessonsFromAssertions(
      allLeaves.map((l) => ({ id: l.id, assertions: l.assertions }))
    );

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
    const registry = await getProviderRegistry();
    const resolvedModel = registry.getEntry(llm.id)?.defaultModel ?? llm.id;

    // Use suggestConstraints but augment the instructions with lessons
    const lessonsContext = lessons
      .slice(0, 10)
      .map((l, i) => `${i + 1}. ${l.signal}`)
      .join('\n');

    const meteredLlm = bindInferenceProvider(llm, {
      runtime: getInferenceRuntime(c) ?? defaultInferenceRuntime,
      input: {
        runId: resolveInferenceRunId(c),
        feature: 'leaf.reverse-learn',
        requestedModel: resolvedModel,
        scope: {
          actor: resolveInferenceActor(c),
          projectId: leaf.project_id,
          ...(project.namespaceId ? { namespaceId: project.namespaceId } : {}),
          projectVisibility: 'unknown',
        },
      },
      resolvedProvider: llm.id,
      resolvedModel,
    });
    const result = await suggestConstraints(meteredLlm, rlKnowledge, leaf.type, {
      maxSuggestions: body.max_suggestions,
      instructions: `The following lessons were learned from FAILED validations on previous outputs.
Generate constraints that would PREVENT these failures:

${lessonsContext}

Focus on constraints that directly address these failures.`,
    });

    return c.json(
      {
        success: true as const,
        data: {
          suggestions: result.suggestions,
          lessons_used: lessons.slice(0, 10).map((l) => l.signal),
          model: result.model,
        },
      },
      200
    );
  } catch (err) {
    if (err instanceof InferenceAdmissionDeniedError) {
      return c.json(
        { success: false as const, error: { code: 'RATE_LIMITED', message: err.message } },
        429
      );
    }
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
    const project = await assertProjectAccess(c, db, leaf.project_id);
    if (project instanceof Response) return project;

    const unifiedCommit = await getRepositorySemanticCommit(db, leaf.commit_hash, leaf.project_id);
    if (!unifiedCommit) {
      return errorResponse(c, 'COMMIT_NOT_FOUND', `Source commit not found: ${leaf.commit_hash}`);
    }
    const compareKnowledge = unifiedCommit.semanticContent;

    const registry = await getProviderRegistry();
    const additionalInstructions =
      typeof leaf.config?.user_instruction === 'string' ? leaf.config.user_instruction : undefined;
    const runId = resolveInferenceRunId(c);
    const actor = resolveInferenceActor(c);

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
          const execution = await executeMeteredInference({
            runtime: getInferenceRuntime(c) ?? defaultInferenceRuntime,
            input: {
              runId,
              feature: 'leaf.compare-model',
              requestedModel: modelSpec,
              scope: {
                actor,
                projectId: leaf.project_id,
                ...(project.namespaceId ? { namespaceId: project.namespaceId } : {}),
                projectVisibility: 'unknown',
              },
            },
            resolvedProvider: resolved.provider.id,
            resolvedModel: resolved.model,
            async invoke() {
              const result = await generateLeafOutput({
                knowledge: compareKnowledge,
                leaf,
                // biome-ignore lint/suspicious/noExplicitAny: generic error handler
                provider: resolved.provider as any,
                additionalInstructions,
              });
              return { value: result, usage: result.usage };
            },
          });
          const result = execution.value;

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
