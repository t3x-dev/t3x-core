/**
 * Recipe Routes with OpenAPI
 *
 * Endpoints:
 * - GET    /v1/projects/:projectId/recipes              - List recipes
 * - POST   /v1/projects/:projectId/recipes              - Create recipe
 * - PATCH  /v1/projects/:projectId/recipes/:recipeId    - Update recipe
 * - DELETE /v1/projects/:projectId/recipes/:recipeId    - Delete recipe
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  createRecipe,
  deleteRecipe,
  findRecipeById,
  listRecipesByProject,
  updateRecipe,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

// ============================================================
// Schemas
// ============================================================

const RecipeStepSchema = z.object({
  action: z.enum(['send_webhook', 'run_eval', 'export_report']),
  config: z.record(z.string(), z.unknown()),
});

const RecipeTriggerSchema = z.object({
  event: z
    .string()
    .min(1)
    .openapi({ description: 'Event name, e.g. merge.completed, leaf.generated, commit.created' }),
  filter: z
    .record(z.string(), z.string())
    .optional()
    .openapi({ description: 'Optional event field filters' }),
});

const RecipeResponseSchema = z
  .object({
    id: z.string(),
    project_id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    trigger: RecipeTriggerSchema,
    steps: z.array(RecipeStepSchema),
    enabled: z.boolean(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi('RecipeResponse');

const CreateRecipeRequest = z
  .object({
    name: z.string().min(1).max(200).openapi({ description: 'Recipe name' }),
    description: z.string().max(1000).optional().openapi({ description: 'Recipe description' }),
    trigger: RecipeTriggerSchema.openapi({ description: 'Event trigger configuration' }),
    steps: z
      .array(RecipeStepSchema)
      .min(1)
      .openapi({ description: 'Ordered list of actions to execute' }),
    enabled: z
      .boolean()
      .optional()
      .default(true)
      .openapi({ description: 'Whether the recipe is active' }),
  })
  .openapi('CreateRecipeRequest');

const UpdateRecipeRequest = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).optional(),
    trigger: RecipeTriggerSchema.optional(),
    steps: z.array(RecipeStepSchema).min(1).optional(),
    enabled: z.boolean().optional(),
  })
  .openapi('UpdateRecipeRequest');

const ProjectIdParam = z.object({
  projectId: z.string().min(1),
});

const RecipeIdParam = z.object({
  projectId: z.string().min(1),
  recipeId: z.string().min(1),
});

export const recipesRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// GET /v1/projects/:projectId/recipes — List recipes
// ============================================================

const listRecipesRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/recipes',
  tags: ['Recipes'],
  summary: 'List recipes for a project',
  description: 'Returns all workflow recipes belonging to a project.',
  request: {
    params: ProjectIdParam,
  },
  responses: {
    200: {
      description: 'List of recipes',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(RecipeResponseSchema)),
        },
      },
    },
  },
});

recipesRoutes.openapi(listRecipesRoute, async (c) => {
  const { projectId } = c.req.valid('param');

  try {
    const db = await getDB();
    const recipes = await listRecipesByProject(db, projectId);
    return c.json({ success: true as const, data: recipes });
  } catch (_err) {
    return errorResponse(c, 'LIST_FAILED', 'Failed to list recipes');
  }
});

// ============================================================
// POST /v1/projects/:projectId/recipes — Create recipe
// ============================================================

const createRecipeRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/recipes',
  tags: ['Recipes'],
  summary: 'Create a workflow recipe',
  description: 'Creates a new recipe that executes actions when the specified event fires.',
  request: {
    params: ProjectIdParam,
    body: {
      content: { 'application/json': { schema: CreateRecipeRequest } },
    },
  },
  responses: {
    201: {
      description: 'Recipe created',
      content: {
        'application/json': { schema: SuccessResponseSchema(RecipeResponseSchema) },
      },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

recipesRoutes.openapi(createRecipeRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();
    const recipe = await createRecipe(db, {
      projectId,
      name: body.name,
      description: body.description,
      trigger: body.trigger,
      steps: body.steps,
      enabled: body.enabled,
    });

    return c.json({ success: true as const, data: recipe }, 201);
  } catch (_err) {
    return errorResponse(c, 'CREATE_FAILED', 'Failed to create recipe');
  }
});

// ============================================================
// PATCH /v1/projects/:projectId/recipes/:recipeId — Update recipe
// ============================================================

const updateRecipeRoute = createRoute({
  method: 'patch',
  path: '/v1/projects/{projectId}/recipes/{recipeId}',
  tags: ['Recipes'],
  summary: 'Update a recipe',
  description: 'Update recipe name, trigger, steps, or enabled status.',
  request: {
    params: RecipeIdParam,
    body: {
      content: { 'application/json': { schema: UpdateRecipeRequest } },
    },
  },
  responses: {
    200: {
      description: 'Recipe updated',
      content: {
        'application/json': { schema: SuccessResponseSchema(RecipeResponseSchema) },
      },
    },
    404: {
      description: 'Recipe not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

recipesRoutes.openapi(updateRecipeRoute, async (c) => {
  const { recipeId } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    const existing = await findRecipeById(db, recipeId);
    if (!existing) {
      return errorResponse(c, 'NOT_FOUND', `Recipe not found: ${recipeId}`);
    }

    const updated = await updateRecipe(db, recipeId, body);
    if (!updated) {
      return errorResponse(c, 'UPDATE_FAILED', 'Failed to update recipe');
    }

    return c.json({ success: true as const, data: updated });
  } catch (_err) {
    return errorResponse(c, 'UPDATE_FAILED', 'Failed to update recipe');
  }
});

// ============================================================
// DELETE /v1/projects/:projectId/recipes/:recipeId — Delete recipe
// ============================================================

const deleteRecipeRoute = createRoute({
  method: 'delete',
  path: '/v1/projects/{projectId}/recipes/{recipeId}',
  tags: ['Recipes'],
  summary: 'Delete a recipe',
  description: 'Permanently removes a workflow recipe.',
  request: {
    params: RecipeIdParam,
  },
  responses: {
    200: {
      description: 'Recipe deleted',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ deleted: z.boolean() })),
        },
      },
    },
    404: {
      description: 'Recipe not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

recipesRoutes.openapi(deleteRecipeRoute, async (c) => {
  const { recipeId } = c.req.valid('param');

  try {
    const db = await getDB();

    const existing = await findRecipeById(db, recipeId);
    if (!existing) {
      return errorResponse(c, 'NOT_FOUND', `Recipe not found: ${recipeId}`);
    }

    const deleted = await deleteRecipe(db, recipeId);
    if (!deleted) {
      return errorResponse(c, 'DELETE_FAILED', 'Failed to delete recipe');
    }

    return c.json({ success: true as const, data: { deleted: true } });
  } catch (_err) {
    return errorResponse(c, 'DELETE_FAILED', 'Failed to delete recipe');
  }
});
