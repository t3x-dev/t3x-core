/**
 * Projects API Routes
 */

import type { Router } from "../router";
import { sendJson } from "../router";
import { successResponse, errorResponse } from "../types";
import {
  createProject,
  getProject,
  getProjectWithStats,
  listProjects,
  deleteProject,
  updateProject,
} from "../../core/storage";

/**
 * Register projects routes
 */
export function registerProjectRoutes(router: Router): void {
  // POST /api/v1/projects - Create project
  router.post("/api/v1/projects", async (ctx, _req, res) => {
    const body = ctx.body as { name?: string; metadata?: Record<string, unknown> } | null;

    if (!body?.name) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "name is required"));
      return;
    }

    try {
      const project = createProject({
        name: body.name,
        metadata: body.metadata,
      });
      sendJson(res, 201, successResponse(project));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("CREATE_FAILED", message));
    }
  });

  // GET /api/v1/projects - List projects
  router.get("/api/v1/projects", async (ctx, _req, res) => {
    const limit = parseInt(ctx.query.get("limit") ?? "100", 10);
    const offset = parseInt(ctx.query.get("offset") ?? "0", 10);

    try {
      const projects = listProjects({ limit, offset });
      sendJson(res, 200, successResponse({ projects, limit, offset }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("LIST_FAILED", message));
    }
  });

  // GET /api/v1/projects/:id - Get project with stats
  router.get(/^\/api\/v1\/projects\/([^/]+)$/, async (ctx, _req, res) => {
    const match = ctx.path.match(/^\/api\/v1\/projects\/([^/]+)$/);
    const project_id = match?.[1];

    if (!project_id) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "project_id is required"));
      return;
    }

    try {
      const project = getProjectWithStats(project_id);
      if (!project) {
        sendJson(res, 404, errorResponse("NOT_FOUND", `Project ${project_id} not found`));
        return;
      }
      sendJson(res, 200, successResponse(project));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("GET_FAILED", message));
    }
  });

  // PUT /api/v1/projects/:id - Update project
  router.put(/^\/api\/v1\/projects\/([^/]+)$/, async (ctx, _req, res) => {
    const match = ctx.path.match(/^\/api\/v1\/projects\/([^/]+)$/);
    const project_id = match?.[1];

    if (!project_id) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "project_id is required"));
      return;
    }

    const body = ctx.body as { name?: string; metadata?: Record<string, unknown> } | null;

    try {
      const project = updateProject(project_id, {
        name: body?.name,
        metadata: body?.metadata,
      });
      if (!project) {
        sendJson(res, 404, errorResponse("NOT_FOUND", `Project ${project_id} not found`));
        return;
      }
      sendJson(res, 200, successResponse(project));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("UPDATE_FAILED", message));
    }
  });

  // DELETE /api/v1/projects/:id - Delete project
  router.delete(/^\/api\/v1\/projects\/([^/]+)$/, async (ctx, _req, res) => {
    const match = ctx.path.match(/^\/api\/v1\/projects\/([^/]+)$/);
    const project_id = match?.[1];

    if (!project_id) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "project_id is required"));
      return;
    }

    try {
      const deleted = deleteProject(project_id);
      if (!deleted) {
        sendJson(res, 404, errorResponse("NOT_FOUND", `Project ${project_id} not found`));
        return;
      }
      sendJson(res, 200, successResponse({ deleted: true, project_id }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("DELETE_FAILED", message));
    }
  });
}
