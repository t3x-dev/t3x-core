/**
 * Bridge Routes
 *
 * GET /api/v1/bridges - List all available bridges
 * GET /api/v1/bridges/:id - Get specific bridge details
 */

import path from "node:path";
import { Router, sendJson } from "../router";
import { successResponse, errorResponse } from "../types";
import { BridgeLoader } from "../../core/bridges";

// Shared bridge loader instance
let bridgeLoader: BridgeLoader | null = null;
let configuredBridgesDir: string | null = null;

/**
 * Get or create bridge loader
 */
async function getBridgeLoader(contextflowDir: string): Promise<BridgeLoader> {
  const bridgesDir = path.join(contextflowDir, "bridges");

  // Recreate if directory changed
  if (!bridgeLoader || configuredBridgesDir !== bridgesDir) {
    bridgeLoader = new BridgeLoader(bridgesDir);
    configuredBridgesDir = bridgesDir;
    await bridgeLoader.init();
  }
  return bridgeLoader;
}

/**
 * Register bridge routes
 */
export function registerBridgeRoutes(router: Router, contextflowDir: string): void {
  // GET /api/v1/bridges - List all bridges
  router.get("/api/v1/bridges", async (_ctx, _req, res) => {
    try {
      const loader = await getBridgeLoader(contextflowDir);
      const bridgeIds = loader.list();

      const bridges = bridgeIds.map((id) => {
        const template = loader.get(id);
        return {
          bridge: template?.bridge,
          label: template?.label,
          description: template?.description,
          threshold: template?.threshold,
          locale: template?.locale,
          version: template?.version,
        };
      });

      sendJson(res, 200, successResponse({ bridges }));
    } catch (error) {
      sendJson(res, 500, errorResponse(
        "BRIDGE_LIST_FAILED",
        (error as Error).message
      ));
    }
  });

  // GET /api/v1/bridges/:id - Get specific bridge
  router.get(/^\/api\/v1\/bridges\/([^/]+)$/, async (ctx, _req, res) => {
    try {
      // Extract bridge ID from path
      const match = ctx.path.match(/^\/api\/v1\/bridges\/([^/]+)$/);
      const bridgeId = match?.[1];

      if (!bridgeId) {
        sendJson(res, 400, errorResponse(
          "INVALID_REQUEST",
          "Bridge ID is required"
        ));
        return;
      }

      const loader = await getBridgeLoader(contextflowDir);
      const template = loader.get(bridgeId);

      if (!template) {
        sendJson(res, 404, errorResponse(
          "BRIDGE_NOT_FOUND",
          `Bridge '${bridgeId}' not found`
        ));
        return;
      }

      sendJson(res, 200, successResponse(template));
    } catch (error) {
      sendJson(res, 500, errorResponse(
        "BRIDGE_GET_FAILED",
        (error as Error).message
      ));
    }
  });

  // POST /api/v1/bridges/reload - Reload all bridges
  router.post("/api/v1/bridges/reload", async (_ctx, _req, res) => {
    try {
      const loader = await getBridgeLoader(contextflowDir);
      await loader.reload();

      sendJson(res, 200, successResponse({ message: "Bridges reloaded" }));
    } catch (error) {
      sendJson(res, 500, errorResponse(
        "BRIDGE_RELOAD_FAILED",
        (error as Error).message
      ));
    }
  });
}
