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
import {
  AllProvidersFailedError,
  collectResult,
  GenerationError,
  type GenerationMode,
  runOperation,
  validateConstraints,
  validateConstraintsExactOnly,
} from '@t3x-dev/core';
import { createLeaf, findLeafById, getCommitUnified, updateLeaf } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { getEmbedder, isSemanticValidationConfigured } from '../lib/embedder';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { resolveProviderAndModel } from '../lib/provider-resolver';
import { getUserId } from '../lib/usage-tracking';
import { webhookDispatcher } from '../lib/webhook-dispatcher';
import { buildPipelineContext } from '../ops/context';
import { leafGenerateOp } from '../ops/leaf-gen';
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
// Route Definitions
// ============================================================

// POST /v1/leaves/:id/generate - Generate output
const generateLeafRoute = createRoute({
  method: 'post',
  path: '/v1/leaves/{id}/generate',
  tags: ['Leaves'],
  summary: 'Generate leaf output',
  description:
    'Generates output for a leaf using the Claude API based on commit nodes and constraints.',
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
      description: 'Generation not configured',
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
      description: 'Rate limited by upstream model provider',
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
    const db = await getDB();

    // Pre-flight: verify leaf exists and project access before entering pipeline
    const leaf = await findLeafById(db, id);
    if (!leaf) {
      return errorResponse(c, 'LEAF_NOT_FOUND', `Leaf not found: ${id}`);
    }
    const accessResult = await assertProjectAccess(c, db, leaf.project_id);
    if (accessResult instanceof Response) return accessResult;

    const providerResolution = await resolveProviderAndModel({
      db,
      projectId: leaf.project_id,
      userId: getUserId(c) ?? undefined,
      unavailableMessage: 'No configured generation provider is available',
    });
    if (!providerResolution.ok) {
      return errorResponse(c, 'GENERATION_NOT_CONFIGURED', providerResolution.message);
    }

    // Run the unified pipeline operation
    const pipelineCtx = await buildPipelineContext(c, leaf.project_id);
    const result = await collectResult(
      runOperation(
        leafGenerateOp,
        {
          leafId: id,
          mode,
          userId: getUserId(c) ?? undefined,
          stylePreferences,
        },
        pipelineCtx
      )
    );

    // Fire webhook event (fire-and-forget)
    webhookDispatcher.dispatch(
      'leaf.generated',
      { leaf_id: id, project_id: leaf.project_id },
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
          output: result.output,
          generated_at: result.generated_at,
          ...(result.validation ? { validation: result.validation } : {}),
          ...(result.rounds
            ? {
                rounds: result.rounds,
                total_rounds: result.total_rounds,
                mode: result.mode,
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

    // Pipeline ops throw plain Errors for not-found resources — map to 404
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('not found')) {
      if (message.includes('Leaf not found')) {
        return errorResponse(c, 'LEAF_NOT_FOUND', message);
      }
      if (message.includes('commit not found') || message.includes('Commit not found')) {
        return errorResponse(c, 'COMMIT_NOT_FOUND', message);
      }
    }

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
    // 2. Check generation configuration if generation is needed
    const needsGeneration = !body.skip_generation;
    if (needsGeneration) {
      const providerResolution = await resolveProviderAndModel({
        db,
        projectId: body.project_id,
        userId: getUserId(c) ?? undefined,
        unavailableMessage:
          'No configured generation provider is available. Use skip_generation=true to create leaves without generating output.',
      });
      if (!providerResolution.ok) {
        return errorResponse(c, 'GENERATION_NOT_CONFIGURED', providerResolution.message);
      }
    }

    const pipelineCtx = needsGeneration ? await buildPipelineContext(c, body.project_id) : null;

    // 3. Process each leaf config sequentially (avoid rate limiting)
    for (const leafConfig of body.leaves) {
      try {
        // 3a. Create leaf (auto-generate title from commit message if not provided)
        const leafTitle =
          leafConfig.title ||
          `${unifiedCommit.message || decodedHash.slice(0, 16)} — ${leafConfig.type}`;
        const leaf = await createLeaf(db, {
          commit_hash: decodedHash,
          type: leafConfig.type,
          title: leafTitle,
          // biome-ignore lint/suspicious/noExplicitAny: generic error handler
          constraints: leafConfig.constraints as any,
          config: leafConfig.config ?? {},
          project_id: body.project_id,
        });

        // 3b. Generate output if not skipped
        if (needsGeneration) {
          try {
            const result = await collectResult(
              runOperation(
                leafGenerateOp,
                {
                  leafId: leaf.id,
                  mode: 'fast',
                  userId: getUserId(c) ?? undefined,
                },
                pipelineCtx!
              )
            );
            results.push({
              leaf: result.leaf ? toApiLeaf(result.leaf) : toApiLeaf(leaf),
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
