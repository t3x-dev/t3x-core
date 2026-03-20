/**
 * Leaves Generation & Validation Routes
 *
 * LLM-heavy endpoints for generating and validating leaf output.
 *
 * Endpoints:
 * - POST   /v1/leaves/:id/generate           - Generate leaf output
 * - POST   /v1/leaves/:id/validate           - Validate leaf output
 * - POST   /v1/commits/:hash/leaves/batch    - Batch create and generate leaves
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Commit } from '@t3x-dev/core';
import {
  AllProvidersFailedError,
  collectLessons,
  framesToTextSegments,
  GenerationError,
  type GenerationMode,
  isGenerationConfigured,
  modeGenerate,
  type SentenceCommit,
  validateConstraints,
  validateConstraintsExactOnly,
} from '@t3x-dev/core';
import {
  createLeaf,
  createLeafHistory,
  findLeafById,
  findLeavesByCommit,
  getCommitUnified,
  updateLeaf,
  updateLeafOutput,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { getEmbedder, isSemanticValidationConfigured } from '../lib/embedder';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import {
  generateWithFallback,
  getLLMProvider,
  getProviderRegistry,
} from '../lib/provider-registry';
import { getUserId, recordUsageFireAndForget } from '../lib/usage-tracking';
import { webhookDispatcher } from '../lib/webhook-dispatcher';
import { pinoLogger } from '../middleware/logger';
import { ErrorResponseSchema, IdParamSchema } from '../schemas/common';
import {
  BatchGenerateRequest,
  BatchGenerateResponse,
  GenerateLeafOutputRequest,
  GenerateLeafOutputResponse,
  ValidateLeafOutputRequest,
  ValidateLeafOutputResponse,
} from '../schemas/contracts';
import { toApiLeaf } from './leaves-shared';
import { pushNotification } from './notifications.openapi';

export const leavesGenerationRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Helpers
// ============================================================

/**
 * Convert a unified Commit to a sentence-based SentenceCommit shape.
 * Needed because generateLeafOutput / modeGenerate expect SentenceCommit.
 */
function toSentenceCommit(commit: Commit): SentenceCommit {
  const segments = framesToTextSegments(commit.content);
  return {
    ...commit,
    schema: 't3x/commit/v4' as const,
    content: {
      sentences: segments.map((seg) => ({
        id: seg.id,
        text: seg.text,
        confidence: 1,
      })),
    },
  } as SentenceCommit;
}

// ============================================================
// Route Definitions
// ============================================================

// POST /v1/leaves/:id/generate - Generate output
const generateLeafRoute = createRoute({
  method: 'post',
  path: '/v1/leaves/{id}/generate',
  tags: ['Leaves'],
  summary: 'Generate leaf output',
  description:
    'Generates output for a leaf using the Claude API based on commit sentences and constraints.',
  request: {
    params: IdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: GenerateLeafOutputRequest,
        },
      },
      required: false,
    },
  },
  responses: {
    200: {
      description: 'Output generated successfully',
      content: {
        'application/json': {
          schema: GenerateLeafOutputResponse,
        },
      },
    },
    400: {
      description: 'Generation not configured (ANTHROPIC_API_KEY not set)',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'Leaf or commit not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    429: {
      description: 'Rate limited by Anthropic API',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: 'Generation failed',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// POST /v1/leaves/:id/validate - Validate output
const validateLeafRoute = createRoute({
  method: 'post',
  path: '/v1/leaves/{id}/validate',
  tags: ['Leaves'],
  summary: 'Validate leaf output',
  description: 'Validates the generated output against the leaf constraints.',
  request: {
    params: IdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: ValidateLeafOutputRequest,
        },
      },
      required: false,
    },
  },
  responses: {
    200: {
      description: 'Validation completed successfully',
      content: {
        'application/json': {
          schema: ValidateLeafOutputResponse,
        },
      },
    },
    400: {
      description: 'No output to validate',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'Leaf not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: 'Validation failed',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// POST /v1/commits/:hash/leaves/batch - Batch create and generate leaves
const batchGenerateRoute = createRoute({
  method: 'post',
  path: '/v1/commits/{hash}/leaves/batch',
  tags: ['Leaves'],
  summary: 'Batch create and generate leaves',
  description:
    'Creates multiple leaf nodes from a commit and optionally generates output for each. Maximum 10 leaves per batch.',
  request: {
    params: z.object({
      hash: z.string().min(1),
    }),
    body: {
      content: {
        'application/json': {
          schema: BatchGenerateRequest,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Batch operation completed (may have partial failures)',
      content: {
        'application/json': {
          schema: BatchGenerateResponse,
        },
      },
    },
    400: {
      description: 'Invalid request or generation not configured',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'Commit not found',
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

// ============================================================
// Route Handlers
// ============================================================

// POST /v1/leaves/:id/generate - Generate output handler
leavesGenerationRoutes.openapi(generateLeafRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  // Extract mode from request body (default: 'fast' for backward compatibility)
  const mode: GenerationMode = body?.mode ?? 'fast';
  const stylePreferences = body?.style_preferences;

  try {
    // Check if any generation provider is configured
    if (!isGenerationConfigured((await getLLMProvider()) ?? undefined)) {
      return errorResponse(
        c,
        'GENERATION_NOT_CONFIGURED',
        'No LLM provider configured. Set ANTHROPIC_API_KEY or configure a provider.'
      );
    }

    const db = await getDB();

    // Get leaf by ID
    const leaf = await findLeafById(db, id);
    if (!leaf) {
      return errorResponse(c, 'LEAF_NOT_FOUND', `Leaf not found: ${id}`);
    }

    // Verify project access
    const accessResult = await assertProjectAccess(c, db, leaf.project_id);
    if (accessResult instanceof Response) return accessResult;

    // Get source commit by hash (unified, auto-upgrades V4)
    const unifiedCommit = await getCommitUnified(db, leaf.commit_hash);
    if (!unifiedCommit) {
      return errorResponse(c, 'COMMIT_NOT_FOUND', `Source commit not found: ${leaf.commit_hash}`);
    }
    const commit = toSentenceCommit(unifiedCommit);

    // Collect lessons from historical leaves on the same commit (#4 feedback loop)
    const historicalLeaves = await findLeavesByCommit(db, leaf.commit_hash);
    const lessons = collectLessons(historicalLeaves);

    // Multi-round generation when mode is 'standard' or 'thorough'
    let multiRoundResult:
      | {
          output: string;
          rounds: Array<{
            name: string;
            round_number: number;
            constraints_passed: boolean;
            failed_constraints: string[];
          }>;
          total_rounds: number;
          mode: GenerationMode;
        }
      | undefined;

    if (mode !== 'fast') {
      // Use multi-round pipeline via provider fallback
      const reg = await getProviderRegistry();
      multiRoundResult = await reg.tryWithFallback('generation', async (provider) => {
        const mrResult = await modeGenerate({
          commit,
          leaf,
          provider,
          mode,
          stylePreferences: stylePreferences
            ? {
                tone: stylePreferences.tone,
                length: stylePreferences.length,
                formality: stylePreferences.formality,
              }
            : undefined,
        });
        return { ...mrResult, mode };
      });
    }

    // For 'fast' mode or when multi-round is not used, use existing generation path
    let finalOutput: string;
    let validationData:
      | {
          allPassed: boolean;
          passedCount: number;
          failedCount: number;
          attempts: number;
          assertions?: Array<{
            id: string;
            constraint_id: string;
            passed: boolean;
            details: string;
            lesson?: string;
          }>;
        }
      | undefined;
    let generationModel = 'unknown';

    if (multiRoundResult) {
      finalOutput = multiRoundResult.output;
      generationModel = 'multi-round';

      // Record multi-round usage
      if (multiRoundResult.usage.inputTokens || multiRoundResult.usage.outputTokens) {
        recordUsageFireAndForget(db, {
          user_id: getUserId(c) ?? undefined,
          project_id: leaf.project_id,
          endpoint: 'leaf_generate',
          model: generationModel,
          input_tokens: multiRoundResult.usage.inputTokens,
          output_tokens: multiRoundResult.usage.outputTokens,
        });
      }
    } else {
      // Generate with automatic provider fallback (existing single-round path)
      const result = await generateWithFallback({
        commit,
        leaf,
        lessons: lessons.length > 0 ? lessons : undefined,
        additionalInstructions:
          typeof leaf.config?.user_instruction === 'string'
            ? leaf.config.user_instruction
            : undefined,
      });
      finalOutput = result.output;
      generationModel = result.model;

      // Record single-round usage
      if (result.usage.inputTokens || result.usage.outputTokens) {
        recordUsageFireAndForget(db, {
          user_id: getUserId(c) ?? undefined,
          project_id: leaf.project_id,
          endpoint: 'leaf_generate',
          model: result.model,
          input_tokens: result.usage.inputTokens,
          output_tokens: result.usage.outputTokens,
        });
      }

      if (result.validation) {
        validationData = {
          allPassed: result.validation.allPassed,
          passedCount: result.validation.passedCount,
          failedCount: result.validation.failedCount,
          attempts: result.attempts,
          assertions: result.validation.assertions,
        };
      }
    }

    // Update leaf with output (storage sets generated_at automatically)
    const updatedLeaf = await updateLeafOutput(db, id, finalOutput);

    if (!updatedLeaf) {
      return errorResponse(c, 'UPDATE_FAILED', 'Failed to update leaf with generated output');
    }

    // If auto-validation produced assertions (fast mode), store them on the leaf
    if (validationData?.assertions) {
      const leafWithAssertions = await updateLeaf(db, id, {
        assertions: validationData.assertions,
      });
      if (leafWithAssertions) {
        Object.assign(updatedLeaf, leafWithAssertions);
      }
    }

    // Save to generation history (non-blocking - don't fail if history save fails)
    try {
      await createLeafHistory(db, {
        leaf_id: id,
        output: finalOutput,
        config: { ...(leaf.config ?? {}), generation_mode: mode },
        model: generationModel,
      });
    } catch (historyErr) {
      // Log but don't fail - history is supplementary
      pinoLogger.warn({ err: historyErr }, 'failed to save generation history');
    }

    // Fire webhook event (fire-and-forget)
    webhookDispatcher.dispatch(
      'leaf.generated',
      {
        leaf_id: id,
        project_id: leaf.project_id,
      },
      leaf.project_id
    );

    // Push notification (fire-and-forget)
    pushNotification({
      type: 'leaf.generated',
      title: 'Output Generated',
      message: `Leaf "${leaf.title || id}" output generated (${mode} mode)`,
      project_id: leaf.project_id,
      ref_id: id,
    });

    // Return response according to contract (contracts.ts)
    return c.json(
      {
        success: true as const,
        data: {
          output: finalOutput,
          generated_at: updatedLeaf.generated_at ?? new Date().toISOString(),
          ...(validationData
            ? {
                validation: {
                  all_passed: validationData.allPassed,
                  passed_count: validationData.passedCount,
                  failed_count: validationData.failedCount,
                  attempts: 1,
                },
              }
            : {}),
          ...(multiRoundResult
            ? {
                rounds: multiRoundResult.rounds.map((r) => ({
                  name: r.name,
                  round_number: r.round_number,
                  constraints_passed: r.constraints_passed,
                  failed_constraints: r.failed_constraints,
                })),
                total_rounds: multiRoundResult.total_rounds,
                mode: multiRoundResult.mode,
              }
            : {}),
        },
      },
      200
    );
  } catch (err) {
    if (err instanceof GenerationError) {
      // Map generation error codes to HTTP status codes
      switch (err.code) {
        case 'RATE_LIMIT':
          return errorResponse(c, 'RATE_LIMITED', err.message);
        case 'AUTH_ERROR':
          return errorResponse(c, 'AUTH_ERROR', err.message);
        case 'NOT_CONFIGURED':
          return errorResponse(c, 'GENERATION_NOT_CONFIGURED', err.message);
        default:
          return errorResponse(c, 'GENERATION_FAILED', err.message);
      }
    }

    // All providers failed — extract the last provider's error for status mapping
    if (err instanceof AllProvidersFailedError) {
      const lastErr = err.errors[err.errors.length - 1]?.error;
      if (lastErr instanceof GenerationError && lastErr.code === 'RATE_LIMIT') {
        return errorResponse(c, 'RATE_LIMITED', err.message);
      }
      return errorResponse(c, 'GENERATION_FAILED', err.message);
    }

    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GENERATION_FAILED', message);
  }
});

// POST /v1/leaves/:id/validate - Validate output handler
leavesGenerationRoutes.openapi(validateLeafRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const useSemantic = body?.use_semantic ?? false;

  try {
    const db = await getDB();

    // 1. Get leaf by ID
    const leaf = await findLeafById(db, id);
    if (!leaf) {
      return errorResponse(c, 'LEAF_NOT_FOUND', `Leaf not found: ${id}`);
    }

    // 1b. Verify project access
    const accessResult = await assertProjectAccess(c, db, leaf.project_id);
    if (accessResult instanceof Response) return accessResult;

    // 2. Check if output exists
    if (!leaf.output) {
      return errorResponse(c, 'NO_OUTPUT', 'Leaf has no generated output to validate');
    }

    // 3. Handle empty constraints case
    if (!leaf.constraints || leaf.constraints.length === 0) {
      return c.json(
        {
          success: true as const,
          data: {
            leaf: toApiLeaf(leaf),
            validation: {
              all_passed: true,
              passed_count: 0,
              failed_count: 0,
            },
          },
        },
        200
      );
    }

    // 4. Run validation
    let validationResult;
    if (useSemantic) {
      // Check if semantic validation is configured
      if (!isSemanticValidationConfigured()) {
        return errorResponse(
          c,
          'SEMANTIC_NOT_CONFIGURED',
          'Semantic validation requires GOOGLE_AI_STUDIO_KEY environment variable'
        );
      }
      const embedder = getEmbedder();
      // Use async validation with embedder
      validationResult = await validateConstraints({
        output: leaf.output,
        constraints: leaf.constraints,
        embedder: embedder!,
      });
    } else {
      validationResult = validateConstraintsExactOnly(leaf.output, leaf.constraints);
    }

    // 5. Update leaf with assertions
    const updatedLeaf = await updateLeaf(db, id, {
      assertions: validationResult.assertions,
    });

    if (!updatedLeaf) {
      return errorResponse(c, 'UPDATE_FAILED', 'Failed to update leaf with assertions');
    }

    // 6. Return response
    return c.json(
      {
        success: true as const,
        data: {
          leaf: toApiLeaf(updatedLeaf),
          validation: {
            all_passed: validationResult.allPassed,
            passed_count: validationResult.passedCount,
            failed_count: validationResult.failedCount,
          },
        },
      },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'VALIDATION_FAILED', message);
  }
});

// POST /v1/commits/:hash/leaves/batch - Batch create and generate leaves
leavesGenerationRoutes.openapi(batchGenerateRoute, async (c) => {
  const { hash } = c.req.valid('param');
  const body = c.req.valid('json');
  const decodedHash = decodeURIComponent(hash);

  // Result tracking
  const results: Array<{
    leaf: ReturnType<typeof toApiLeaf> | null;
    error: { code: string; message: string } | null;
  }> = [];
  let succeeded = 0;
  let failed = 0;

  try {
    const db = await getDB();

    // 0. Verify project access
    if (body.project_id) {
      const accessResult = await assertProjectAccess(c, db, body.project_id);
      if (accessResult instanceof Response) return accessResult;
    }

    // 1. Verify commit exists (unified, auto-upgrades V4)
    const unifiedCommit = await getCommitUnified(db, decodedHash);
    if (!unifiedCommit) {
      return errorResponse(c, 'COMMIT_NOT_FOUND', `Commit not found: ${decodedHash}`);
    }
    const commit = toSentenceCommit(unifiedCommit);

    // 2. Check generation configuration if generation is needed
    const needsGeneration = !body.skip_generation;
    if (needsGeneration && !isGenerationConfigured((await getLLMProvider()) ?? undefined)) {
      return errorResponse(
        c,
        'GENERATION_NOT_CONFIGURED',
        'No LLM provider configured. Set ANTHROPIC_API_KEY or configure a provider. Use skip_generation=true to create leaves without generating output.'
      );
    }

    // 3. Process each leaf config sequentially (avoid rate limiting)
    for (const leafConfig of body.leaves) {
      try {
        // 3a. Create leaf (auto-generate title from commit message if not provided)
        const leafTitle =
          leafConfig.title || `${commit.message || decodedHash.slice(0, 16)} — ${leafConfig.type}`;
        const leaf = await createLeaf(db, {
          commit_hash: decodedHash,
          type: leafConfig.type,
          title: leafTitle,
          constraints: leafConfig.constraints,
          config: leafConfig.config ?? {},
          project_id: body.project_id,
        });

        // 3b. Generate output if not skipped (uses fallback across providers)
        if (needsGeneration) {
          try {
            // Collect lessons from historical leaves on the same commit
            const batchHistLeaves = await findLeavesByCommit(db, leaf.commit_hash);
            const batchLessons = collectLessons(batchHistLeaves);

            const result = await generateWithFallback({
              commit,
              leaf,
              lessons: batchLessons.length > 0 ? batchLessons : undefined,
              additionalInstructions:
                typeof leaf.config?.user_instruction === 'string'
                  ? leaf.config.user_instruction
                  : undefined,
            });

            // Record usage (fire-and-forget)
            if (result.usage.inputTokens || result.usage.outputTokens) {
              recordUsageFireAndForget(db, {
                user_id: getUserId(c) ?? undefined,
                project_id: body.project_id,
                endpoint: 'leaf_batch_generate',
                model: result.model,
                input_tokens: result.usage.inputTokens,
                output_tokens: result.usage.outputTokens,
              });
            }

            // Update leaf with output
            let updatedLeaf = await updateLeafOutput(db, leaf.id, result.output);

            // If auto-validation produced assertions, store them on the leaf
            if (result.validation && updatedLeaf) {
              updatedLeaf =
                (await updateLeaf(db, leaf.id, {
                  assertions: result.validation.assertions,
                })) ?? updatedLeaf;
            }

            // Save to history (non-blocking)
            try {
              await createLeafHistory(db, {
                leaf_id: leaf.id,
                output: result.output,
                config: leaf.config ?? {},
                model: result.model,
              });
            } catch {
              // Log but don't fail - history is supplementary
            }

            results.push({
              leaf: updatedLeaf ? toApiLeaf(updatedLeaf) : toApiLeaf(leaf),
              error: null,
            });
            succeeded++;
          } catch (genErr) {
            // Generation failed, but leaf was created
            const genMessage = genErr instanceof Error ? genErr.message : 'Generation failed';
            results.push({
              leaf: toApiLeaf(leaf),
              error: { code: 'GENERATION_FAILED', message: genMessage },
            });
            // Count as partial success - leaf created but generation failed
            succeeded++;
          }
        } else {
          // No generation needed
          results.push({
            leaf: toApiLeaf(leaf),
            error: null,
          });
          succeeded++;
        }
      } catch (leafErr) {
        // Leaf creation failed
        const message = leafErr instanceof Error ? leafErr.message : 'Unknown error';
        results.push({
          leaf: null,
          error: { code: 'CREATE_FAILED', message },
        });
        failed++;
      }
    }

    // 4. Return results
    return c.json(
      {
        success: true as const,
        data: {
          results,
          summary: {
            total: body.leaves.length,
            succeeded,
            failed,
          },
        },
      },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'INTERNAL_ERROR', message);
  }
});
