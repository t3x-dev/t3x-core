/**
 * Recipes API client
 */

import { API_V1, fetchWithTimeout, handleResponse } from './core';

// ============================================================================
// Types
// ============================================================================

export interface RecipeTrigger {
  event: string;
  filter?: Record<string, string>;
}

export interface RecipeStep {
  action: 'send_webhook' | 'run_eval' | 'export_report';
  config: Record<string, unknown>;
}

export interface Recipe {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  trigger: RecipeTrigger;
  steps: RecipeStep[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateRecipeInput {
  name: string;
  description?: string;
  trigger: RecipeTrigger;
  steps: RecipeStep[];
  enabled?: boolean;
}

export interface UpdateRecipeInput {
  name?: string;
  description?: string;
  trigger?: RecipeTrigger;
  steps?: RecipeStep[];
  enabled?: boolean;
}

// ============================================================================
// API Functions
// ============================================================================

export async function listRecipes(projectId: string): Promise<Recipe[]> {
  const res = await fetchWithTimeout(`${API_V1}/projects/${encodeURIComponent(projectId)}/recipes`);
  return handleResponse<Recipe[]>(res);
}

export async function createRecipe(projectId: string, input: CreateRecipeInput): Promise<Recipe> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/recipes`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
  return handleResponse<Recipe>(res);
}

export async function updateRecipe(
  projectId: string,
  recipeId: string,
  input: UpdateRecipeInput
): Promise<Recipe> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/recipes/${encodeURIComponent(recipeId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
  return handleResponse<Recipe>(res);
}

export async function deleteRecipe(projectId: string, recipeId: string): Promise<void> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/recipes/${encodeURIComponent(recipeId)}`,
    { method: 'DELETE' }
  );
  await handleResponse(res);
}
