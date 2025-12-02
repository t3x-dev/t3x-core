/**
 * Agent Drafts API Routes
 *
 * POST /api/v1/agent/drafts - Create draft with LLM generation
 * GET /api/v1/agent/drafts/:draft_id - Get draft
 * PATCH /api/v1/agent/drafts/:draft_id - Update draft with feedback
 *
 * Compatible with Python core_api/routes/agent.py response format.
 */

import type { Router } from "../router";
import { sendJson } from "../router";
import { successResponse, errorResponse, ProviderConfig } from "../types";
import { getDb } from "../../core/db";
import { createClaudeProvider, LLMProviderError } from "../../core/llm";

// ============================================================================
// Types (matching Python schemas)
// ============================================================================

interface LLMConfig {
  provider: string;
  model: string;
  temperature: number;
  max_tokens: number;
}

interface DraftValidation {
  passed: boolean;
  missing_keywords: string[];
  forbidden_keywords: string[];
}

interface DraftResponse {
  draft_id: string;
  project_id: string;
  conversation_id: string;
  status: "pending" | "ready" | "failed";
  base_commit_hash: string | null;
  turn_anchor_hash: string | null;
  bridge_id: string;
  intent: string;
  text: string | null;
  must_have: string[];
  mustnt_have: string[];
  validation: DraftValidation | null;
  llm_config: LLMConfig | null;
  created_at: string;
  completed_at: string | null;
}

// ============================================================================
// Helpers
// ============================================================================

function utcNowIso(): string {
  return new Date().toISOString();
}

function generateDraftId(): string {
  const hex = Math.random().toString(16).substring(2, 10);
  return `draft_${hex}`;
}

/**
 * Extract must_have keywords from conversation turns
 */
function extractMustHave(projectId: string, conversationId: string): string[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT rings_json FROM turns_v2
    WHERE project_id = ? AND conversation_id = ?
    ORDER BY created_at ASC
  `).all(projectId, conversationId) as Array<{ rings_json: string | null }>;

  const keywords: string[] = [];

  for (const row of rows) {
    if (!row.rings_json) continue;
    try {
      const rings = JSON.parse(row.rings_json);
      const ring1 = rings.ring1 ?? {};

      // Positive preference keywords
      for (const pref of ring1.preference_keywords ?? []) {
        if (pref.polarity === "positive") {
          const kw = pref.keyword ?? pref.lemma;
          if (kw && !keywords.includes(kw)) {
            keywords.push(kw);
          }
        }
      }

      // Regular keywords
      for (const kw of ring1.keywords ?? []) {
        if (!keywords.includes(kw)) {
          keywords.push(kw);
        }
      }
    } catch {
      // Skip malformed JSON
    }
  }

  return keywords.slice(0, 20);
}

/**
 * Extract mustnt_have keywords from conversation turns
 */
function extractMustntHave(projectId: string, conversationId: string): string[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT rings_json FROM turns_v2
    WHERE project_id = ? AND conversation_id = ?
    ORDER BY created_at ASC
  `).all(projectId, conversationId) as Array<{ rings_json: string | null }>;

  const keywords: string[] = [];

  for (const row of rows) {
    if (!row.rings_json) continue;
    try {
      const rings = JSON.parse(row.rings_json);
      const ring1 = rings.ring1 ?? {};

      // Negative preference keywords
      for (const pref of ring1.preference_keywords ?? []) {
        if (pref.polarity === "negative") {
          const kw = pref.keyword ?? pref.lemma;
          if (kw && !keywords.includes(kw)) {
            keywords.push(kw);
          }
        }
      }
    } catch {
      // Skip malformed JSON
    }
  }

  return keywords.slice(0, 10);
}

/**
 * Validate draft text against constraints
 */
function validateDraft(text: string, mustHave: string[], mustntHave: string[]): DraftValidation {
  const textLower = text.toLowerCase();

  const missing = mustHave.filter(kw => !textLower.includes(kw.toLowerCase()));
  const forbidden = mustntHave.filter(kw => textLower.includes(kw.toLowerCase()));

  return {
    passed: missing.length === 0 && forbidden.length === 0,
    missing_keywords: missing,
    forbidden_keywords: forbidden,
  };
}

/**
 * Build prompt based on bridge_id
 */
function buildBridgePrompt(
  bridgeId: string,
  intent: string,
  contextTurns: Array<{ role: string; content: string }>,
  mustHave: string[],
  mustntHave: string[]
): { system: string; user: string } {
  // Build conversation context
  const contextText = contextTurns
    .slice(-10)
    .map(t => `[${t.role}]: ${t.content.substring(0, 500)}`)
    .join("\n");

  // Constraints
  let constraints = "";
  if (mustHave.length > 0) {
    constraints += `\n\n**Must Include**: ${mustHave.slice(0, 10).join(", ")}`;
  }
  if (mustntHave.length > 0) {
    constraints += `\n\n**Must Avoid**: ${mustntHave.slice(0, 5).join(", ")}`;
  }

  // Select template based on bridge_id
  let system: string;
  let user: string;

  switch (bridgeId) {
    case "plan":
      system = "You are a planning assistant. Create structured, actionable plans based on user requirements.";
      user = `Based on the following conversation context, create a plan for: ${intent}

**Conversation Context**:
${contextText}
${constraints}

Please provide a clear, structured plan with specific steps. Format as markdown.`;
      break;

    case "summary":
      system = "You are a summarization assistant. Create concise, accurate summaries.";
      user = `Summarize the following conversation with focus on: ${intent}

**Conversation Context**:
${contextText}
${constraints}

Provide a concise summary highlighting key points. Format as markdown.`;
      break;

    case "explain":
      system = "You are an explanation assistant. Provide clear, detailed explanations.";
      user = `Based on the conversation context, explain: ${intent}

**Conversation Context**:
${contextText}
${constraints}

Provide a clear explanation. Format as markdown.`;
      break;

    case "clarify":
      system = "You are a clarification assistant. Help identify and resolve ambiguities.";
      user = `Based on the conversation context, clarify: ${intent}

**Conversation Context**:
${contextText}
${constraints}

Identify any ambiguities and provide clarification. Format as markdown.`;
      break;

    default:
      system = "You are a helpful assistant.";
      user = `Intent: ${intent}

Context:
${contextText}
${constraints}`;
  }

  return { system, user };
}

/**
 * Call LLM to generate text
 */
async function callLLM(
  prompt: string,
  systemPrompt: string,
  config: LLMConfig,
  apiKey: string
): Promise<string> {
  const provider = createClaudeProvider({
    apiKey,
    model: config.model,
  });

  // Build full prompt with system context
  const fullPrompt = systemPrompt
    ? `${systemPrompt}\n\n${prompt}`
    : prompt;

  return provider.generate(fullPrompt, {
    temperature: config.temperature,
    maxTokens: config.max_tokens,
  });
}

// ============================================================================
// Route Registration
// ============================================================================

export function registerAgentDraftsRoutes(router: Router, providers: ProviderConfig): void {
  const defaultLLMConfig: LLMConfig = {
    provider: "anthropic",
    model: "claude-sonnet-4-5-20250929",
    temperature: 0.7,
    max_tokens: 4096,
  };

  // POST /api/v1/agent/drafts - Create draft
  router.post("/api/v1/agent/drafts", async (ctx, _req, res) => {
    const body = ctx.body as {
      project_id?: string;
      conversation_id?: string;
      bridge_id?: string;
      intent?: string;
      base_commit_hash?: string;
      turn_anchor_hash?: string;
      llm_config?: Partial<LLMConfig>;
    } | null;

    if (!body?.project_id || !body?.conversation_id || !body?.bridge_id || !body?.intent) {
      sendJson(res, 400, errorResponse(
        "INVALID_REQUEST",
        "project_id, conversation_id, bridge_id, and intent are required"
      ));
      return;
    }

    // Verify project exists
    const db = getDb();
    const project = db.prepare("SELECT 1 FROM projects WHERE project_id = ?").get(body.project_id);
    if (!project) {
      sendJson(res, 404, errorResponse("NOT_FOUND", `Project ${body.project_id} not found`));
      return;
    }

    // Verify conversation exists
    const conversation = db.prepare(
      "SELECT 1 FROM conversations WHERE conversation_id = ? AND project_id = ?"
    ).get(body.conversation_id, body.project_id);
    if (!conversation) {
      sendJson(res, 404, errorResponse("NOT_FOUND", `Conversation ${body.conversation_id} not found`));
      return;
    }

    // Check API key
    if (!providers.anthropicApiKey) {
      sendJson(res, 400, errorResponse("PROVIDER_ERROR", "Anthropic API key not configured"));
      return;
    }

    try {
      // Get conversation turns
      const turns = db.prepare(`
        SELECT role, content FROM turns_v2
        WHERE project_id = ? AND conversation_id = ?
        ORDER BY created_at ASC
      `).all(body.project_id, body.conversation_id) as Array<{ role: string; content: string }>;

      // Extract constraints
      const mustHave = extractMustHave(body.project_id, body.conversation_id);
      const mustntHave = extractMustntHave(body.project_id, body.conversation_id);

      // LLM config
      const llmConfig: LLMConfig = {
        ...defaultLLMConfig,
        ...body.llm_config,
      };

      // Build prompt
      const { system: systemPrompt, user: userPrompt } = buildBridgePrompt(
        body.bridge_id,
        body.intent,
        turns,
        mustHave,
        mustntHave
      );

      // Generate draft (with retries)
      const draftId = generateDraftId();
      const createdAt = utcNowIso();
      let generatedText = "";
      let validation: DraftValidation | null = null;
      let currentPrompt = userPrompt;

      const maxRetries = 3;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        generatedText = await callLLM(currentPrompt, systemPrompt, llmConfig, providers.anthropicApiKey);
        validation = validateDraft(generatedText, mustHave, mustntHave);

        if (validation.passed) break;

        // Add retry hint
        if (attempt < maxRetries - 1) {
          currentPrompt += `\n\nPrevious attempt failed validation. Missing keywords: ${validation.missing_keywords.join(", ")}. Please include them.`;
        }
      }

      const completedAt = utcNowIso();
      const status = validation?.passed ? "ready" : "failed";

      // Save to database
      db.prepare(`
        INSERT INTO drafts_v2 (
          draft_id, project_id, conversation_id, base_commit_hash, turn_anchor_hash,
          bridge_id, bridge_payload_json, must_have_json, mustnt_have_json,
          llm_config_json, text, status, created_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        draftId,
        body.project_id,
        body.conversation_id,
        body.base_commit_hash ?? null,
        body.turn_anchor_hash ?? null,
        body.bridge_id,
        JSON.stringify({ intent: body.intent }),
        JSON.stringify(mustHave),
        JSON.stringify(mustntHave),
        JSON.stringify(llmConfig),
        generatedText,
        status,
        createdAt,
        completedAt
      );

      const response: DraftResponse = {
        draft_id: draftId,
        project_id: body.project_id,
        conversation_id: body.conversation_id,
        status,
        base_commit_hash: body.base_commit_hash ?? null,
        turn_anchor_hash: body.turn_anchor_hash ?? null,
        bridge_id: body.bridge_id,
        intent: body.intent,
        text: generatedText,
        must_have: mustHave,
        mustnt_have: mustntHave,
        validation,
        llm_config: llmConfig,
        created_at: createdAt,
        completed_at: completedAt,
      };

      sendJson(res, 201, successResponse(response));
    } catch (err) {
      if (err instanceof LLMProviderError) {
        sendJson(res, 503, errorResponse("LLM_ERROR", err.message));
        return;
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("DRAFT_CREATE_FAILED", message));
    }
  });

  // GET /api/v1/agent/drafts/:draft_id - Get draft
  router.get(/^\/api\/v1\/agent\/drafts\/(draft_[a-f0-9]+)$/, async (ctx, _req, res) => {
    const match = ctx.path.match(/^\/api\/v1\/agent\/drafts\/(draft_[a-f0-9]+)$/);
    const draftId = match?.[1];

    if (!draftId) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "draft_id is required"));
      return;
    }

    try {
      const db = getDb();
      const row = db.prepare(`
        SELECT draft_id, project_id, conversation_id, base_commit_hash, turn_anchor_hash,
               bridge_id, bridge_payload_json, must_have_json, mustnt_have_json,
               llm_config_json, text, status, created_at, completed_at
        FROM drafts_v2
        WHERE draft_id = ?
      `).get(draftId) as {
        draft_id: string;
        project_id: string;
        conversation_id: string;
        base_commit_hash: string | null;
        turn_anchor_hash: string | null;
        bridge_id: string;
        bridge_payload_json: string | null;
        must_have_json: string | null;
        mustnt_have_json: string | null;
        llm_config_json: string | null;
        text: string | null;
        status: string;
        created_at: string;
        completed_at: string | null;
      } | undefined;

      if (!row) {
        sendJson(res, 404, errorResponse("NOT_FOUND", `Draft ${draftId} not found`));
        return;
      }

      // Parse JSON fields
      const bridgePayload = row.bridge_payload_json ? JSON.parse(row.bridge_payload_json) : {};
      const mustHave = row.must_have_json ? JSON.parse(row.must_have_json) : [];
      const mustntHave = row.mustnt_have_json ? JSON.parse(row.mustnt_have_json) : [];
      const llmConfig = row.llm_config_json ? JSON.parse(row.llm_config_json) : null;

      // Re-validate
      const validation = row.text ? validateDraft(row.text, mustHave, mustntHave) : null;

      const response: DraftResponse = {
        draft_id: row.draft_id,
        project_id: row.project_id,
        conversation_id: row.conversation_id,
        status: row.status as "pending" | "ready" | "failed",
        base_commit_hash: row.base_commit_hash,
        turn_anchor_hash: row.turn_anchor_hash,
        bridge_id: row.bridge_id,
        intent: bridgePayload.intent ?? "",
        text: row.text,
        must_have: mustHave,
        mustnt_have: mustntHave,
        validation,
        llm_config: llmConfig,
        created_at: row.created_at,
        completed_at: row.completed_at,
      };

      sendJson(res, 200, successResponse(response));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("DRAFT_GET_FAILED", message));
    }
  });

  // PATCH /api/v1/agent/drafts/:draft_id - Update draft
  router.patch(/^\/api\/v1\/agent\/drafts\/(draft_[a-f0-9]+)$/, async (ctx, _req, res) => {
    const match = ctx.path.match(/^\/api\/v1\/agent\/drafts\/(draft_[a-f0-9]+)$/);
    const draftId = match?.[1];

    if (!draftId) {
      sendJson(res, 400, errorResponse("INVALID_REQUEST", "draft_id is required"));
      return;
    }

    const body = ctx.body as {
      feedback?: string;
      append_must_have?: string[];
    } | null;

    if (!providers.anthropicApiKey) {
      sendJson(res, 503, errorResponse("PROVIDER_ERROR", "Anthropic API key not configured"));
      return;
    }

    try {
      const db = getDb();
      const row = db.prepare(`
        SELECT draft_id, project_id, conversation_id, base_commit_hash, turn_anchor_hash,
               bridge_id, bridge_payload_json, must_have_json, mustnt_have_json,
               llm_config_json, text, status, created_at
        FROM drafts_v2
        WHERE draft_id = ?
      `).get(draftId) as {
        draft_id: string;
        project_id: string;
        conversation_id: string;
        base_commit_hash: string | null;
        turn_anchor_hash: string | null;
        bridge_id: string;
        bridge_payload_json: string | null;
        must_have_json: string | null;
        mustnt_have_json: string | null;
        llm_config_json: string | null;
        text: string | null;
        status: string;
        created_at: string;
      } | undefined;

      if (!row) {
        sendJson(res, 404, errorResponse("NOT_FOUND", `Draft ${draftId} not found`));
        return;
      }

      // Parse existing data
      const bridgePayload = row.bridge_payload_json ? JSON.parse(row.bridge_payload_json) : {};
      let mustHave: string[] = row.must_have_json ? JSON.parse(row.must_have_json) : [];
      const mustntHave: string[] = row.mustnt_have_json ? JSON.parse(row.mustnt_have_json) : [];
      const llmConfig: LLMConfig = row.llm_config_json
        ? JSON.parse(row.llm_config_json)
        : defaultLLMConfig;

      // Update must_have
      if (body?.append_must_have) {
        for (const kw of body.append_must_have) {
          if (!mustHave.includes(kw)) {
            mustHave.push(kw);
          }
        }
      }

      // Get conversation context
      const turns = db.prepare(`
        SELECT role, content FROM turns_v2
        WHERE project_id = ? AND conversation_id = ?
        ORDER BY created_at ASC
      `).all(row.project_id, row.conversation_id) as Array<{ role: string; content: string }>;

      // Rebuild prompt with feedback
      let intent = bridgePayload.intent ?? "";
      if (body?.feedback) {
        intent = `${intent}\n\nUser feedback: ${body.feedback}`;
      }

      const { system: systemPrompt, user: userPrompt } = buildBridgePrompt(
        row.bridge_id,
        intent,
        turns,
        mustHave,
        mustntHave
      );

      // Regenerate
      const generatedText = await callLLM(userPrompt, systemPrompt, llmConfig, providers.anthropicApiKey);
      const validation = validateDraft(generatedText, mustHave, mustntHave);

      const completedAt = utcNowIso();
      const status = validation.passed ? "ready" : "failed";

      // Update database
      db.prepare(`
        UPDATE drafts_v2
        SET text = ?, status = ?, must_have_json = ?, completed_at = ?, bridge_payload_json = ?
        WHERE draft_id = ?
      `).run(
        generatedText,
        status,
        JSON.stringify(mustHave),
        completedAt,
        JSON.stringify({ intent }),
        draftId
      );

      const response: DraftResponse = {
        draft_id: draftId,
        project_id: row.project_id,
        conversation_id: row.conversation_id,
        status: status as "pending" | "ready" | "failed",
        base_commit_hash: row.base_commit_hash,
        turn_anchor_hash: row.turn_anchor_hash,
        bridge_id: row.bridge_id,
        intent,
        text: generatedText,
        must_have: mustHave,
        mustnt_have: mustntHave,
        validation,
        llm_config: llmConfig,
        created_at: row.created_at,
        completed_at: completedAt,
      };

      sendJson(res, 200, successResponse(response));
    } catch (err) {
      if (err instanceof LLMProviderError) {
        sendJson(res, 503, errorResponse("LLM_ERROR", err.message));
        return;
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 500, errorResponse("DRAFT_UPDATE_FAILED", message));
    }
  });
}
