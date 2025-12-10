/**
 * Conversations API Routes
 */

import type { Router } from "../router";
import { sendJson } from "../router";
import { successResponse, errorResponse } from "../types";
import {
  createConversation,
  getConversation,
  listConversations,
  deleteConversation,
  updateConversation,
  getConversationTurnCount,
  getProject,
} from "../../core/storage";

/**
 * Register conversations routes
 */
export function registerConversationRoutes(router: Router): void {
  // POST /api/v1/conversations - Create conversation
  router.post("/api/v1/conversations", async (ctx, _req, res) => {
    const body = ctx.body as {
      project_id?: string;
      title?: string;
      parent_commit_hash?: string;
      metadata?: Record<string, unknown>;
    } | null;

    if (!body?.project_id) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "project_id is required"));
      return;
    }

    // Verify project exists
    const project = getProject(body.project_id);
    if (!project) {
      sendJson(res, 404, errorResponse("NOT_FOUND", `Project ${body.project_id} not found`));
      return;
    }

    try {
      const conversation = createConversation({
        project_id: body.project_id,
        title: body.title,
        parent_commit_hash: body.parent_commit_hash,
        metadata: body.metadata,
      });
      sendJson(res, 201, successResponse(conversation));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("CREATE_FAILED", message));
    }
  });

  // GET /api/v1/conversations - List conversations
  router.get("/api/v1/conversations", async (ctx, _req, res) => {
    const project_id = ctx.query.get("project_id");

    if (!project_id) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "project_id query param is required"));
      return;
    }

    const limit = parseInt(ctx.query.get("limit") ?? "100", 10);
    const offset = parseInt(ctx.query.get("offset") ?? "0", 10);

    try {
      const conversations = listConversations({ project_id, limit, offset });
      sendJson(res, 200, successResponse({ conversations, project_id, limit, offset }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("LIST_FAILED", message));
    }
  });

  // GET /api/v1/conversations/:id - Get conversation
  router.get(/^\/api\/v1\/conversations\/([^/]+)$/, async (ctx, _req, res) => {
    const match = ctx.path.match(/^\/api\/v1\/conversations\/([^/]+)$/);
    const conversation_id = match?.[1];

    if (!conversation_id) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "conversation_id is required"));
      return;
    }

    try {
      const conversation = getConversation(conversation_id);
      if (!conversation) {
        sendJson(res, 404, errorResponse("NOT_FOUND", `Conversation ${conversation_id} not found`));
        return;
      }

      const turns_count = getConversationTurnCount(conversation_id);
      sendJson(res, 200, successResponse({ ...conversation, turns_count }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("GET_FAILED", message));
    }
  });

  // PUT /api/v1/conversations/:id - Update conversation
  router.put(/^\/api\/v1\/conversations\/([^/]+)$/, async (ctx, _req, res) => {
    const match = ctx.path.match(/^\/api\/v1\/conversations\/([^/]+)$/);
    const conversation_id = match?.[1];

    if (!conversation_id) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "conversation_id is required"));
      return;
    }

    const body = ctx.body as { title?: string; metadata?: Record<string, unknown> } | null;

    try {
      const conversation = updateConversation(conversation_id, {
        title: body?.title,
        metadata: body?.metadata,
      });
      if (!conversation) {
        sendJson(res, 404, errorResponse("NOT_FOUND", `Conversation ${conversation_id} not found`));
        return;
      }
      sendJson(res, 200, successResponse(conversation));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("UPDATE_FAILED", message));
    }
  });

  // DELETE /api/v1/conversations/:id - Delete conversation
  router.delete(/^\/api\/v1\/conversations\/([^/]+)$/, async (ctx, _req, res) => {
    const match = ctx.path.match(/^\/api\/v1\/conversations\/([^/]+)$/);
    const conversation_id = match?.[1];

    if (!conversation_id) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "conversation_id is required"));
      return;
    }

    try {
      const deleted = deleteConversation(conversation_id);
      if (!deleted) {
        sendJson(res, 404, errorResponse("NOT_FOUND", `Conversation ${conversation_id} not found`));
        return;
      }
      sendJson(res, 200, successResponse({ deleted: true, conversation_id }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("DELETE_FAILED", message));
    }
  });
}
