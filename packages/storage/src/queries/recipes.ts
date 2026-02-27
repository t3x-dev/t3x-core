/**
 * Recipe Queries
 *
 * CRUD operations for recipes table using Drizzle ORM.
 * Recipes define automated workflows triggered by T3X events.
 *
 * @see packages/storage/src/schema-v4.ts – recipes table
 */

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type RecipeRecord, recipes } from '../schema-v4';

// ============================================================
// Constants
// ============================================================

const ID_PREFIX = 'recipe_';
const ID_RANDOM_LENGTH = 12;

// ============================================================
// Types
// ============================================================

export interface RecipeOutput {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  trigger: {
    event: string;
    filter?: Record<string, string>;
  };
  steps: Array<{
    action: 'send_webhook' | 'run_eval' | 'export_report';
    config: Record<string, unknown>;
  }>;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateRecipeInput {
  projectId: string;
  name: string;
  description?: string;
  trigger: {
    event: string;
    filter?: Record<string, string>;
  };
  steps: Array<{
    action: 'send_webhook' | 'run_eval' | 'export_report';
    config: Record<string, unknown>;
  }>;
  enabled?: boolean;
}

export interface UpdateRecipeInput {
  name?: string;
  description?: string;
  trigger?: {
    event: string;
    filter?: Record<string, string>;
  };
  steps?: Array<{
    action: 'send_webhook' | 'run_eval' | 'export_report';
    config: Record<string, unknown>;
  }>;
  enabled?: boolean;
}

// ============================================================
// Internal Helpers
// ============================================================

function generateRecipeId(): string {
  return `${ID_PREFIX}${randomUUID().replace(/-/g, '').slice(0, ID_RANDOM_LENGTH)}`;
}

function rowToRecipe(row: RecipeRecord): RecipeOutput {
  return {
    id: row.id,
    project_id: row.project_id,
    name: row.name,
    description: row.description ?? null,
    trigger: row.trigger as RecipeOutput['trigger'],
    steps: row.steps as RecipeOutput['steps'],
    enabled: row.enabled,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

// ============================================================
// Query Functions
// ============================================================

/**
 * List recipes for a project.
 */
export async function listRecipesByProject(db: AnyDB, projectId: string): Promise<RecipeOutput[]> {
  const rows = await db.select().from(recipes).where(eq(recipes.project_id, projectId));

  return rows.map(rowToRecipe);
}

/**
 * Find a recipe by ID.
 */
export async function findRecipeById(db: AnyDB, id: string): Promise<RecipeOutput | null> {
  const [row] = await db.select().from(recipes).where(eq(recipes.id, id)).limit(1);
  return row ? rowToRecipe(row) : null;
}

/**
 * Create a new recipe.
 */
export async function createRecipe(db: AnyDB, input: CreateRecipeInput): Promise<RecipeOutput> {
  const id = generateRecipeId();
  const now = new Date();

  const [row] = await db
    .insert(recipes)
    .values({
      id,
      project_id: input.projectId,
      name: input.name,
      description: input.description ?? null,
      trigger: input.trigger,
      steps: input.steps,
      enabled: input.enabled ?? true,
      created_at: now,
      updated_at: now,
    })
    .returning();

  return rowToRecipe(row);
}

/**
 * Update a recipe.
 */
export async function updateRecipe(
  db: AnyDB,
  id: string,
  input: UpdateRecipeInput
): Promise<RecipeOutput | null> {
  const now = new Date();
  const updates: Record<string, unknown> = { updated_at: now };

  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.trigger !== undefined) updates.trigger = input.trigger;
  if (input.steps !== undefined) updates.steps = input.steps;
  if (input.enabled !== undefined) updates.enabled = input.enabled;

  const [row] = await db.update(recipes).set(updates).where(eq(recipes.id, id)).returning();

  return row ? rowToRecipe(row) : null;
}

/**
 * Delete a recipe.
 */
export async function deleteRecipe(db: AnyDB, id: string): Promise<boolean> {
  const [row] = await db.delete(recipes).where(eq(recipes.id, id)).returning();
  return !!row;
}

/**
 * Find all enabled recipes for a project that match a given event.
 */
export async function findRecipesByEvent(
  db: AnyDB,
  projectId: string,
  event: string
): Promise<RecipeOutput[]> {
  const rows = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.project_id, projectId), eq(recipes.enabled, true)));

  return rows
    .filter((r) => {
      const trigger = r.trigger as { event: string; filter?: Record<string, string> };
      return trigger?.event === event;
    })
    .map(rowToRecipe);
}
