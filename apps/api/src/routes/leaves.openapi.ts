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
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Leaf, LeafHistory } from '@t3x/core';
// Generation functions (provided by @t3x/core)
import {
  GenerationError,
  generateLeafOutput,
  isGenerationConfigured,
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
  findHistoryByLeafId,
  findLeafById,
  findLeafHistoryById,
  findLeavesByCommit,
  findLeavesByProject,
  updateLeaf,
  updateLeafOutput,
} from '@t3x/storage/pglite';
import { getDB } from '../lib/db';
import { getEmbedder, isSemanticValidationConfigured } from '../lib/embedder';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { ErrorResponseSchema, IdParamSchema, SuccessResponseSchema } from '../schemas/common';
import {
  BatchGenerateRequest,
  BatchGenerateResponse,
  BatchLeafResult,
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
  description: 'Updates a leaf node (title, constraints, config).',
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

    // Create leaf in database (storage generates IDs for leaf and constraints)
    const leaf = await createLeaf(db, {
      commit_hash: body.commit_hash,
      type: body.type,
      title: body.title,
      constraints: body.constraints,
      config: body.config ?? {},
      project_id: body.project_id,
    });

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
    if (needsGeneration && !isGenerationConfigured()) {
      return errorResponse(
        c,
        'GENERATION_NOT_CONFIGURED',
        'ANTHROPIC_API_KEY environment variable is not set. Use skip_generation=true to create leaves without generating output.'
      );
    }

    // 3. Process each leaf config sequentially (avoid rate limiting)
    for (const leafConfig of body.leaves) {
      try {
        // 3a. Create leaf
        const leaf = await createLeaf(db, {
          commit_hash: decodedHash,
          type: leafConfig.type,
          title: leafConfig.title,
          constraints: leafConfig.constraints,
          config: leafConfig.config ?? {},
          project_id: body.project_id,
        });

        // 3b. Generate output if not skipped
        if (needsGeneration) {
          try {
            const result = await generateLeafOutput({
              commit,
              leaf,
            });

            // Update leaf with output
            const updatedLeaf = await updateLeafOutput(db, leaf.id, result.output);

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

    // Storage handles constraint ID generation
    const leaf = await updateLeaf(db, id, {
      title: body.title,
      constraints: body.constraints,
      config: body.config,
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
    // Check if generation is configured
    if (!isGenerationConfigured()) {
      return errorResponse(
        c,
        'GENERATION_NOT_CONFIGURED',
        'ANTHROPIC_API_KEY environment variable is not set'
      );
    }

    const db = await getDB();

    // Get leaf by ID
    const leaf = await findLeafById(db, id);
    if (!leaf) {
      return errorResponse(c, 'LEAF_NOT_FOUND', `Leaf not found: ${id}`);
    }

    // Get source commit by hash
    const commit = await findCommitV4ByHash(db, leaf.commit_hash);
    if (!commit) {
      return errorResponse(c, 'COMMIT_NOT_FOUND', `Source commit not found: ${leaf.commit_hash}`);
    }

    // Call generateLeafOutput (uses defaults per contract)
    const result = await generateLeafOutput({
      commit,
      leaf,
    });

    // Update leaf with output (storage sets generated_at automatically)
    const updatedLeaf = await updateLeafOutput(db, id, result.output);

    if (!updatedLeaf) {
      return errorResponse(c, 'UPDATE_FAILED', 'Failed to update leaf with generated output');
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
      console.warn('Failed to save generation history:', historyErr);
    }

    // Return response according to contract (v4-contracts.ts)
    // Use the generated_at from the updated leaf for consistency
    return c.json(
      {
        success: true as const,
        data: {
          output: result.output,
          generated_at: updatedLeaf.generated_at!,
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

    // First, get the leaf to find its project_id for pin cleanup
    const leaf = await findLeafById(db, id);
    if (!leaf) {
      return errorResponse(c, 'LEAF_NOT_FOUND', `Leaf not found: ${id}`);
    }

    // Delete the leaf
    const deleted = await deleteLeaf(db, id);

    if (!deleted) {
      return errorResponse(c, 'LEAF_NOT_FOUND', `Leaf not found: ${id}`);
    }

    // Clean up associated pins (leaf pins that reference this leaf)
    await deletePinByRef(db, leaf.project_id, 'leaf', id);

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

export default leavesRoutes;
