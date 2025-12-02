/**
 * Branches API Routes
 */

import type { Router } from "../router";
import { sendJson } from "../router";
import { successResponse, errorResponse } from "../types";
import {
  createBranch,
  getBranch,
  listBranches,
  switchBranch,
  getCurrentBranch,
  deleteBranch,
  getProject,
} from "../../core/storage";

/**
 * Register branches routes
 */
export function registerBranchesRoutes(router: Router): void {
  // POST /api/v1/branches - Create branch
  router.post("/api/v1/branches", async (ctx, _req, res) => {
    const body = ctx.body as {
      project_id?: string;
      name?: string;
      parent_branch?: string;
      description?: string;
    } | null;

    if (!body?.project_id || !body?.name) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "project_id and name are required"));
      return;
    }

    // Verify project exists
    const project = getProject(body.project_id);
    if (!project) {
      sendJson(res, 404, errorResponse("NOT_FOUND", `Project ${body.project_id} not found`));
      return;
    }

    // Check if branch already exists
    const existing = getBranch(body.project_id, body.name);
    if (existing) {
      sendJson(res, 409, errorResponse("CONFLICT", `Branch ${body.name} already exists`));
      return;
    }

    try {
      const branch = createBranch({
        project_id: body.project_id,
        name: body.name,
        parent_branch: body.parent_branch,
        description: body.description,
      });
      sendJson(res, 201, successResponse(branch));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("CREATE_FAILED", message));
    }
  });

  // GET /api/v1/branches - List branches
  router.get("/api/v1/branches", async (ctx, _req, res) => {
    const project_id = ctx.query.get("project_id");

    if (!project_id) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "project_id query param is required"));
      return;
    }

    const limit = parseInt(ctx.query.get("limit") ?? "100", 10);
    const offset = parseInt(ctx.query.get("offset") ?? "0", 10);

    try {
      const branches = listBranches({ project_id, limit, offset });
      sendJson(res, 200, successResponse({ branches, project_id, limit, offset }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("LIST_FAILED", message));
    }
  });

  // GET /api/v1/branches/current - Get current branch
  router.get("/api/v1/branches/current", async (ctx, _req, res) => {
    const project_id = ctx.query.get("project_id");

    if (!project_id) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "project_id query param is required"));
      return;
    }

    try {
      const branch = getCurrentBranch(project_id);
      if (!branch) {
        sendJson(res, 404, errorResponse("NOT_FOUND", "No current branch set"));
        return;
      }
      sendJson(res, 200, successResponse(branch));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("GET_FAILED", message));
    }
  });

  // POST /api/v1/branches/switch - Switch current branch
  router.post("/api/v1/branches/switch", async (ctx, _req, res) => {
    const body = ctx.body as {
      project_id?: string;
      branch_name?: string;
      create_if_missing?: boolean;
    } | null;

    if (!body?.project_id || !body?.branch_name) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "project_id and branch_name are required"));
      return;
    }

    try {
      // Check if branch exists
      let branch = getBranch(body.project_id, body.branch_name);

      if (!branch) {
        if (body.create_if_missing) {
          // Create the branch
          branch = createBranch({
            project_id: body.project_id,
            name: body.branch_name,
          });
        } else {
          sendJson(res, 404, errorResponse("NOT_FOUND", `Branch ${body.branch_name} not found`));
          return;
        }
      }

      const switched = switchBranch(body.project_id, body.branch_name);
      if (!switched) {
        sendJson(res, 500, errorResponse("SWITCH_FAILED", "Failed to switch branch"));
        return;
      }

      sendJson(res, 200, successResponse(switched));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("SWITCH_FAILED", message));
    }
  });

  // GET /api/v1/branches/:project_id/:name - Get branch
  router.get(/^\/api\/v1\/branches\/([^/]+)\/([^/]+)$/, async (ctx, _req, res) => {
    const match = ctx.path.match(/^\/api\/v1\/branches\/([^/]+)\/([^/]+)$/);
    const project_id = match?.[1];
    const branch_name = match?.[2];

    if (!project_id || !branch_name) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "project_id and branch_name are required"));
      return;
    }

    try {
      const branch = getBranch(project_id, decodeURIComponent(branch_name));
      if (!branch) {
        sendJson(res, 404, errorResponse("NOT_FOUND", `Branch ${branch_name} not found`));
        return;
      }
      sendJson(res, 200, successResponse(branch));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("GET_FAILED", message));
    }
  });

  // DELETE /api/v1/branches/:project_id/:name - Delete branch
  router.delete(/^\/api\/v1\/branches\/([^/]+)\/([^/]+)$/, async (ctx, _req, res) => {
    const match = ctx.path.match(/^\/api\/v1\/branches\/([^/]+)\/([^/]+)$/);
    const project_id = match?.[1];
    const branch_name = match?.[2];

    if (!project_id || !branch_name) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "project_id and branch_name are required"));
      return;
    }

    try {
      const deleted = deleteBranch(project_id, decodeURIComponent(branch_name));
      if (!deleted) {
        sendJson(res, 400, errorResponse(
          "DELETE_FAILED",
          "Cannot delete branch (may be current or not found)"
        ));
        return;
      }
      sendJson(res, 200, successResponse({ deleted: true, branch_name }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("DELETE_FAILED", message));
    }
  });
}
