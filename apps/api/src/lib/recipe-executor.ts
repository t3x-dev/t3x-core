/**
 * Recipe Executor
 *
 * Executes a recipe's steps sequentially.
 * Fire-and-forget — errors are logged but don't propagate.
 */

import { isInternalUrlResolved } from './ssrf';

interface RecipeStep {
  action: 'send_webhook' | 'run_eval' | 'export_report' | 'auto_commit_draft';
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
          if (!url) {
            results.push({ action: step.action, success: false, error: 'Missing webhook URL' });
            break;
          }
          if (await isInternalUrlResolved(url)) {
            results.push({
              action: step.action,
              success: false,
              error: 'Webhook URL targets a blocked internal address',
            });
            break;
          }
          if (deps.webhookDispatch) {
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
          const runEvalHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
          const internalKey = process.env.INTERNAL_API_KEY || process.env.API_KEY;
          if (internalKey) {
            runEvalHeaders['Authorization'] = `Bearer ${internalKey}`;
          }
          const res = await fetch(`${baseUrl}/v1/runs`, {
            method: 'POST',
            headers: runEvalHeaders,
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
          const exportHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
          const internalKeyExport = process.env.INTERNAL_API_KEY || process.env.API_KEY;
          if (internalKeyExport) {
            exportHeaders['Authorization'] = `Bearer ${internalKeyExport}`;
          }
          const res = await fetch(`${baseUrl}/v1/runs/${runId}`, { headers: exportHeaders });
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
            headers: exportHeaders,
            body: JSON.stringify({
              description: `Exported by recipe "${recipe.name}" at ${report.exported_at}`,
              tags: [`recipe:${recipe.id}`, 'exported'],
            }),
          });
          results.push({ action: step.action, success: true, data: { report } });
          break;
        }
        case 'auto_commit_draft': {
          const draftId = step.config.draft_id as string;
          if (!draftId) {
            results.push({
              action: step.action,
              success: false,
              error: 'missing draft_id in step config',
            });
            break;
          }
          const baseUrlCommit = deps.apiBaseUrl || 'http://localhost:8000';
          const commitHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
          const internalKeyCommit = process.env.INTERNAL_API_KEY || process.env.API_KEY;
          if (internalKeyCommit) {
            commitHeaders.Authorization = `Bearer ${internalKeyCommit}`;
          }
          const commitRes = await fetch(`${baseUrlCommit}/v1/drafts/${draftId}/auto-commit`, {
            method: 'POST',
            headers: commitHeaders,
          });
          const commitBody = await commitRes.json();
          results.push({
            action: step.action,
            success: commitRes.ok && commitBody.success,
            data: commitBody.data,
          });
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
