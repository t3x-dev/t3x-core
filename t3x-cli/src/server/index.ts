/**
 * Embedded API Server
 *
 * Lightweight HTTP server for t3x CLI.
 * Provides REST API for Ring extraction, Diff, and Merge operations.
 */

import * as http from "node:http";
import { Router, sendJson } from "./router";
import { ServerConfig, ProviderConfig, errorResponse } from "./types";
import {
  registerHealthRoutes,
  registerExtractRoutes,
  registerDiffRoutes,
  registerMergeRoutes,
  registerBridgeRoutes,
  registerDraftRoutes,
  // V2 Storage/Management routes
  registerProjectRoutes,
  registerConversationRoutes,
  registerTurnsV2Routes,
  registerBranchesRoutes,
  registerCommitsV2Routes,
  registerDraftsV2Routes,
  // Additional routes for full Python API parity
  registerStatusRoutes,
  registerAgentDraftsRoutes,
  registerChatRoutes,
  registerExportRoutes,
} from "./routes";

/**
 * Server instance
 */
export interface Server {
  /** Start the server */
  start(): Promise<void>;
  /** Stop the server */
  stop(): Promise<void>;
  /** Get server address */
  address(): { host: string; port: number } | null;
}

/**
 * Create and configure the API server
 */
export function createServer(config: ServerConfig): Server {
  const router = new Router();
  let server: http.Server | null = null;
  let serverAddress: { host: string; port: number } | null = null;

  // Register all routes with provider configuration
  registerHealthRoutes(router);
  registerExtractRoutes(router, config.providers);
  registerDiffRoutes(router, config.providers);
  registerMergeRoutes(router, config.providers);
  registerBridgeRoutes(router, config.t3xDir);
  registerDraftRoutes(router, config.providers, config.t3xDir);

  // V2 Storage/Management routes (Python core_api migration)
  registerProjectRoutes(router);
  registerConversationRoutes(router);
  registerTurnsV2Routes(router, config.providers);
  registerBranchesRoutes(router);
  registerCommitsV2Routes(router, config.providers);
  registerDraftsV2Routes(router);

  // Additional routes for full Python API parity
  registerStatusRoutes(router);
  registerAgentDraftsRoutes(router, config.providers);
  registerChatRoutes(router, config.providers);
  registerExportRoutes(router);

  // Create HTTP server
  const httpServer = http.createServer(async (req, res) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      });
      res.end();
      return;
    }

    // Route request
    try {
      await router.handle(req, res);
    } catch (error) {
      // Last resort error handler
      if (!res.headersSent) {
        sendJson(res, 500, errorResponse(
          "INTERNAL_ERROR",
          "An unexpected error occurred"
        ));
      }
    }
  });

  return {
    async start(): Promise<void> {
      return new Promise((resolve, reject) => {
        const host = config.host ?? "127.0.0.1";
        const port = config.port;

        httpServer.on("error", (error: NodeJS.ErrnoException) => {
          if (error.code === "EADDRINUSE") {
            reject(new Error(`Port ${port} is already in use`));
          } else {
            reject(error);
          }
        });

        httpServer.listen(port, host, () => {
          serverAddress = { host, port };
          server = httpServer;
          resolve();
        });
      });
    },

    async stop(): Promise<void> {
      return new Promise((resolve, reject) => {
        if (!server) {
          resolve();
          return;
        }

        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            server = null;
            serverAddress = null;
            resolve();
          }
        });
      });
    },

    address(): { host: string; port: number } | null {
      return serverAddress;
    },
  };
}

// Re-export types
export * from "./types";
export { Router, sendJson } from "./router";

// Re-export manager functions
export {
  startEmbeddedServer,
  stopEmbeddedServer,
  getEmbeddedServerInfo,
  isEmbeddedServerRunning,
  getEmbeddedServerUrl,
} from "./manager";
