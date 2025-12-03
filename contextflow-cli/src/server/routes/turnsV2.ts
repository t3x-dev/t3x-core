/**
 * Turns V2 API Routes (with Ring extraction and hash chain)
 */

import type { Router } from "../router";
import { sendJson } from "../router";
import { successResponse, errorResponse, ProviderConfig } from "../types";
import {
  createTurnV2,
  getTurnV2,
  listTurnsV2,
  getConversation,
  getTurnChain,
} from "../../core/storage";
import { RingExtractor } from "../../core/extractors";
import { GoogleCloudNLPProvider } from "../../core/providers/nlp";

/**
 * Register turns V2 routes
 */
export function registerTurnsV2Routes(router: Router, providers: ProviderConfig): void {
  // POST /api/v1/turns - Create turn (with Ring extraction)
  router.post("/api/v1/turns", async (ctx, _req, res) => {
    const body = ctx.body as {
      project_id?: string;
      conversation_id?: string;
      role?: string;
      content?: string;
      language?: string;
      extract_rings?: boolean;
    } | null;

    if (!body?.project_id || !body?.conversation_id || !body?.role || !body?.content) {
      sendJson(res, 400, errorResponse(
        "INVALID_REQUEST",
        "project_id, conversation_id, role, and content are required"
      ));
      return;
    }

    const validRoles = ["user", "assistant", "system", "tool"];
    if (!validRoles.includes(body.role)) {
      sendJson(res, 400, errorResponse(
        "INVALID_REQUEST",
        `role must be one of: ${validRoles.join(", ")}`
      ));
      return;
    }

    // Verify conversation exists
    const conversation = getConversation(body.conversation_id);
    if (!conversation) {
      sendJson(res, 404, errorResponse("NOT_FOUND", `Conversation ${body.conversation_id} not found`));
      return;
    }

    // Verify project matches
    if (conversation.project_id !== body.project_id) {
      sendJson(res, 400, errorResponse(
        "INVALID_REQUEST",
        "conversation does not belong to the specified project"
      ));
      return;
    }

    try {
      let rings: unknown = null;

      // Extract rings if requested and API key available
      const shouldExtract = body.extract_rings !== false;
      if (shouldExtract && providers.googleCloudNLPKey) {
        try {
          const nlpProvider = new GoogleCloudNLPProvider({ apiKey: providers.googleCloudNLPKey });
          const extractor = new RingExtractor(nlpProvider);
          const turnId = `temp_${Date.now()}`;
          rings = await extractor.extract(turnId, body.content, body.language);
        } catch (extractErr) {
          // Log but don't fail - ring extraction is optional
          console.warn("Ring extraction failed:", extractErr);
        }
      }

      const turn = createTurnV2({
        project_id: body.project_id,
        conversation_id: body.conversation_id,
        role: body.role as "user" | "assistant" | "system" | "tool",
        content: body.content,
        language: body.language,
        rings,
      });

      sendJson(res, 201, successResponse(turn));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("CREATE_FAILED", message));
    }
  });

  // GET /api/v1/turns - List turns
  router.get("/api/v1/turns", async (ctx, _req, res) => {
    const conversation_id = ctx.query.get("conversation_id");

    if (!conversation_id) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "conversation_id query param is required"));
      return;
    }

    const limit = parseInt(ctx.query.get("limit") ?? "100", 10);
    const offset = parseInt(ctx.query.get("offset") ?? "0", 10);

    try {
      const turns = listTurnsV2({ conversation_id, limit, offset });
      sendJson(res, 200, successResponse({ turns, conversation_id, limit, offset }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("LIST_FAILED", message));
    }
  });

  // GET /api/v1/turns/:hash - Get turn by hash
  router.get(/^\/api\/v1\/turns\/(sha256:[a-f0-9]+)$/, async (ctx, _req, res) => {
    const match = ctx.path.match(/^\/api\/v1\/turns\/(sha256:[a-f0-9]+)$/);
    const turn_hash = match?.[1];

    if (!turn_hash) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "turn_hash is required"));
      return;
    }

    try {
      const turn = getTurnV2(turn_hash);
      if (!turn) {
        sendJson(res, 404, errorResponse("NOT_FOUND", `Turn ${turn_hash} not found`));
        return;
      }
      sendJson(res, 200, successResponse(turn));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("GET_FAILED", message));
    }
  });

  // GET /api/v1/turns/:hash/chain - Get turn chain (history)
  router.get(/^\/api\/v1\/turns\/(sha256:[a-f0-9]+)\/chain$/, async (ctx, _req, res) => {
    const match = ctx.path.match(/^\/api\/v1\/turns\/(sha256:[a-f0-9]+)\/chain$/);
    const turn_hash = match?.[1];

    if (!turn_hash) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "turn_hash is required"));
      return;
    }

    const limit = parseInt(ctx.query.get("limit") ?? "50", 10);

    try {
      const chain = getTurnChain(turn_hash, limit);
      sendJson(res, 200, successResponse({ chain, end_turn_hash: turn_hash }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("GET_FAILED", message));
    }
  });
}
