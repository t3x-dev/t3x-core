/**
 * Runs API Routes
 *
 * Engine run management for T3X → Runner → n8n flow.
 */

import type { Router } from "../router";
import { sendJson } from "../router";
import { successResponse, errorResponse } from "../types";
import {
  createRun,
  getRun,
  listRuns,
  updateRun,
} from "../../core/storage";

// Runner URL from environment
const RUNNER_URL = process.env.T3X_RUNNER_URL || 'http://localhost:8080';
// Engine URL for Runner callback (use container name in Docker, localhost for local dev)
const ENGINE_URL = process.env.T3X_ENGINE_URL || 'http://localhost:8000';

/**
 * Register runs routes
 */
export function registerRunsRoutes(router: Router): void {
  // POST /api/v1/runs - Create run and trigger Runner
  router.post("/api/v1/runs", async (ctx, _req, res) => {
    const body = ctx.body as {
      project_id?: string;
      commit_ref?: string;
      leaf?: { id: string; type: 'deploy' | 'eval'; content?: string };
      inputs?: Record<string, unknown>;
      workflow?: { type: string; webhook_id?: string };
    } | null;

    try {
      // 1. Create run record (status: queued)
      const run = await createRun({
        project_id: body?.project_id,
        commit_ref: body?.commit_ref,
        leaf: body?.leaf,
        inputs: body?.inputs,
        workflow: body?.workflow,
      });

      // 2. Call Runner POST /runs (async - fire and forget for now)
      try {
        const runnerResponse = await fetch(`${RUNNER_URL}/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            run_id: run.run_id,
            commit_ref: body?.commit_ref,
            leaf: body?.leaf,
            inputs: body?.inputs,
            callback_url: `${RUNNER_URL}/callbacks/n8n`,
            engine_callback_url: `${ENGINE_URL}/api/v1/ingest/run`,
            workflow: body?.workflow,
          }),
          signal: AbortSignal.timeout(10000),
        });

        if (runnerResponse.ok) {
          const runnerData = await runnerResponse.json() as { runner_run_id: string; status: string };

          // 3. Update run record with runner_run_id and status: running
          await updateRun(run.run_id, {
            runner_run_id: runnerData.runner_run_id,
            status: 'running',
          });

          sendJson(res, 201, successResponse({
            run_id: run.run_id,
            status: 'running',
            runner_run_id: runnerData.runner_run_id,
          }));
        } else {
          // Runner call failed, mark as failed
          await updateRun(run.run_id, { status: 'failed' });
          const errorText = await runnerResponse.text();
          sendJson(res, 500, errorResponse("RUNNER_ERROR", `Runner returned ${runnerResponse.status}: ${errorText}`));
        }
      } catch (runnerError) {
        // Runner unreachable, return run in queued state
        // The run can be retried later
        const message = runnerError instanceof Error ? runnerError.message : "Unknown error";
        console.warn(`Runner unreachable: ${message}. Run ${run.run_id} remains queued.`);

        sendJson(res, 201, successResponse({
          run_id: run.run_id,
          status: 'queued',
          warning: 'Runner unreachable, run queued for retry',
        }));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("CREATE_FAILED", message));
    }
  });

  // GET /api/v1/runs - List runs
  router.get("/api/v1/runs", async (ctx, _req, res) => {
    const project_id = ctx.query.get("project_id") ?? undefined;
    const status = ctx.query.get("status") as 'queued' | 'running' | 'completed' | 'failed' | undefined;
    const limit = parseInt(ctx.query.get("limit") ?? "100", 10);
    const offset = parseInt(ctx.query.get("offset") ?? "0", 10);

    try {
      const runs = await listRuns({ project_id, status, limit, offset });

      // Parse JSON fields for response
      const runsWithParsedFields = runs.map(run => ({
        ...run,
        leaf: run.leaf_json ? JSON.parse(run.leaf_json) : null,
        inputs: run.inputs_json ? JSON.parse(run.inputs_json) : null,
        workflow: run.workflow_json ? JSON.parse(run.workflow_json) : null,
        result: run.result_json ? JSON.parse(run.result_json) : null,
      }));

      sendJson(res, 200, successResponse({ runs: runsWithParsedFields, limit, offset }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("LIST_FAILED", message));
    }
  });

  // GET /api/v1/runs/:id - Get run by ID
  router.get(/^\/api\/v1\/runs\/([^/]+)$/, async (ctx, _req, res) => {
    const match = ctx.path.match(/^\/api\/v1\/runs\/([^/]+)$/);
    const run_id = match?.[1];

    if (!run_id) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "run_id is required"));
      return;
    }

    try {
      const run = await getRun(run_id);
      if (!run) {
        sendJson(res, 404, errorResponse("NOT_FOUND", `Run ${run_id} not found`));
        return;
      }

      // Parse JSON fields for response
      const runWithParsedFields = {
        ...run,
        leaf: run.leaf_json ? JSON.parse(run.leaf_json) : null,
        inputs: run.inputs_json ? JSON.parse(run.inputs_json) : null,
        workflow: run.workflow_json ? JSON.parse(run.workflow_json) : null,
        result: run.result_json ? JSON.parse(run.result_json) : null,
      };

      sendJson(res, 200, successResponse(runWithParsedFields));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("GET_FAILED", message));
    }
  });
}
