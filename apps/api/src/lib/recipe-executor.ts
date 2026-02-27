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
  data?: Record<string, unknown>;
  error?: string;
}

interface RecipeDeps {
  webhookDispatch?: (url: string, payload: unknown) => Promise<void>;
  apiBaseUrl?: string;
}

/**
 * Execute a recipe's steps sequentially.
 * Fire-and-forget — errors are logged but don't propagate.
 */
export async function executeRecipe(
  recipe: Recipe,
  context: ExecutionContext,
  deps: RecipeDeps
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
          const leafId = (step.config.leaf_id as string) || (context.payload.leaf_id as string);
          if (!leafId) {
            results.push({
              action: step.action,
              success: false,
              error: 'Missing leaf_id in step config or context payload',
            });
            break;
          }
          const baseUrl = deps.apiBaseUrl || 'http://localhost:8000';
          const res = await fetch(`${baseUrl}/v1/runs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              leaf_id: leafId,
              project_id: context.projectId,
              source: 'recipe',
              tags: [`recipe:${recipe.id}`],
            }),
          });
          if (!res.ok) {
            results.push({
              action: step.action,
              success: false,
              error: `POST /v1/runs failed: ${res.status}`,
            });
            break;
          }
          const json = await res.json();
          const runId = json.data?.run_id;
          results.push({ action: step.action, success: true, data: { run_id: runId } });
          break;
        }
        case 'export_report': {
          const runId =
            (step.config.run_id as string) ||
            (results.find((r) => r.action === 'run_eval' && r.data?.run_id)?.data?.run_id as
              | string
              | undefined);
          if (!runId) {
            results.push({
              action: step.action,
              success: false,
              error: 'Missing run_id in step config or prior run_eval result',
            });
            break;
          }
          const baseUrl = deps.apiBaseUrl || 'http://localhost:8000';
          const res = await fetch(`${baseUrl}/v1/runs/${runId}`);
          if (!res.ok) {
            results.push({
              action: step.action,
              success: false,
              error: `GET /v1/runs/${runId} failed: ${res.status}`,
            });
            break;
          }
          const json = await res.json();
          const runData = json.data;
          const report = {
            run_id: runId,
            project_id: context.projectId,
            status: runData?.status,
            result: runData?.result,
            created_at: runData?.created_at,
            exported_at: new Date().toISOString(),
            recipe_id: recipe.id,
            recipe_name: recipe.name,
          };
          // Mark run as exported via PATCH (title/description/tags)
          await fetch(`${baseUrl}/v1/runs/${runId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              description: `Exported by recipe "${recipe.name}" at ${report.exported_at}`,
              tags: [`recipe:${recipe.id}`, 'exported'],
            }),
          });
          results.push({ action: step.action, success: true, data: { report } });
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
