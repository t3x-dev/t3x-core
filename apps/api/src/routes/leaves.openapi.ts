/**
 * Leaves Routes with OpenAPI
 *
 * REST API endpoints for Leaf nodes with OpenAPI documentation.
 * Leaves contain constraints, output, and validation results.
 *
 * Endpoints:
 * - POST   /v1/leaves                        - Create a new leaf
 * - GET    /v1/leaves/:id                    - Get leaf by ID
 * - GET    /v1/commits/:hash/leaves          - List leaves by commit
 * - GET    /v1/projects/:projectId/leaves    - List leaves by project
 * - PATCH  /v1/leaves/:id                    - Update leaf
 * - DELETE /v1/leaves/:id                    - Delete leaf
 * - POST   /v1/leaves/:id/generate           - Generate output
 * - POST   /v1/leaves/:id/validate           - Validate output
 * - POST   /v1/commits/:hash/leaves/batch    - Batch create and generate leaves
 * - POST   /v1/leaves/:id/suggest-constraints - Suggest constraints via LLM
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Leaf, LeafHistory } from '@t3x/core';
// Generation functions (provided by @t3x/core)
import {
  AllProvidersFailedError,
  collectLessons,
  GenerationError,
  generateLeafOutput,
  isGenerationConfigured,
  suggestConstraints,
  suggestionsToConstraints,
  validateConstraints,
  validateConstraintsExactOnly,
} from '@t3x/core';
// Storage functions (provided by @t3x/storage)
import {
  createLeaf,
  createLeafHistory,
  deleteLeaf,
  deleteLeafHistory,
  deletePinByRef,
  findCommitV4ByHash,
  findEditsByLeafId,
  findHistoryByLeafId,
  findLeafById,
  findLeafHistoryById,
  findLeavesByCommit,
  findLeavesByProject,
  insertLeafOutputEdit,
  updateLeaf,
  updateLeafAtomic,
  updateLeafOutput,
} from '@t3x/storage/pglite';
import { getDB } from '../lib/db';
import { getEmbedder, isSemanticValidationConfigured } from '../lib/embedder';
import { errorResponse, zodErrorHook } from '../lib/errors';
import {
  generateWithFallback,
  getLLMProvider,
  getProviderRegistry,
} from '../lib/provider-registry';
import { webhookDispatcher } from '../lib/webhook-dispatcher';
import { pinoLogger } from '../middleware/logger';
import { extractSentencesFromLeafOutput } from '../routes/extract.openapi';
import { ErrorResponseSchema, IdParamSchema, SuccessResponseSchema } from '../schemas/common';
import {
  BatchGenerateRequest,
  BatchGenerateResponse,
  CreateLeafRequest,
  DeleteLeafHistoryResponse,
  GenerateLeafOutputRequest,
  GenerateLeafOutputResponse,
  LeafHistoryResponse,
  LeafResponse,
  RestoreLeafOutputRequest,
  UpdateLeafRequest,
  ValidateLeafOutputRequest,
  ValidateLeafOutputResponse,
} from '../schemas/v4-contracts';
import { pushNotification } from './notifications.openapi';

export const leavesRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Response helpers
// ============================================================

/**
 * Convert storage Leaf to API response format
 * Storage returns Leaf (snake_case), API uses snake_case with null for missing values
 */
function toApiLeaf(leaf: Leaf) {
  return {
    id: leaf.id,
    commit_hash: leaf.commit_hash,
    type: leaf.type,
    title: leaf.title ?? null,
    constraints: leaf.constraints ?? [],
    config: leaf.config ?? {},
    output: leaf.output ?? null,
    generated_at: leaf.generated_at ?? null,
    assertions: leaf.assertions ?? null,
    runner_assertions: leaf.runner_assertions ?? null,
    project_id: leaf.project_id,
    created_at: leaf.created_at,
    created_by: leaf.created_by ?? null,
  };
}

/**
 * Convert storage LeafHistory to API response format
 */
function toApiLeafHistory(history: LeafHistory) {
  return {
    id: history.id,
    leaf_id: history.leaf_id,
    output: history.output,
    config: history.config,
    model: history.model,
    generated_at: history.generated_at,
    created_by: history.created_by ?? null,
  };
}

// ============================================================
// Route Definitions
// ============================================================

// POST /v1/leaves - Create leaf
const createLeafRoute = createRoute({
  method: 'post',
  path: '/v1/leaves',
  tags: ['Leaves'],
  summary: 'Create a new leaf',
  description: 'Creates a new leaf node with constraints and configuration.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateLeafRequest,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Leaf created successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(LeafResponse),
        },
      },
    },
    400: {
      description: 'Invalid request',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'Commit or project not found',
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

// GET /v1/leaves/:id - Get leaf by ID
const getLeafRoute = createRoute({
  method: 'get',
  path: '/v1/leaves/{id}',
  tags: ['Leaves'],
  summary: 'Get leaf by ID',
  description: 'Retrieves a leaf node by its unique ID.',
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      description: 'Leaf found',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(LeafResponse),
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
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// GET /v1/commits/:hash/leaves - List leaves by commit
const listLeavesByCommitRoute = createRoute({
  method: 'get',
  path: '/v1/commits/{hash}/leaves',
  tags: ['Leaves'],
  summary: 'List leaves by commit',
  description: 'Lists all leaf nodes associated with a specific commit.',
  request: {
    params: z.object({
      hash: z.string().min(1),
    }),
    query: z.object({
      type: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(1000).default(100),
      offset: z.coerce.number().int().min(0).default(0),
    }),
  },
  responses: {
    200: {
      description: 'List of leaves',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(LeafResponse)),
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

// GET /v1/projects/:projectId/leaves - List leaves by project
const listLeavesByProjectRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/leaves',
  tags: ['Leaves'],
  summary: 'List leaves by project',
  description: 'Lists all leaf nodes in a project.',
  request: {
    params: z.object({
      projectId: z.string().min(1),
    }),
    query: z.object({
      type: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(1000).default(100),
      offset: z.coerce.number().int().min(0).default(0),
    }),
  },
  responses: {
    200: {
      description: 'List of leaves',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(LeafResponse)),
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

// PATCH /v1/leaves/:id - Update leaf
const updateLeafRoute = createRoute({
  method: 'patch',
  path: '/v1/leaves/{id}',
  tags: ['Leaves'],
  summary: 'Update leaf',
  description: 'Updates a leaf node (title, constraints, config, output).',
  request: {
    params: IdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: UpdateLeafRequest,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Leaf updated successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(LeafResponse),
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
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// DELETE /v1/leaves/:id - Delete leaf
const deleteLeafRoute = createRoute({
  method: 'delete',
  path: '/v1/leaves/{id}',
  tags: ['Leaves'],
  summary: 'Delete leaf',
  description: 'Deletes a leaf node by its ID.',
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      description: 'Leaf deleted successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              deleted: z.literal(true),
              id: z.string(),
            })
          ),
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
// Leaf History Route Definitions
// ============================================================

// GET /v1/leaves/:id/history - List history for a leaf
const listLeafHistoryRoute = createRoute({
  method: 'get',
  path: '/v1/leaves/{id}/history',
  tags: ['Leaves'],
  summary: 'List generation history',
  description: 'Lists all generation history entries for a leaf, ordered by most recent first.',
  request: {
    params: IdParamSchema,
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).default(20),
      offset: z.coerce.number().int().min(0).default(0),
    }),
  },
  responses: {
    200: {
      description: 'History list',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(LeafHistoryResponse)),
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
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// POST /v1/leaves/:id/restore - Restore output from history
const restoreLeafOutputRoute = createRoute({
  method: 'post',
  path: '/v1/leaves/{id}/restore',
  tags: ['Leaves'],
  summary: 'Restore output from history',
  description: 'Restores a previous output version to the leaf.',
  request: {
    params: IdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: RestoreLeafOutputRequest,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Output restored successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(LeafResponse),
        },
      },
    },
    400: {
      description: 'History entry does not belong to this leaf',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'Leaf or history not found',
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

// DELETE /v1/leaf-history/:id - Delete a history entry
const deleteLeafHistoryRoute = createRoute({
  method: 'delete',
  path: '/v1/leaf-history/{id}',
  tags: ['Leaves'],
  summary: 'Delete history entry',
  description: 'Deletes a specific generation history entry.',
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      description: 'History entry deleted successfully',
      content: {
        'application/json': {
          schema: DeleteLeafHistoryResponse,
        },
      },
    },
    404: {
      description: 'History entry not found',
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

// POST /v1/leaves - Create leaf
leavesRoutes.openapi(createLeafRoute, async (c) => {
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    // Auto-generate title from commit message if not provided
    let title = body.title;
    if (!title) {
      const commit = await findCommitV4ByHash(db, body.commit_hash);
      const msg = commit?.message || body.commit_hash.slice(0, 16);
      title = `${msg} — ${body.type}`;
    }

    // Create leaf in database (storage generates IDs for leaf and constraints)
    const leaf = await createLeaf(db, {
      commit_hash: body.commit_hash,
      type: body.type,
      title,
      constraints: body.constraints,
      config: body.config ?? {},
      project_id: body.project_id,
    });

    // Fire webhook event (fire-and-forget)
    webhookDispatcher.dispatch(
      'leaf.created',
      {
        leaf_id: leaf.id,
        project_id: body.project_id,
        type: body.type,
        commit_hash: body.commit_hash,
      },
      body.project_id
    );

    return c.json({ success: true as const, data: toApiLeaf(leaf) }, 201);
  } catch (err) {
    // Handle PostgreSQL foreign key violation (commit or project not found)
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23503') {
      return errorResponse(c, 'REFERENCE_NOT_FOUND', 'Referenced commit or project not found');
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'CREATE_FAILED', message);
  }
});

// GET /v1/leaves/:id - Get leaf by ID
leavesRoutes.openapi(getLeafRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();
    const leaf = await findLeafById(db, id);

    if (!leaf) {
      return errorResponse(c, 'LEAF_NOT_FOUND', `Leaf not found: ${id}`);
    }

    return c.json({ success: true as const, data: toApiLeaf(leaf) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
  }
});

// GET /v1/commits/:hash/leaves - List leaves by commit
leavesRoutes.openapi(listLeavesByCommitRoute, async (c) => {
  const { hash } = c.req.valid('param');
  const { type, limit, offset } = c.req.valid('query');
  const decodedHash = decodeURIComponent(hash);

  try {
    const db = await getDB();
    const leaves = await findLeavesByCommit(db, decodedHash, { type, limit, offset });

    return c.json({ success: true as const, data: leaves.map(toApiLeaf) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'LIST_FAILED', message);
  }
});

// POST /v1/commits/:hash/leaves/batch - Batch create and generate leaves
leavesRoutes.openapi(batchGenerateRoute, async (c) => {
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

    // 1. Verify commit exists
    const commit = await findCommitV4ByHash(db, decodedHash);
    if (!commit) {
      return errorResponse(c, 'COMMIT_NOT_FOUND', `Commit not found: ${decodedHash}`);
    }

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

// GET /v1/projects/:projectId/leaves - List leaves by project
leavesRoutes.openapi(listLeavesByProjectRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const { type, limit, offset } = c.req.valid('query');

  try {
    const db = await getDB();
    const leaves = await findLeavesByProject(db, projectId, { type, limit, offset });

    return c.json({ success: true as const, data: leaves.map(toApiLeaf) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'LIST_FAILED', message);
  }
});

// PATCH /v1/leaves/:id - Update leaf
leavesRoutes.openapi(updateLeafRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    // Track output edits for reverse learning (Item 17)
    // If the user is changing the output, record the before/after
    if (body.output !== undefined) {
      const existing = await findLeafById(db, id);
      if (existing?.output && existing.output !== body.output) {
        insertLeafOutputEdit(db, {
          leaf_id: id,
          project_id: existing.project_id,
          original_output: existing.output,
          modified_output: body.output,
        }).catch((err) => {
          pinoLogger.warn({ err, leafId: id }, 'failed to track leaf output edit');
        });
      }
    }

    // Use atomic update to wrap all changes in a transaction
    const leaf = await updateLeafAtomic(db, id, {
      title: body.title,
      constraints: body.constraints,
      config: body.config,
      output: body.output,
    });

    if (!leaf) {
      return errorResponse(c, 'LEAF_NOT_FOUND', `Leaf not found: ${id}`);
    }

    return c.json({ success: true as const, data: toApiLeaf(leaf) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'UPDATE_FAILED', message);
  }
});

// ============================================================
// Generation & Validation Routes (GEN-* / VAL-* adds here)
// ============================================================

// POST /v1/leaves/:id/generate - Generate output
// Note: Using contract schemas from v4-contracts.ts
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

// POST /v1/leaves/:id/generate - Generate output handler
leavesRoutes.openapi(generateLeafRoute, async (c) => {
  const { id } = c.req.valid('param');
  // Note: Request body per contract is empty object (future: additional options)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _body = c.req.valid('json');

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

    // Get source commit by hash (V4 only)
    const commit = await findCommitV4ByHash(db, leaf.commit_hash);
    if (!commit) {
      return errorResponse(c, 'COMMIT_NOT_FOUND', `Source commit not found: ${leaf.commit_hash}`);
    }

    // Collect lessons from historical leaves on the same commit (#4 feedback loop)
    const historicalLeaves = await findLeavesByCommit(db, leaf.commit_hash);
    const lessons = collectLessons(historicalLeaves);

    // Generate with automatic provider fallback
    const result = await generateWithFallback({
      commit,
      leaf,
      lessons: lessons.length > 0 ? lessons : undefined,
      additionalInstructions:
        typeof leaf.config?.user_instruction === 'string'
          ? leaf.config.user_instruction
          : undefined,
    });

    // Update leaf with output (storage sets generated_at automatically)
    const updatedLeaf = await updateLeafOutput(db, id, result.output);

    if (!updatedLeaf) {
      return errorResponse(c, 'UPDATE_FAILED', 'Failed to update leaf with generated output');
    }

    // If auto-validation produced assertions, store them on the leaf
    // Capture the return value so the final response reflects the updated assertions
    if (result.validation) {
      const leafWithAssertions = await updateLeaf(db, id, {
        assertions: result.validation.assertions,
      });
      if (leafWithAssertions) {
        Object.assign(updatedLeaf, leafWithAssertions);
      }
    }

    // Save to generation history (non-blocking - don't fail if history save fails)
    try {
      await createLeafHistory(db, {
        leaf_id: id,
        output: result.output,
        config: leaf.config ?? {},
        model: result.model,
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
      message: `Leaf "${leaf.title || id}" output generated`,
      project_id: leaf.project_id,
      ref_id: id,
    });

    // Return response according to contract (v4-contracts.ts)
    // Use the generated_at from the updated leaf for consistency
    return c.json(
      {
        success: true as const,
        data: {
          output: result.output,
          generated_at: updatedLeaf.generated_at ?? new Date().toISOString(),
          ...(result.validation
            ? {
                validation: {
                  all_passed: result.validation.allPassed,
                  passed_count: result.validation.passedCount,
                  failed_count: result.validation.failedCount,
                  attempts: result.attempts,
                },
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

// POST /v1/leaves/:id/validate - Validate output handler
leavesRoutes.openapi(validateLeafRoute, async (c) => {
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

// DELETE /v1/leaves/:id - Delete leaf
leavesRoutes.openapi(deleteLeafRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();

    // Fetch leaf first to obtain project_id needed for pin cleanup.
    // Then immediately attempt delete — if it returns false (concurrent delete),
    // return 404. Pin cleanup only runs when delete actually succeeds.
    const leaf = await findLeafById(db, id);

    const deleted = await deleteLeaf(db, id);

    if (!deleted) {
      // Leaf was not found (either never existed or concurrently deleted)
      return errorResponse(c, 'LEAF_NOT_FOUND', `Leaf not found: ${id}`);
    }

    // Clean up associated pins only when delete succeeded
    if (leaf) {
      await deletePinByRef(db, leaf.project_id, 'leaf', id);
    }

    return c.json({ success: true as const, data: { deleted: true as const, id } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'DELETE_FAILED', message);
  }
});

// ============================================================
// Leaf History Route Handlers
// ============================================================

// GET /v1/leaves/:id/history - List generation history
leavesRoutes.openapi(listLeafHistoryRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { limit, offset } = c.req.valid('query');

  try {
    const db = await getDB();

    // First verify the leaf exists
    const leaf = await findLeafById(db, id);
    if (!leaf) {
      return errorResponse(c, 'LEAF_NOT_FOUND', `Leaf not found: ${id}`);
    }

    // Get history entries
    const history = await findHistoryByLeafId(db, id, { limit, offset });

    return c.json({ success: true as const, data: history.map(toApiLeafHistory) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'LIST_FAILED', message);
  }
});

// POST /v1/leaves/:id/restore - Restore output from history
leavesRoutes.openapi(restoreLeafOutputRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { history_id } = c.req.valid('json');

  try {
    const db = await getDB();

    // 1. Verify the leaf exists
    const leaf = await findLeafById(db, id);
    if (!leaf) {
      return errorResponse(c, 'LEAF_NOT_FOUND', `Leaf not found: ${id}`);
    }

    // 2. Get the history entry
    const history = await findLeafHistoryById(db, history_id);
    if (!history) {
      return errorResponse(c, 'HISTORY_NOT_FOUND', `History entry not found: ${history_id}`);
    }

    // 3. Verify the history belongs to this leaf
    if (history.leaf_id !== id) {
      return errorResponse(
        c,
        'HISTORY_MISMATCH',
        `History entry ${history_id} does not belong to leaf ${id}`
      );
    }

    // 4. Update leaf with the restored output
    const updatedLeaf = await updateLeafOutput(db, id, history.output);
    if (!updatedLeaf) {
      return errorResponse(c, 'UPDATE_FAILED', 'Failed to restore output');
    }

    return c.json({ success: true as const, data: toApiLeaf(updatedLeaf) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'RESTORE_FAILED', message);
  }
});

// DELETE /v1/leaf-history/:id - Delete a history entry
leavesRoutes.openapi(deleteLeafHistoryRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();

    // Delete the history entry
    const deleted = await deleteLeafHistory(db, id);

    if (!deleted) {
      return errorResponse(c, 'HISTORY_NOT_FOUND', `History entry not found: ${id}`);
    }

    return c.json({ success: true as const, data: { deleted: true as const, id } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'DELETE_FAILED', message);
  }
});

// ============================================================
// POST /v1/leaves/:id/compare - Compare models
// ============================================================

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

leavesRoutes.openapi(compareModelsRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { models } = c.req.valid('json');

  try {
    const db = await getDB();

    const leaf = await findLeafById(db, id);
    if (!leaf) {
      return errorResponse(c, 'LEAF_NOT_FOUND', `Leaf not found: ${id}`);
    }

    const commit = await findCommitV4ByHash(db, leaf.commit_hash);
    if (!commit) {
      return errorResponse(c, 'COMMIT_NOT_FOUND', `Source commit not found: ${leaf.commit_hash}`);
    }

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
            commit,
            leaf,
            provider: resolved.provider,
            additionalInstructions,
          });

          const latencyMs = Date.now() - start;

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

// ═══════════════════════════════════════════════════════════════════════════
// POST /v1/leaves/:id/suggest-constraints — Suggest constraints via LLM
// ═══════════════════════════════════════════════════════════════════════════

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

const suggestConstraintsRoute = createRoute({
  method: 'post',
  path: '/v1/leaves/{id}/suggest-constraints',
  tags: ['Leaves'],
  summary: 'Suggest constraints via LLM',
  description:
    'Uses LLM to analyze commit sentences and suggest appropriate require/exclude constraints for the leaf type.',
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

leavesRoutes.openapi(suggestConstraintsRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();
    const leaf = await findLeafById(db, id);
    if (!leaf) {
      return errorResponse(c, 'NOT_FOUND', `Leaf ${id} not found`);
    }

    const commit = await findCommitV4ByHash(db, leaf.commit_hash);
    if (!commit) {
      return errorResponse(c, 'NOT_FOUND', `Commit ${leaf.commit_hash} not found`);
    }

    const sentences = commit.content.sentences;
    if (sentences.length === 0) {
      return c.json(
        {
          success: true as const,
          data: { suggestions: [], constraints: [], model: 'none' },
        },
        200
      );
    }

    const registry = await getProviderRegistry();
    const result = await registry.tryWithFallback(
      'generation',
      async (provider: {
        id: string;
        generate: (prompt: string, options?: Record<string, unknown>) => Promise<string>;
      }) => {
        return suggestConstraints(
          provider as Parameters<typeof suggestConstraints>[0],
          sentences,
          leaf.type,
          {
            maxSuggestions: body.max_suggestions,
            instructions: body.instructions,
          }
        );
      }
    );

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

// ═══════════════════════════════════════════════════════════════════════════
// POST /v1/leaves/:id/extract-sentences — Extract sentences from leaf output
// ═══════════════════════════════════════════════════════════════════════════

const ExtractFromLeafRequest = z.object({
  max_sentences: z.number().int().min(1).max(50).optional().openapi({
    description: 'Maximum number of sentences to extract (default: 20)',
  }),
});

const ExtractFromLeafResponse = z.object({
  success: z.literal(true),
  data: z.object({
    sentences: z.array(
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

const extractFromLeafRoute = createRoute({
  method: 'post',
  path: '/v1/leaves/{id}/extract-sentences',
  tags: ['Leaves'],
  summary: 'Extract sentences from leaf output',
  description:
    "Uses LLM to extract structured knowledge sentences from a leaf's generated output. Enables the Leaf → Commit feedback loop.",
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
      description: 'Sentences extracted from leaf output',
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

leavesRoutes.openapi(extractFromLeafRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();
    const leaf = await findLeafById(db, id);
    if (!leaf) {
      return errorResponse(c, 'NOT_FOUND', `Leaf ${id} not found`);
    }

    if (!leaf.output) {
      return errorResponse(c, 'NO_OUTPUT', `Leaf ${id} has no generated output to extract from`);
    }

    const result = await extractSentencesFromLeafOutput(id, leaf.output, {
      max_sentences: body.max_sentences,
    });

    return c.json(
      {
        success: true as const,
        data: {
          sentences: result.sentences,
          model: result.model,
          stats: result.stats,
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
            message: 'No LLM provider is configured.',
          },
        },
        503
      );
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GENERATION_FAILED', message);
  }
});

// ============================================================================
// POST /v1/leaves/:id/learn-from-edits — Learn constraints from user output edits
// ============================================================================

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

leavesRoutes.openapi(learnFromEditsRoute, async (c) => {
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

    const raw = await llm.generate(prompt, { temperature: 0.3, maxTokens: 2000 });

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

// ============================================================================
// POST /v1/leaves/:id/reverse-learn — Learn constraints from failed assertions
// ============================================================================

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

leavesRoutes.openapi(reverseLearnRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();
    const leaf = await findLeafById(db, id);
    if (!leaf) {
      return errorResponse(c, 'NOT_FOUND', `Leaf ${id} not found`);
    }

    const commit = await findCommitV4ByHash(db, leaf.commit_hash);
    if (!commit) {
      return errorResponse(c, 'NOT_FOUND', `Commit ${leaf.commit_hash} not found`);
    }

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

    const result = await suggestConstraints(llm, commit.content.sentences, leaf.type, {
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

export default leavesRoutes;
