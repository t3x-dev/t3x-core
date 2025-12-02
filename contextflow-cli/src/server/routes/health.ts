/**
 * Health Check Routes
 *
 * GET /health - matches Python HealthResponse format (not wrapped)
 */

import type { ServerResponse } from "node:http";
import { Router, sendJson } from "../router";

// Track server start time for uptime calculation
const startTime = Date.now();

/**
 * Register health check routes
 */
export function registerHealthRoutes(router: Router): void {
  // GET /health - direct response (matches Python HealthResponse)
  router.get("/health", async (_ctx, _req, res) => {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    sendJson(res, 200, {
      status: "ok",
      version: "1.0.0",
      uptime: uptimeSeconds,
    });
  });

  // GET /api/v1/health (alternative path, same format)
  router.get("/api/v1/health", async (_ctx, _req, res) => {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    sendJson(res, 200, {
      status: "ok",
      version: "1.0.0",
      uptime: uptimeSeconds,
    });
  });
}
