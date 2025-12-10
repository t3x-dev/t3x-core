/**
 * Simple HTTP Router
 *
 * Lightweight router for the embedded API server.
 * Based on Node.js native http module.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { Route, RouteHandler, RequestContext, errorResponse } from "./types";

/**
 * Simple HTTP Router
 */
export class Router {
  private routes: Route[] = [];

  /**
   * Register a GET route
   */
  get(path: string | RegExp, handler: RouteHandler): void {
    this.routes.push({ method: "GET", path, handler });
  }

  /**
   * Register a POST route
   */
  post(path: string | RegExp, handler: RouteHandler): void {
    this.routes.push({ method: "POST", path, handler });
  }

  /**
   * Register a PUT route
   */
  put(path: string | RegExp, handler: RouteHandler): void {
    this.routes.push({ method: "PUT", path, handler });
  }

  /**
   * Register a DELETE route
   */
  delete(path: string | RegExp, handler: RouteHandler): void {
    this.routes.push({ method: "DELETE", path, handler });
  }

  /**
   * Register a PATCH route
   */
  patch(path: string | RegExp, handler: RouteHandler): void {
    this.routes.push({ method: "PATCH", path, handler });
  }

  /**
   * Handle incoming request
   */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const path = url.pathname;
    const method = (req.method ?? "GET").toUpperCase();

    // Find matching route
    for (const route of this.routes) {
      if (route.method !== method) continue;

      const matched = typeof route.path === "string"
        ? route.path === path
        : route.path.test(path);

      if (!matched) continue;

      try {
        // Parse body for POST/PUT
        const body = await this.parseBody(req);

        const ctx: RequestContext = {
          path,
          method,
          query: url.searchParams,
          body,
          headers: req.headers as Record<string, string | string[] | undefined>,
        };

        await route.handler(ctx, req, res);
        return;
      } catch (error) {
        this.sendError(res, 500, "INTERNAL_ERROR", (error as Error).message);
        return;
      }
    }

    // No route matched
    this.sendError(res, 404, "NOT_FOUND", `Route not found: ${method} ${path}`);
  }

  /**
   * Parse request body as JSON
   */
  private async parseBody(req: IncomingMessage): Promise<unknown> {
    const method = req.method?.toUpperCase();
    if (method !== "POST" && method !== "PUT" && method !== "PATCH") {
      return null;
    }

    const contentType = req.headers["content-type"] ?? "";
    if (!contentType.includes("application/json")) {
      return null;
    }

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      req.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      req.on("end", () => {
        try {
          const body = Buffer.concat(chunks).toString("utf-8");
          if (!body.trim()) {
            resolve(null);
            return;
          }
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error("Invalid JSON body"));
        }
      });

      req.on("error", reject);
    });
  }

  /**
   * Send error response
   */
  private sendError(
    res: ServerResponse,
    status: number,
    code: string,
    message: string
  ): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(errorResponse(code, message)));
  }
}

/**
 * Send JSON response helper
 */
export function sendJson(
  res: ServerResponse,
  status: number,
  data: unknown
): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}
