/**
 * Agent Drafts Routes (with LLM generation)
 *
 * POST  /v1/agent/drafts - Create draft with LLM generation
 * GET   /v1/agent/drafts/:id - Get draft
 * PATCH /v1/agent/drafts/:id - Update draft with feedback
 */

import { createClaudeProvider, LLMProviderError } from '@t3x/core';
import {
  findConversationById,
  findDraftById,
  findProjectById,
  findTurnsByConversation,
  insertDraft,
  updateDraft,
} from '@t3x/storage/pglite';
import { Hono } from 'hono';
import { getDB } from '../lib/db';
import { jsonError, jsonSuccess } from '../lib/response';

// ============================================================================
// Types
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
  lifecycle_status: 'ephemeral' | 'adopted' | 'superseded';
  validation_status: 'pending' | 'passed' | 'failed';
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

const DRAFT_STOP_WORDS = new Set([
  'be',
  'is',
  'am',
  'are',
  'was',
  'were',
  'been',
  'being',
  'have',
  'has',
  'had',
  'having',
  'do',
  'does',
  'did',
  'doing',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'shall',
  'can',
  'want',
  'need',
  'let',
  'try',
  'keep',
  'seem',
  'help',
  'show',
  'come',
  'go',
  'get',
  'make',
  'take',
  'put',
  'give',
  'use',
  'say',
  'tell',
  'ask',
  'think',
  'know',
  'see',
  'look',
  'find',
  'i',
  'me',
  'my',
  'we',
  'our',
  'you',
  'your',
  'he',
  'she',
  'it',
  'they',
  'this',
  'that',
  'these',
  'those',
  'a',
  'an',
  'the',
  'something',
  'anything',
  'nothing',
  'everything',
  'someone',
  'anyone',
  'everyone',
  'nobody',
  'some',
  'any',
  'all',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'good',
  'great',
  'nice',
  'well',
  'better',
  'best',
  'new',
  'old',
  'big',
  'small',
  'long',
  'short',
  'thing',
  'things',
  'way',
  'ways',
  'time',
  'times',
  'lot',
  'lots',
  'much',
  'many',
  'little',
  'less',
  'least',
  'also',
  'just',
  'only',
  'even',
  'still',
  'already',
  'always',
  'never',
  'very',
  'really',
  'quite',
  'pretty',
]);

function isValueableKeyword(keyword: string): boolean {
  const kw = keyword.toLowerCase().trim();
  if (kw.length < 3) return false;
  if (DRAFT_STOP_WORDS.has(kw)) return false;
  if (/^\d+$/.test(kw)) return false;
  if (!/^[a-z]/i.test(kw)) return false;
  return true;
}

type DBType = Awaited<ReturnType<typeof getDB>>;

async function extractMustHave(db: DBType, conversationId: string): Promise<string[]> {
  const turns = await findTurnsByConversation(db, { conversationId, limit: 100 });

  const keywords: string[] = [];
  const seenLower = new Set<string>();

  for (const turn of turns) {
    if (!turn.ringsJson) continue;
    try {
      const rings = JSON.parse(turn.ringsJson);
      const ring1 = rings.ring1 ?? {};

      for (const kw of ring1.keywords ?? []) {
        const kwText = typeof kw === 'string' ? kw : (kw.text ?? kw.lemma);
        const kwLower = kwText?.toLowerCase();
        if (kwText && isValueableKeyword(kwText) && !seenLower.has(kwLower)) {
          seenLower.add(kwLower);
          keywords.push(kwText);
        }
      }
    } catch {
      // Skip malformed JSON
    }
  }

  return keywords.slice(0, 15);
}

async function extractMustntHave(db: DBType, conversationId: string): Promise<string[]> {
  const turns = await findTurnsByConversation(db, { conversationId, limit: 100 });

  const keywords: string[] = [];
  const seenLower = new Set<string>();

  for (const turn of turns) {
    if (!turn.ringsJson) continue;
    try {
      const rings = JSON.parse(turn.ringsJson);
      const ring1 = rings.ring1 ?? {};

      for (const pref of ring1.preferenceKeywords ?? ring1.preference_keywords ?? []) {
        const isNegative =
          pref.polarity === 'negative' || (typeof pref.polarity === 'number' && pref.polarity < 0);
        if (isNegative) {
          const kw = pref.text ?? pref.keyword ?? pref.lemma;
          const kwLower = kw?.toLowerCase();
          if (kw && kwLower && !seenLower.has(kwLower) && !DRAFT_STOP_WORDS.has(kwLower)) {
            seenLower.add(kwLower);
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

function hasWholeWord(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'i');
  return regex.test(text);
}

function validateDraft(text: string, mustHave: string[], mustntHave: string[]): DraftValidation {
  const missing = mustHave.filter((kw) => !hasWholeWord(text, kw));
  const forbidden = mustntHave.filter((kw) => hasWholeWord(text, kw));

  return {
    passed: missing.length === 0 && forbidden.length === 0,
    missing_keywords: missing,
    forbidden_keywords: forbidden,
  };
}

function buildBridgePrompt(
  bridgeId: string,
  intent: string,
  contextTurns: Array<{ role: string; content: string }>,
  mustHave: string[],
  mustntHave: string[]
): { system: string; user: string } {
  const contextText = contextTurns
    .slice(-10)
    .map((t) => `[${t.role}]: ${t.content.substring(0, 500)}`)
    .join('\n');

  let constraints = '';
  if (mustHave.length > 0) {
    constraints += `\n\n**Must Include**: ${mustHave.slice(0, 10).join(', ')}`;
  }
  if (mustntHave.length > 0) {
    constraints += `\n\n**Must Avoid**: ${mustntHave.slice(0, 5).join(', ')}`;
  }

  let system: string;
  let user: string;

  switch (bridgeId) {
    case 'prose':
      system =
        'You are a writing assistant. Extract and rewrite content as coherent prose paragraphs with clear reasoning and flow.';
      user = `Write coherent prose for: ${intent}

Requirements:
- Prefer definitions, explanations, reasoning, contrasts, and implications.
- Keep logical flow: definition/viewpoint -> explanation/reasoning -> (optional) example -> implication/summary.
- Avoid repeating the same idea in multiple sentences.

**Context**:
${contextText}${constraints}`;
      break;
    case 'plan':
      system = 'You are a planning assistant. Create structured, actionable plans.';
      user = `Create a plan for: ${intent}\n\n**Context**:\n${contextText}${constraints}`;
      break;
    case 'story':
      system =
        'You are a narrative assistant. Extract and rewrite content into a coherent story while preserving flow and causality.';
      user = `Create a narrative for: ${intent}

Requirements:
- Preserve timeline, causality, and continuity across sentences.
- Prefer story elements: setup -> development -> climax -> resolution.
- Avoid jumpy isolated quotes; keep transitions.

**Context**:
${contextText}${constraints}`;
      break;
    case 'summary':
      system = 'You are a summarization assistant. Create concise, accurate summaries.';
      user = `Summarize with focus on: ${intent}\n\n**Context**:\n${contextText}${constraints}`;
      break;
    case 'refine':
      system =
        'You are an editing assistant. Identify core sentences to keep and sentences that need refinement, then suggest improvements.';
      user = `Refine content for: ${intent}

Output format:
A) Keep-as-core: sentences that must remain (key facts/conclusions).
B) Needs-refine: sentences that are unclear, redundant, inconsistent, or poorly phrased.
Notes:
- Keep sentence-level granularity so users can locate the original text.
- For Needs-refine, provide a suggested improved version right after each original.

**Context**:
${contextText}${constraints}`;
      break;
    case 'clarify':
      system =
        'You are a clarification assistant. Your job is to ask focused clarifying questions to remove ambiguity and gather missing constraints.';
      user = `Clarify the intent: ${intent}

Output requirements:
- Ask 5-10 clarifying questions.
- Each question should target ONE ambiguity or missing constraint.
- Prioritize questions that would change the final output most.
- Avoid questions that are already answered in the context.
- Do NOT provide a full solution yet; only ask questions.

**Context**:
${contextText}${constraints}`;
      break;
    case 'explain':
      system = 'You are an explanation assistant. Provide clear explanations.';
      user = `Explain: ${intent}\n\n**Context**:\n${contextText}${constraints}`;
      break;
    default:
      system = 'You are a helpful assistant.';
      user = `Intent: ${intent}\n\nContext:\n${contextText}${constraints}`;
  }

  return { system, user };
}

const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-5-20250929',
  temperature: 0.7,
  max_tokens: 4096,
};

// ============================================================================
// Routes
// ============================================================================

export const agentDraftRoutes = new Hono();

/**
 * POST /v1/agent/drafts - Create draft with LLM generation
 */
agentDraftRoutes.post('/v1/agent/drafts', async (c) => {
  let body: {
    project_id?: string;
    conversation_id?: string;
    bridge_id?: string;
    intent?: string;
    base_commit_hash?: string;
    turn_anchor_hash?: string;
    llm_config?: Partial<LLMConfig>;
    /** Optional: pre-selected text from curate preview. If provided, use this instead of full conversation. */
    selected_text?: string;
    /** Curate parameters for debugging/review */
    cosine?: number;
    keep_ratio?: number;
  } | null = null;

  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'INVALID_JSON', 'Invalid JSON body', 400);
  }

  if (!body?.project_id || !body?.conversation_id || !body?.bridge_id || !body?.intent) {
    return jsonError(
      c,
      'INVALID_REQUEST',
      'project_id, conversation_id, bridge_id, and intent are required',
      400
    );
  }

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    return jsonError(c, 'PROVIDER_ERROR', 'Anthropic API key not configured', 400);
  }

  try {
    const db = await getDB();

    // Verify project exists
    const project = await findProjectById(db, body.project_id);
    if (!project) {
      return jsonError(c, 'NOT_FOUND', `Project ${body.project_id} not found`, 404);
    }

    // Verify conversation exists
    const conversation = await findConversationById(db, body.conversation_id);
    if (!conversation) {
      return jsonError(c, 'NOT_FOUND', `Conversation ${body.conversation_id} not found`, 404);
    }

    // Get conversation turns (or use pre-selected text if provided)
    let turnData: Array<{ role: string; content: string }>;

    if (body.selected_text && body.selected_text.trim()) {
      // Use pre-selected text from curate preview
      turnData = [{ role: 'context', content: body.selected_text }];
    } else {
      // Fallback: load full conversation
      const turns = await findTurnsByConversation(db, {
        conversationId: body.conversation_id,
        limit: 100,
      });
      turnData = turns.map((t) => ({ role: t.role, content: t.content }));
    }

    // Extract constraints
    const mustHave = await extractMustHave(db, body.conversation_id);
    const mustntHave = await extractMustntHave(db, body.conversation_id);

    // LLM config
    const llmConfig: LLMConfig = {
      ...DEFAULT_LLM_CONFIG,
      ...body.llm_config,
    };

    // Build prompt
    const { system: systemPrompt, user: userPrompt } = buildBridgePrompt(
      body.bridge_id,
      body.intent,
      turnData,
      mustHave,
      mustntHave
    );

    // Generate draft
    const provider = createClaudeProvider({
      apiKey: anthropicApiKey,
      model: llmConfig.model,
    });

    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
    const generatedText = await provider.generate(fullPrompt, {
      temperature: llmConfig.temperature,
      maxTokens: llmConfig.max_tokens,
    });

    const validation = validateDraft(generatedText, mustHave, mustntHave);

    // Save to database
    const draft = await insertDraft(db, {
      projectId: body.project_id,
      conversationId: body.conversation_id,
      baseCommitHash: body.base_commit_hash,
      turnAnchorHash: body.turn_anchor_hash,
      bridgeId: body.bridge_id,
      bridgePayload: {
        intent: body.intent,
        cosine: body.cosine,
        keep_ratio: body.keep_ratio,
      },
      mustHave,
      mustntHave,
      llmConfig,
      text: generatedText,
    });

    const response: DraftResponse = {
      draft_id: draft.draftId,
      project_id: body.project_id,
      conversation_id: body.conversation_id,
      lifecycle_status: 'ephemeral',
      validation_status: validation.passed ? 'passed' : 'failed',
      base_commit_hash: body.base_commit_hash ?? null,
      turn_anchor_hash: body.turn_anchor_hash ?? null,
      bridge_id: body.bridge_id,
      intent: body.intent,
      text: generatedText,
      must_have: mustHave,
      mustnt_have: mustntHave,
      validation,
      llm_config: llmConfig,
      created_at: draft.createdAt.toISOString(),
      completed_at: draft.completedAt?.toISOString() ?? null,
    };

    return jsonSuccess(c, response, 201);
  } catch (err) {
    if (err instanceof LLMProviderError) {
      return jsonError(c, 'LLM_ERROR', err.message, 500);
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'DRAFT_CREATE_FAILED', message, 500);
  }
});

/**
 * GET /v1/agent/drafts/:id - Get draft
 */
agentDraftRoutes.get('/v1/agent/drafts/:id', async (c) => {
  const draftId = c.req.param('id');

  try {
    const db = await getDB();
    const draft = await findDraftById(db, draftId);

    if (!draft) {
      return jsonError(c, 'NOT_FOUND', `Draft ${draftId} not found`, 404);
    }

    // Parse JSON fields
    const bridgePayload = draft.bridgePayloadJson ? JSON.parse(draft.bridgePayloadJson) : {};
    const mustHave = draft.mustHaveJson ? JSON.parse(draft.mustHaveJson) : [];
    const mustntHave = draft.mustntHaveJson ? JSON.parse(draft.mustntHaveJson) : [];
    const llmConfig = draft.llmConfigJson ? JSON.parse(draft.llmConfigJson) : null;

    // Re-validate
    const validation = draft.text ? validateDraft(draft.text, mustHave, mustntHave) : null;
    const validationStatus = !draft.text ? 'pending' : validation?.passed ? 'passed' : 'failed';

    const response: DraftResponse = {
      draft_id: draft.draftId,
      project_id: draft.projectId,
      conversation_id: draft.conversationId,
      lifecycle_status: draft.status as 'ephemeral' | 'adopted' | 'superseded',
      validation_status: validationStatus as 'pending' | 'passed' | 'failed',
      base_commit_hash: draft.baseCommitHash,
      turn_anchor_hash: draft.turnAnchorHash,
      bridge_id: draft.bridgeId,
      intent: bridgePayload.intent ?? '',
      text: draft.text,
      must_have: mustHave,
      mustnt_have: mustntHave,
      validation,
      llm_config: llmConfig,
      created_at: draft.createdAt.toISOString(),
      completed_at: draft.completedAt?.toISOString() ?? null,
    };

    return jsonSuccess(c, response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'DRAFT_GET_FAILED', message, 500);
  }
});

/**
 * PATCH /v1/agent/drafts/:id - Update draft with feedback
 */
agentDraftRoutes.patch('/v1/agent/drafts/:id', async (c) => {
  const draftId = c.req.param('id');

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    return jsonError(c, 'PROVIDER_ERROR', 'Anthropic API key not configured', 500);
  }

  let body: { feedback?: string; append_must_have?: string[] } | null = null;

  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'INVALID_JSON', 'Invalid JSON body', 400);
  }

  try {
    const db = await getDB();
    const draft = await findDraftById(db, draftId);

    if (!draft) {
      return jsonError(c, 'NOT_FOUND', `Draft ${draftId} not found`, 404);
    }

    // Parse existing data
    const bridgePayload = draft.bridgePayloadJson ? JSON.parse(draft.bridgePayloadJson) : {};
    const mustHave: string[] = draft.mustHaveJson ? JSON.parse(draft.mustHaveJson) : [];
    const mustntHave: string[] = draft.mustntHaveJson ? JSON.parse(draft.mustntHaveJson) : [];
    const llmConfig: LLMConfig = draft.llmConfigJson
      ? JSON.parse(draft.llmConfigJson)
      : DEFAULT_LLM_CONFIG;

    // Update must_have
    if (body?.append_must_have) {
      for (const kw of body.append_must_have) {
        if (!mustHave.includes(kw)) {
          mustHave.push(kw);
        }
      }
    }

    // Get conversation context
    const turns = await findTurnsByConversation(db, {
      conversationId: draft.conversationId,
      limit: 100,
    });
    const turnData = turns.map((t) => ({ role: t.role, content: t.content }));

    // Rebuild prompt with feedback
    let intent = bridgePayload.intent ?? '';
    if (body?.feedback) {
      intent = `${intent}\n\nUser feedback: ${body.feedback}`;
    }

    const { system: systemPrompt, user: userPrompt } = buildBridgePrompt(
      draft.bridgeId,
      intent,
      turnData,
      mustHave,
      mustntHave
    );

    // Regenerate
    const provider = createClaudeProvider({
      apiKey: anthropicApiKey,
      model: llmConfig.model,
    });

    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
    const generatedText = await provider.generate(fullPrompt, {
      temperature: llmConfig.temperature,
      maxTokens: llmConfig.max_tokens,
    });

    const validation = validateDraft(generatedText, mustHave, mustntHave);
    const completedAt = new Date();

    // Update database
    await updateDraft(db, draftId, {
      text: generatedText,
      mustHave,
      bridgePayload: { intent },
      completedAt,
    });

    const response: DraftResponse = {
      draft_id: draftId,
      project_id: draft.projectId,
      conversation_id: draft.conversationId,
      lifecycle_status: draft.status as 'ephemeral' | 'adopted' | 'superseded',
      validation_status: validation.passed ? 'passed' : 'failed',
      base_commit_hash: draft.baseCommitHash,
      turn_anchor_hash: draft.turnAnchorHash,
      bridge_id: draft.bridgeId,
      intent,
      text: generatedText,
      must_have: mustHave,
      mustnt_have: mustntHave,
      validation,
      llm_config: llmConfig,
      created_at: draft.createdAt.toISOString(),
      completed_at: completedAt.toISOString(),
    };

    return jsonSuccess(c, response);
  } catch (err) {
    if (err instanceof LLMProviderError) {
      return jsonError(c, 'LLM_ERROR', err.message, 500);
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'DRAFT_UPDATE_FAILED', message, 500);
  }
});
