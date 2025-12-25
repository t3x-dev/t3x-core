/**
 * Agent Draft by ID API Route
 *
 * GET /api/v1/agent/drafts/:id - Get draft
 * PATCH /api/v1/agent/drafts/:id - Update draft with feedback
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { findDraftById, findTurnsByConversation, updateDraft } from '@t3x/storage/pglite';
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

// ============================================================================
// Helpers
// ============================================================================

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

const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-5-20250929',
  temperature: 0.7,
  max_tokens: 4096,
};

// ============================================================================
// Route Handlers
// ============================================================================

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: draftId } = await params;

  if (!draftId) {
    return NextResponse.json(
      errorResponse('INVALID_REQUEST', 'draft_id is required'),
      { status: 400 }
    );
  }

  try {
    const db = await getDB();
    const draft = await findDraftById(db, draftId);

    if (!draft) {
      return NextResponse.json(
        errorResponse('NOT_FOUND', `Draft ${draftId} not found`),
        { status: 404 }
      );
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

    return NextResponse.json(successResponse(response));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('DRAFT_GET_FAILED', message), { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: draftId } = await params;

  if (!draftId) {
    return NextResponse.json(
      errorResponse('INVALID_REQUEST', 'draft_id is required'),
      { status: 400 }
    );
  }

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    return NextResponse.json(
      errorResponse('PROVIDER_ERROR', 'Anthropic API key not configured'),
      { status: 503 }
    );
  }

  let body: { feedback?: string; append_must_have?: string[] } | null = null;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(errorResponse('INVALID_JSON', 'Invalid JSON body'), { status: 400 });
  }

  try {
    const db = await getDB();
    const draft = await findDraftById(db, draftId);

    if (!draft) {
      return NextResponse.json(
        errorResponse('NOT_FOUND', `Draft ${draftId} not found`),
        { status: 404 }
      );
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
    const turns = await findTurnsByConversation(db, { conversationId: draft.conversationId, limit: 100 });
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

    return NextResponse.json(successResponse(response));
  } catch (err) {
    if (err instanceof LLMProviderError) {
      return NextResponse.json(errorResponse('LLM_ERROR', err.message), { status: 503 });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('DRAFT_UPDATE_FAILED', message), { status: 500 });
  }
}
