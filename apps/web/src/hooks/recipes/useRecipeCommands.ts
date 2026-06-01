import { useCallback } from 'react';
import {
  createRecipe as createRecipeInfra,
  deleteRecipe as deleteRecipeInfra,
  listRecipes as listRecipesInfra,
  updateRecipe as updateRecipeInfra,
} from '@/infrastructure/recipes';
import type { CreateRecipeInput, Recipe, UpdateRecipeInput } from '@/types/api';

export function useRecipeCommands() {
  const listRecipes = useCallback((projectId: string): Promise<Recipe[]> => {
    return listRecipesInfra(projectId);
  }, []);

  const createRecipe = useCallback(
    (projectId: string, input: CreateRecipeInput): Promise<Recipe> => {
      return createRecipeInfra(projectId, input);
    },
    []
  );

  const updateRecipe = useCallback(
    (projectId: string, recipeId: string, input: UpdateRecipeInput): Promise<Recipe> => {
      return updateRecipeInfra(projectId, recipeId, input);
    },
    []
  );

  const deleteRecipe = useCallback((projectId: string, recipeId: string): Promise<void> => {
    return deleteRecipeInfra(projectId, recipeId);
  }, []);

  return {
    listRecipes,
    createRecipe,
    updateRecipe,
    deleteRecipe,
  };
}
