/**
 * Agent Drafts API Route
 *
 * POST /api/v1/agent/drafts - Create draft with LLM generation
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import {
  findProjectById,
  findConversationById,
  findTurnsByConversation,
  insertDraft,
} from '@t3x/storage';
import { createClaudeProvider } from '@/lib/providers';
import { LLMProviderError } from '@t3x/core';

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

interface CreateDraftRequest {
  project_id: string;
  conversation_id: string;
  bridge_id: string;
  intent: string;
  base_commit_hash?: string;
  turn_anchor_hash?: string;
  llm_config?: Partial<LLMConfig>;
}

// ============================================================================
// Helpers
// ============================================================================

const DRAFT_STOP_WORDS = new Set([
  'be', 'is', 'am', 'are', 'was', 'were', 'been', 'being',
  'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing',
  'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can',
  'want', 'need', 'let', 'try', 'keep', 'seem', 'help', 'show',
  'come', 'go', 'get', 'make', 'take', 'put', 'give', 'use',
  'say', 'tell', 'ask', 'think', 'know', 'see', 'look', 'find',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it', 'they',
  'this', 'that', 'these', 'those', 'a', 'an', 'the',
  'something', 'anything', 'nothing', 'everything',
  'someone', 'anyone', 'everyone', 'nobody',
  'some', 'any', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
  'good', 'great', 'nice', 'well', 'better', 'best',
  'new', 'old', 'big', 'small', 'long', 'short',
  'thing', 'things', 'way', 'ways', 'time', 'times',
  'lot', 'lots', 'much', 'many', 'little', 'less', 'least',
  'also', 'just', 'only', 'even', 'still', 'already', 'always', 'never',
  'very', 'really', 'quite', 'pretty',
]);

function isValueableKeyword(keyword: string): boolean {
  const kw = keyword.toLowerCase().trim();
  if (kw.length < 3) return false;
  if (DRAFT_STOP_WORDS.has(kw)) return false;
  if (/^\d+$/.test(kw)) return false;
  if (!/^[a-z]/i.test(kw)) return false;
  return true;
}

async function extractMustHave(
  db: Awaited<ReturnType<typeof getDB>>,
  projectId: string,
  conversationId: string
): Promise<string[]> {
  const turns = await findTurnsByConversation(db, { conversationId, limit: 100 });

  const keywords: string[] = [];
  const seenLower = new Set<string>();

  for (const turn of turns) {
    if (!turn.ringsJson) continue;
    try {
      const rings = JSON.parse(turn.ringsJson);
      const ring1 = rings.ring1 ?? {};

      for (const kw of ring1.keywords ?? []) {
        const kwText = typeof kw === 'string' ? kw : kw.text ?? kw.lemma;
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

async function extractMustntHave(
  db: Awaited<ReturnType<typeof getDB>>,
  projectId: string,
  conversationId: string
): Promise<string[]> {
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

function validateDraft(
  text: string,
  mustHave: string[],
  mustntHave: string[]
): DraftValidation {
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
    case 'plan':
      system = 'You are a planning assistant. Create structured, actionable plans.';
      user = `Create a plan for: ${intent}\n\n**Context**:\n${contextText}${constraints}`;
      break;
    case 'summary':
      system = 'You are a summarization assistant. Create concise, accurate summaries.';
      user = `Summarize with focus on: ${intent}\n\n**Context**:\n${contextText}${constraints}`;
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

function successResponse<T>(data: T) {
  return { success: true, data };
}

function errorResponse(code: string, message: string) {
  return { success: false, error: { code, message } };
}

// ============================================================================
// Route Handler
// ============================================================================

const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-5-20250929',
  temperature: 0.7,
  max_tokens: 4096,
};

export async function POST(request: NextRequest) {
  let body: CreateDraftRequest | null = null;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(errorResponse('INVALID_JSON', 'Invalid JSON body'), { status: 400 });
  }

  if (!body?.project_id || !body?.conversation_id || !body?.bridge_id || !body?.intent) {
    return NextResponse.json(
      errorResponse(
        'INVALID_REQUEST',
        'project_id, conversation_id, bridge_id, and intent are required'
      ),
      { status: 400 }
    );
  }

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    return NextResponse.json(
      errorResponse('PROVIDER_ERROR', 'Anthropic API key not configured'),
      { status: 400 }
    );
  }

  try {
    const db = await getDB();

    // Verify project exists
    const project = await findProjectById(db, body.project_id);
    if (!project) {
      return NextResponse.json(
        errorResponse('NOT_FOUND', `Project ${body.project_id} not found`),
        { status: 404 }
      );
    }

    // Verify conversation exists
    const conversation = await findConversationById(db, body.conversation_id);
    if (!conversation) {
      return NextResponse.json(
        errorResponse('NOT_FOUND', `Conversation ${body.conversation_id} not found`),
        { status: 404 }
      );
    }

    // Get conversation turns
    const turns = await findTurnsByConversation(db, { conversationId: body.conversation_id, limit: 100 });
    const turnData = turns.map((t) => ({ role: t.role, content: t.content }));

    // Extract constraints
    const mustHave = await extractMustHave(db, body.project_id, body.conversation_id);
    const mustntHave = await extractMustntHave(db, body.project_id, body.conversation_id);

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

    // Save to database (draftId is auto-generated)
    const draft = await insertDraft(db, {
      projectId: body.project_id,
      conversationId: body.conversation_id,
      baseCommitHash: body.base_commit_hash,
      turnAnchorHash: body.turn_anchor_hash,
      bridgeId: body.bridge_id,
      bridgePayload: { intent: body.intent },
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

    return NextResponse.json(successResponse(response), { status: 201 });
  } catch (err) {
    if (err instanceof LLMProviderError) {
      return NextResponse.json(errorResponse('LLM_ERROR', err.message), { status: 503 });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('DRAFT_CREATE_FAILED', message), { status: 500 });
  }
}
