/**
 * Drafts V2 API Routes
 */

import type { Router } from "../router";
import { sendJson } from "../router";
import { successResponse, errorResponse } from "../types";
import {
  createDraftV2,
  getDraftV2,
  listDraftsV2,
  updateDraftV2Status,
  deleteDraftV2,
  getProject,
  getConversation,
} from "../../core/storage";

/**
 * Register drafts V2 routes
 */
export function registerDraftsV2Routes(router: Router): void {
  // POST /api/v1/drafts - Create draft
  router.post("/api/v1/drafts", async (ctx, _req, res) => {
    const body = ctx.body as {
      project_id?: string;
      conversation_id?: string;
      base_commit_hash?: string;
      turn_anchor_hash?: string;
      bridge_id?: string;
      bridge_payload?: unknown;
      must_have?: string[];
      mustnt_have?: string[];
      llm_config?: unknown;
      text?: string;
    } | null;

    if (!body?.project_id || !body?.conversation_id || !body?.bridge_id || !body?.text) {
      sendJson(res, 400, errorResponse(
        "INVALID_REQUEST",
        "project_id, conversation_id, bridge_id, and text are required"
      ));
      return;
    }

    // Verify project and conversation exist
    const project = await getProject(body.project_id);
    if (!project) {
      sendJson(res, 404, errorResponse("NOT_FOUND", `Project ${body.project_id} not found`));
      return;
    }

    const conversation = await getConversation(body.conversation_id);
    if (!conversation) {
      sendJson(res, 404, errorResponse("NOT_FOUND", `Conversation ${body.conversation_id} not found`));
      return;
    }

    if (conversation.project_id !== body.project_id) {
      sendJson(res, 400, errorResponse(
        "INVALID_REQUEST",
        "Conversation does not belong to the specified project"
      ));
      return;
    }

    try {
      const draft = await createDraftV2({
        project_id: body.project_id,
        conversation_id: body.conversation_id,
        base_commit_hash: body.base_commit_hash,
        turn_anchor_hash: body.turn_anchor_hash,
        bridge_id: body.bridge_id,
        bridge_payload: body.bridge_payload ?? {},
        must_have: body.must_have,
        mustnt_have: body.mustnt_have,
        llm_config: body.llm_config ?? {},
        text: body.text,
      });

      sendJson(res, 201, successResponse(draft));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("CREATE_FAILED", message));
    }
  });

  // GET /api/v1/drafts - List drafts
  router.get("/api/v1/drafts", async (ctx, _req, res) => {
    const project_id = ctx.query.get("project_id");

    if (!project_id) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "project_id query param is required"));
      return;
    }

    const status = ctx.query.get("status") as "ephemeral" | "adopted" | "superseded" | null;
    const limit = parseInt(ctx.query.get("limit") ?? "100", 10);
    const offset = parseInt(ctx.query.get("offset") ?? "0", 10);

    try {
      const drafts = await listDraftsV2({
        project_id,
        status: status ?? undefined,
        limit,
        offset,
      });
      sendJson(res, 200, successResponse({ drafts, project_id, status, limit, offset }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("LIST_FAILED", message));
    }
  });

  // GET /api/v1/drafts/:id - Get draft
  router.get(/^\/api\/v1\/drafts\/(draft_[a-f0-9]+)$/, async (ctx, _req, res) => {
    const match = ctx.path.match(/^\/api\/v1\/drafts\/(draft_[a-f0-9]+)$/);
    const draft_id = match?.[1];

    if (!draft_id) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "draft_id is required"));
      return;
    }

    try {
      const draft = await getDraftV2(draft_id);
      if (!draft) {
        sendJson(res, 404, errorResponse("NOT_FOUND", `Draft ${draft_id} not found`));
        return;
      }
      sendJson(res, 200, successResponse(draft));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("GET_FAILED", message));
    }
  });

  // PATCH /api/v1/drafts/:id/status - Update draft status
  router.post(/^\/api\/v1\/drafts\/(draft_[a-f0-9]+)\/status$/, async (ctx, _req, res) => {
    const match = ctx.path.match(/^\/api\/v1\/drafts\/(draft_[a-f0-9]+)\/status$/);
    const draft_id = match?.[1];

    if (!draft_id) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "draft_id is required"));
      return;
    }

    const body = ctx.body as { status?: string } | null;
    const validStatuses = ["ephemeral", "adopted", "superseded"];

    if (!body?.status || !validStatuses.includes(body.status)) {
      sendJson(res, 400, errorResponse(
        "INVALID_REQUEST",
        `status must be one of: ${validStatuses.join(", ")}`
      ));
      return;
    }

    try {
      const draft = await updateDraftV2Status(
        draft_id,
        body.status as "ephemeral" | "adopted" | "superseded"
      );
      if (!draft) {
        sendJson(res, 404, errorResponse("NOT_FOUND", `Draft ${draft_id} not found`));
        return;
      }
      sendJson(res, 200, successResponse(draft));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("UPDATE_FAILED", message));
    }
  });

  // DELETE /api/v1/drafts/:id - Delete draft
  router.delete(/^\/api\/v1\/drafts\/(draft_[a-f0-9]+)$/, async (ctx, _req, res) => {
    const match = ctx.path.match(/^\/api\/v1\/drafts\/(draft_[a-f0-9]+)$/);
    const draft_id = match?.[1];

    if (!draft_id) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "draft_id is required"));
      return;
    }

    try {
      const deleted = await deleteDraftV2(draft_id);
      if (!deleted) {
        sendJson(res, 404, errorResponse("NOT_FOUND", `Draft ${draft_id} not found`));
        return;
      }
      sendJson(res, 200, successResponse({ deleted: true, draft_id }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("DELETE_FAILED", message));
    }
  });
}
