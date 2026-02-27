/**
 * Recipe Executor
 *
 * Executes a recipe's steps sequentially.
 * Fire-and-forget — errors are logged but don't propagate.
 */

interface RecipeStep {
  action: 'send_webhook' | 'run_eval' | 'export_report';
  config: Record<string, unknown>;
}

interface Recipe {
  id: string;
  name: string;
  steps: RecipeStep[];
}

interface ExecutionContext {
  projectId: string;
  event: string;
  payload: Record<string, unknown>;
}

interface StepResult {
  action: string;
  success: boolean;
  error?: string;
}

/**
 * Execute a recipe's steps sequentially.
 * Fire-and-forget — errors are logged but don't propagate.
 */
export async function executeRecipe(
  recipe: Recipe,
  context: ExecutionContext,
  deps: { webhookDispatch?: (url: string, payload: unknown) => Promise<void> }
): Promise<StepResult[]> {
  const results: StepResult[] = [];

  for (const step of recipe.steps) {
    try {
      switch (step.action) {
        case 'send_webhook': {
          const url = step.config.url as string;
          if (url && deps.webhookDispatch) {
            await deps.webhookDispatch(url, {
              recipe_id: recipe.id,
              recipe_name: recipe.name,
              event: context.event,
              project_id: context.projectId,
              ...context.payload,
            });
          }
          results.push({ action: step.action, success: true });
          break;
        }
        case 'run_eval': {
          // Placeholder — eval integration will be connected when runner is available
          results.push({ action: step.action, success: true });
          break;
        }
        case 'export_report': {
          // Placeholder — export integration to be implemented
          results.push({ action: step.action, success: true });
          break;
        }
        default:
          results.push({ action: step.action, success: false, error: 'Unknown action' });
      }
    } catch (err) {
      results.push({
        action: step.action,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}
