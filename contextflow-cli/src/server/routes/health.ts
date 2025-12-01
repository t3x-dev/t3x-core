/**
 * Health Check Routes
 */

import type { ServerResponse } from "node:http";
import { Router, sendJson } from "../router";
import { successResponse } from "../types";

/**
 * Register health check routes
 */
export function registerHealthRoutes(router: Router): void {
  // GET /health
  router.get("/health", async (_ctx, _req, res) => {
    sendJson(res, 200, successResponse({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      runtime: "typescript",
    }));
  });

  // GET /api/v1/health (alternative path)
  router.get("/api/v1/health", async (_ctx, _req, res) => {
    sendJson(res, 200, successResponse({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      runtime: "typescript",
    }));
  });
}
