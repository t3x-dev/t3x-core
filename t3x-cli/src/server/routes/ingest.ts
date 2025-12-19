/**
 * Ingest API Routes
 *
 * Receives run results from Runner after n8n workflow completion.
 */

import type { Router } from "../router";
import { sendJson } from "../router";
import { successResponse, errorResponse } from "../types";
import { getRun, updateRun } from "../../core/storage";

/**
 * Register ingest routes
 */
export function registerIngestRoutes(router: Router): void {
  // POST /api/v1/ingest/run - Receive run result from Runner
  router.post("/api/v1/ingest/run", async (ctx, _req, res) => {
    const body = ctx.body as {
      run_id: string;
      commit_ref?: string;
      runner_run_id: string;
      status: 'completed' | 'failed';
      run_report?: Record<string, unknown>;
      assertions?: unknown[];
      evidence_pack?: Record<string, unknown>;
    } | null;

    if (!body?.run_id) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "run_id is required"));
      return;
    }

    if (!body?.runner_run_id) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "runner_run_id is required"));
      return;
    }

    if (!body?.status || !['completed', 'failed'].includes(body.status)) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "status must be 'completed' or 'failed'"));
      return;
    }

    try {
      // Verify run exists
      const run = await getRun(body.run_id);
      if (!run) {
        sendJson(res, 404, errorResponse("NOT_FOUND", `Run ${body.run_id} not found`));
        return;
      }

      // Update run with result
      const result = {
        run_report: body.run_report || {},
        assertions: body.assertions || [],
        evidence_pack: body.evidence_pack || {},
      };

      await updateRun(body.run_id, {
        status: body.status,
        result,
      });

      console.log(`Run ${body.run_id} ingested: status=${body.status}`);
      sendJson(res, 200, successResponse({ ok: true }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("INGEST_FAILED", message));
    }
  });
}
