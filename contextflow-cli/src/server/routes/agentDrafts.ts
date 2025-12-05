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
import { getDb } from "@contextflow/core";
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
  /** Lifecycle status in database: ephemeral → adopted | superseded */
  lifecycle_status: "ephemeral" | "adopted" | "superseded";
  /** Validation status: whether the draft passed constraint validation */
  validation_status: "pending" | "passed" | "failed";
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

/**
 * Stop words to filter out from must_have keywords
 * These are common words that don't provide meaningful constraints
 */
const DRAFT_STOP_WORDS = new Set([
  // Common verbs
  "be", "is", "am", "are", "was", "were", "been", "being",
  "have", "has", "had", "having",
  "do", "does", "did", "doing",
  "will", "would", "could", "should", "may", "might", "must", "shall", "can",
  "want", "need", "let", "try", "keep", "seem", "help", "show",
  "come", "go", "get", "make", "take", "put", "give", "use",
  "say", "tell", "ask", "think", "know", "see", "look", "find",
  // Pronouns and determiners
  "i", "me", "my", "we", "our", "you", "your", "he", "she", "it", "they",
  "this", "that", "these", "those", "a", "an", "the",
  // Indefinite pronouns (low-value)
  "something", "anything", "nothing", "everything",
  "someone", "anyone", "everyone", "nobody",
  "some", "any", "all", "each", "every", "both", "few", "more", "most",
  // Generic adjectives
  "good", "great", "nice", "well", "better", "best",
  "new", "old", "big", "small", "long", "short",
  // Generic nouns
  "thing", "things", "way", "ways", "time", "times",
  "lot", "lots", "much", "many", "little", "less", "least",
  // Misc low-value
  "also", "just", "only", "even", "still", "already", "always", "never",
  "very", "really", "quite", "pretty",
]);

/**
 * Check if a keyword is meaningful for draft constraints
 */
function isValueableKeyword(keyword: string): boolean {
  const kw = keyword.toLowerCase().trim();
  // Skip empty or very short keywords
  if (kw.length < 2) return false;
  // Skip stop words
  if (DRAFT_STOP_WORDS.has(kw)) return false;
  // Skip pure numbers
  if (/^\d+$/.test(kw)) return false;
  return true;
}

function utcNowIso(): string {
  return new Date().toISOString();
}

function generateDraftId(): string {
  const hex = Math.random().toString(16).substring(2, 10);
  return `draft_${hex}`;
}

/**
 * Extract must_have keywords from conversation turns
 * Filters out stop words and prioritizes domain-specific terms
 */
function extractMustHave(projectId: string, conversationId: string): string[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT rings_json FROM turns_v2
    WHERE project_id = ? AND conversation_id = ?
    ORDER BY created_at ASC
  `).all(projectId, conversationId) as Array<{ rings_json: string | null }>;

  const keywords: string[] = [];
  const seenLower = new Set<string>();

  for (const row of rows) {
    if (!row.rings_json) continue;
    try {
      const rings = JSON.parse(row.rings_json);
      const ring1 = rings.ring1 ?? {};
      const ring2 = rings.ring2 ?? {};

      // 1. Priority: Entities with high confidence (domain-specific terms)
      for (const kw of ring1.keywords ?? []) {
        if (typeof kw === "object" && kw.entityType && kw.confidence > 0.2) {
          const kwText = kw.text ?? kw.lemma;
          const kwLower = kwText?.toLowerCase();
          if (kwText && isValueableKeyword(kwText) && !seenLower.has(kwLower)) {
            seenLower.add(kwLower);
            keywords.push(kwText);
          }
        }
      }

      // 2. Priority: Positive preference keywords (polarity > 0)
      for (const pref of ring1.preferenceKeywords ?? ring1.preference_keywords ?? []) {
        const isPositive = pref.polarity === "positive" || (typeof pref.polarity === "number" && pref.polarity > 0);
        if (isPositive) {
          const kw = pref.text ?? pref.keyword ?? pref.lemma;
          const kwLower = kw?.toLowerCase();
          if (kw && isValueableKeyword(kw) && !seenLower.has(kwLower)) {
            seenLower.add(kwLower);
            keywords.push(kw);
          }
        }
      }

      // 3. Ring2 facets: extract key constraint values
      for (const facet of ring2.facets ?? []) {
        if (facet.facetType === "preference_soft" && facet.key === "prefer") {
          const val = facet.value;
          const valLower = val?.toLowerCase();
          if (val && isValueableKeyword(val) && !seenLower.has(valLower)) {
            seenLower.add(valLower);
            keywords.push(val);
          }
        }
      }

      // 4. Regular keywords with good confidence
      for (const kw of ring1.keywords ?? []) {
        const kwText = typeof kw === "string" ? kw : (kw.text ?? kw.lemma);
        const kwLower = kwText?.toLowerCase();
        // Only include keywords with decent confidence or no confidence (assumed high)
        const conf = typeof kw === "object" ? kw.confidence : 1.0;
        if (kwText && isValueableKeyword(kwText) && !seenLower.has(kwLower) && conf >= 0.5) {
          seenLower.add(kwLower);
          keywords.push(kwText);
        }
      }
    } catch {
      // Skip malformed JSON
    }
  }

  // Return top 15 meaningful keywords (reduced from 20 to improve focus)
  return keywords.slice(0, 15);
}

/**
 * Extract mustnt_have keywords from conversation turns
 * These are items the user explicitly wants to avoid
 */
function extractMustntHave(projectId: string, conversationId: string): string[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT rings_json FROM turns_v2
    WHERE project_id = ? AND conversation_id = ?
    ORDER BY created_at ASC
  `).all(projectId, conversationId) as Array<{ rings_json: string | null }>;

  const keywords: string[] = [];
  const seenLower = new Set<string>();

  for (const row of rows) {
    if (!row.rings_json) continue;
    try {
      const rings = JSON.parse(row.rings_json);
      const ring1 = rings.ring1 ?? {};
      const ring2 = rings.ring2 ?? {};

      // 1. Negative preference keywords (polarity < 0)
      for (const pref of ring1.preferenceKeywords ?? ring1.preference_keywords ?? []) {
        const isNegative = pref.polarity === "negative" || (typeof pref.polarity === "number" && pref.polarity < 0);
        if (isNegative) {
          const kw = pref.text ?? pref.keyword ?? pref.lemma;
          const kwLower = kw?.toLowerCase();
          // For mustnt_have, we want specific domain terms (e.g., "nuts", "shellfish")
          // Skip generic indefinite pronouns like "anything"
          if (kw && kwLower && !seenLower.has(kwLower) && !DRAFT_STOP_WORDS.has(kwLower)) {
            seenLower.add(kwLower);
            keywords.push(kw);
          }
        }
      }

      // 2. Ring2 facets with avoid key
      for (const facet of ring2.facets ?? []) {
        if (facet.facetType === "preference_soft" && facet.key === "avoid") {
          const val = facet.value;
          const valLower = val?.toLowerCase();
          if (val && valLower && !seenLower.has(valLower) && !DRAFT_STOP_WORDS.has(valLower)) {
            seenLower.add(valLower);
            keywords.push(val);
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
 * Check if keyword exists as a whole word in text
 * Uses word boundary matching to avoid false positives like "nut" matching "donut"
 */
function hasWholeWord(text: string, keyword: string): boolean {
  // Escape special regex characters in keyword
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match keyword as a whole word (word boundary or start/end of string)
  const regex = new RegExp(`\\b${escaped}\\b`, "i");
  return regex.test(text);
}

/**
 * Validate draft text against constraints
 */
function validateDraft(text: string, mustHave: string[], mustntHave: string[]): DraftValidation {
  const missing = mustHave.filter(kw => !hasWholeWord(text, kw));
  const forbidden = mustntHave.filter(kw => hasWholeWord(text, kw));

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
      // Database lifecycle status: ephemeral | adopted | superseded
      // New drafts are always ephemeral until explicitly adopted
      const lifecycleStatus = "ephemeral" as const;
      // Validation status: whether constraints were satisfied
      const validationStatus = validation?.passed ? "passed" : "failed" as const;

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
        lifecycleStatus,
        createdAt,
        completedAt
      );

      const response: DraftResponse = {
        draft_id: draftId,
        project_id: body.project_id,
        conversation_id: body.conversation_id,
        lifecycle_status: lifecycleStatus,
        validation_status: validationStatus,
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
      const validationStatus = !row.text ? "pending" : (validation?.passed ? "passed" : "failed");

      const response: DraftResponse = {
        draft_id: row.draft_id,
        project_id: row.project_id,
        conversation_id: row.conversation_id,
        lifecycle_status: row.status as "ephemeral" | "adopted" | "superseded",
        validation_status: validationStatus as "pending" | "passed" | "failed",
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
      const validationStatus = validation.passed ? "passed" : "failed" as const;
      // Lifecycle status remains unchanged (still ephemeral)
      const lifecycleStatus = row.status as "ephemeral" | "adopted" | "superseded";

      // Update database (lifecycle status unchanged, only update text and must_have)
      db.prepare(`
        UPDATE drafts_v2
        SET text = ?, must_have_json = ?, completed_at = ?, bridge_payload_json = ?
        WHERE draft_id = ?
      `).run(
        generatedText,
        JSON.stringify(mustHave),
        completedAt,
        JSON.stringify({ intent }),
        draftId
      );

      const response: DraftResponse = {
        draft_id: draftId,
        project_id: row.project_id,
        conversation_id: row.conversation_id,
        lifecycle_status: lifecycleStatus,
        validation_status: validationStatus,
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
