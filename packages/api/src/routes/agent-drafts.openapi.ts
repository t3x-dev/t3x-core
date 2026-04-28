/**
 * Agent Drafts Routes (with LLM generation)
 *
 * POST  /v1/agent/drafts       - Create draft with LLM generation
 * GET   /v1/agent/drafts/{id}  - Get draft
 * PATCH /v1/agent/drafts/{id}  - Update draft with feedback
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { SemanticContent } from '@t3x-dev/core';
import { createClaudeProvider, flattenTrees, LLMProviderError } from '@t3x-dev/core';
import {
  findAgentDraftById,
  findConversationById,
  findProjectById,
  findTurnsByConversation,
  insertAgentDraft,
  listActiveYOpsLogByConversation,
  updateAgentDraft,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { getLLMProvider } from '../lib/provider-registry';
import { getUserId, recordUsageFireAndForget } from '../lib/usage-tracking';
import { replayYOpsLog, toYOpsLogEntries } from '../lib/yops-log-utils';
import { ErrorResponseSchema, IdParamSchema, SuccessResponseSchema } from '../schemas/common';

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
  /** Warnings about potential quality issues (e.g., fallback used) */
  warnings?: string[];
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

// Slot key patterns that indicate polarity/sentiment metadata (not content keywords)
const POLARITY_KEYS = /^(polarity|sentiment|preference|mood|attitude|valence)$/i;
const NEGATIVE_VALUES = /^(negative|avoid|exclude|dislike|against|no|must.not|don.t|never)$/i;
const NEGATIVE_FRAME_TYPES = /\b(dislike|avoid|exclude|negative|reject|ban)\b/i;
// Slot KEY patterns that imply the value is something negative/unwanted
// Uses (?:^|_) and (?:_|$) as boundaries since slot keys use snake_case
const NEGATIVE_SLOT_KEYS =
  /(?:^|_)(exclude|avoid|not_interested|dislike|reject|ban|allerg(?:en|y|ic)?|dont_want|must_not|negative)(?:_|$)/i;

/**
 * Extract a flat string value from a SlotValue (skip refs, inline frames, arrays).
 */
function slotToString(val: unknown): string | null {
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  return null;
}

/**
 * Extract must-have/must-not-have from Frame snapshot.
 * Traverses ALL slot values (LLM-emergent names) instead of hardcoded slot names.
 * Detects polarity from slot keys, slot values, and frame type.
 */
function extractPreferencesFromFrames(snapshot: SemanticContent): {
  mustHave: string[];
  mustNotHave: string[];
} {
  const mustHave: string[] = [];
  const mustNotHave: string[] = [];
  const seenLower = new Set<string>();

  for (const frame of flattenTrees(snapshot.trees)) {
    const slots = frame.slots;

    // Determine frame-level polarity from metadata slots and frame type
    let isNegative = NEGATIVE_FRAME_TYPES.test(frame.type);

    for (const [key, val] of Object.entries(slots)) {
      if (!POLARITY_KEYS.test(key)) continue;
      const str = slotToString(val);
      if (!str) continue;
      if (NEGATIVE_VALUES.test(str)) isNegative = true;
    }

    // Collect and classify keywords from all non-polarity slots
    for (const [key, val] of Object.entries(slots)) {
      if (POLARITY_KEYS.test(key)) continue;
      const str = slotToString(val);
      if (!str || !isValueableKeyword(str)) continue;

      const kwLower = str.toLowerCase();
      if (seenLower.has(kwLower)) continue;
      seenLower.add(kwLower);

      // Per-slot negative: slot key implies unwanted (e.g., exclude="hostels")
      if (isNegative || NEGATIVE_SLOT_KEYS.test(key)) {
        mustNotHave.push(str);
      } else {
        mustHave.push(str);
      }
    }
  }

  return { mustHave, mustNotHave };
}

async function extractMustHave(db: DBType, conversationId: string): Promise<string[]> {
  // Strategy 1: Tree snapshot
  const yopsLogs = await listActiveYOpsLogByConversation(db, conversationId);
  if (yopsLogs.length > 0) {
    const snapshot = replayYOpsLog(toYOpsLogEntries(yopsLogs));
    const prefs = extractPreferencesFromFrames(snapshot);
    if (prefs.mustHave.length > 0) {
      return prefs.mustHave.slice(0, 15);
    }
  }

  // Strategy 2: Ring 1 keywords (legacy fallback)
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
  // Strategy 1: Tree snapshot
  const yopsLogs = await listActiveYOpsLogByConversation(db, conversationId);
  if (yopsLogs.length > 0) {
    const snapshot = replayYOpsLog(toYOpsLogEntries(yopsLogs));
    const prefs = extractPreferencesFromFrames(snapshot);
    if (prefs.mustNotHave.length > 0) {
      return prefs.mustNotHave.slice(0, 10);
    }
  }

  // Strategy 2: Ring 1 preference keywords (legacy fallback)
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
- Avoid repeating the same idea in multiple nodes.

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
- Preserve timeline, causality, and continuity across nodes.
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
        'You are an editing assistant. Identify core nodes to keep and nodes that need refinement, then suggest improvements.';
      user = `Refine content for: ${intent}

Output format:
A) Keep-as-core: nodes that must remain (key facts/conclusions).
B) Needs-refine: nodes that are unclear, redundant, inconsistent, or poorly phrased.
Notes:
- Keep node-level granularity so users can locate the original text.
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
  model: 'claude-sonnet-4-6',
  temperature: 0.7,
  max_tokens: 4096,
};

// ============================================================================
// OpenAPI Schemas
// ============================================================================

const LLMConfigSchema = z.object({
  provider: z.string(),
  model: z.string(),
  temperature: z.number(),
  max_tokens: z.number().int(),
});

const DraftValidationSchema = z.object({
  passed: z.boolean(),
  missing_keywords: z.array(z.string()),
  forbidden_keywords: z.array(z.string()),
});

const DraftResponseSchema = z.object({
  draft_id: z.string(),
  project_id: z.string(),
  conversation_id: z.string(),
  lifecycle_status: z.enum(['ephemeral', 'adopted', 'superseded']),
  validation_status: z.enum(['pending', 'passed', 'failed']),
  base_commit_hash: z.string().nullable(),
  turn_anchor_hash: z.string().nullable(),
  bridge_id: z.string(),
  intent: z.string(),
  text: z.string().nullable(),
  must_have: z.array(z.string()),
  mustnt_have: z.array(z.string()),
  validation: DraftValidationSchema.nullable(),
  llm_config: LLMConfigSchema.nullable(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
  warnings: z.array(z.string()).optional(),
});

const CreateAgentDraftRequestSchema = z.object({
  project_id: z.string().min(1),
  conversation_id: z.string().min(1),
  bridge_id: z.string().min(1),
  intent: z.string().min(1),
  base_commit_hash: z.string().optional(),
  turn_anchor_hash: z.string().optional(),
  llm_config: LLMConfigSchema.partial().optional(),
  selected_text: z.string().optional(),
  cosine: z.number().optional(),
  keep_ratio: z.number().optional(),
});

const PatchAgentDraftRequestSchema = z.object({
  feedback: z.string().optional(),
  append_must_have: z.array(z.string()).optional(),
});

// ============================================================================
// Routes
// ============================================================================

export const agentDraftRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });

// POST /v1/agent/drafts
const createAgentDraftRoute = createRoute({
  method: 'post',
  path: '/v1/agent/drafts',
  tags: ['Drafts'],
  summary: 'Create draft with LLM generation',
  request: {
    body: {
      content: { 'application/json': { schema: CreateAgentDraftRequestSchema } },
    },
  },
  responses: {
    201: {
      description: 'Draft created',
      content: { 'application/json': { schema: SuccessResponseSchema(DraftResponseSchema) } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

agentDraftRoutes.openapi(createAgentDraftRoute, async (c) => {
  const body = c.req.valid('json');

  // Get LLM provider from registry (preferred) or fall back to direct Anthropic
  let llmProviderInstance = await getLLMProvider();
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!llmProviderInstance && !anthropicApiKey) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'PROVIDER_ERROR',
          message: 'No LLM provider configured. Set ANTHROPIC_API_KEY or configure a provider.',
        },
      },
      400
    );
  }

  try {
    const db = await getDB();

    // Verify project exists
    const project = await findProjectById(db, body.project_id);
    if (!project) {
      return errorResponse(c, 'NOT_FOUND', `Project ${body.project_id} not found`);
    }

    // Verify conversation exists
    const conversation = await findConversationById(db, body.conversation_id);
    if (!conversation) {
      return errorResponse(c, 'NOT_FOUND', `Conversation ${body.conversation_id} not found`);
    }

    // Get conversation turns (or use pre-selected text if provided)
    let turnData: Array<{ role: string; content: string }>;
    const warnings: string[] = [];

    if (body.selected_text?.trim()) {
      // Use pre-selected text from curate preview
      turnData = [{ role: 'context', content: body.selected_text }];
    } else {
      // Explicit warning: full conversation fallback may reduce quality
      // Users should use curate preview to select relevant text first
      const turns = await findTurnsByConversation(db, {
        conversationId: body.conversation_id,
        limit: 100,
      });
      turnData = turns.map((t) => ({ role: t.role, content: t.content }));
      warnings.push(
        `No selected_text provided - using full conversation (${turns.length} turns). ` +
          `For better quality, use POST /v1/curate/preview to select relevant chunks first.`
      );
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

    // Generate draft — use registry provider if available, else direct Claude
    if (!llmProviderInstance && anthropicApiKey) {
      llmProviderInstance = createClaudeProvider({
        apiKey: anthropicApiKey,
        model: llmConfig.model,
      });
    }

    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
    const genResult = await llmProviderInstance!.generate(fullPrompt, {
      temperature: llmConfig.temperature,
      maxTokens: llmConfig.max_tokens,
    });
    const generatedText = genResult.text;

    // Record usage (fire-and-forget)
    if (genResult.usage.inputTokens || genResult.usage.outputTokens) {
      recordUsageFireAndForget(db, {
        user_id: getUserId(c) ?? undefined,
        project_id: body.project_id,
        endpoint: 'agent_draft_create',
        model: llmProviderInstance!.id,
        input_tokens: genResult.usage.inputTokens,
        output_tokens: genResult.usage.outputTokens,
      });
    }

    const validation = validateDraft(generatedText, mustHave, mustntHave);

    // Save to database
    const draft = await insertAgentDraft(db, {
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

    const data: DraftResponse = {
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
      ...(warnings.length > 0 ? { warnings } : {}),
    };

    return c.json({ success: true as const, data }, 201);
  } catch (err) {
    if (err instanceof LLMProviderError) {
      return c.json(
        {
          success: false as const,
          error: { code: 'LLM_ERROR', message: err.message },
        },
        500
      );
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json(
      {
        success: false as const,
        error: { code: 'DRAFT_CREATE_FAILED', message },
      },
      500
    );
  }
});

// GET /v1/agent/drafts/{id}
const getAgentDraftRoute = createRoute({
  method: 'get',
  path: '/v1/agent/drafts/{id}',
  tags: ['Drafts'],
  summary: 'Get draft by ID',
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      description: 'Draft found',
      content: { 'application/json': { schema: SuccessResponseSchema(DraftResponseSchema) } },
    },
    404: {
      description: 'Draft not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

agentDraftRoutes.openapi(getAgentDraftRoute, async (c) => {
  const { id: draftId } = c.req.valid('param');

  try {
    const db = await getDB();
    const draft = await findAgentDraftById(db, draftId);

    if (!draft) {
      return errorResponse(c, 'NOT_FOUND', `Draft ${draftId} not found`);
    }

    // Parse JSON fields
    const bridgePayload = draft.bridgePayloadJson ? JSON.parse(draft.bridgePayloadJson) : {};
    const mustHave = draft.mustHaveJson ? JSON.parse(draft.mustHaveJson) : [];
    const mustntHave = draft.mustntHaveJson ? JSON.parse(draft.mustntHaveJson) : [];
    const llmConfig = draft.llmConfigJson ? JSON.parse(draft.llmConfigJson) : null;

    // Re-validate
    const validation = draft.text ? validateDraft(draft.text, mustHave, mustntHave) : null;
    const validationStatus = !draft.text ? 'pending' : validation?.passed ? 'passed' : 'failed';

    const data: DraftResponse = {
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

    return c.json({ success: true as const, data }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json(
      {
        success: false as const,
        error: { code: 'DRAFT_GET_FAILED', message },
      },
      500
    );
  }
});

// PATCH /v1/agent/drafts/{id}
const patchAgentDraftRoute = createRoute({
  method: 'patch',
  path: '/v1/agent/drafts/{id}',
  tags: ['Drafts'],
  summary: 'Update draft with feedback',
  request: {
    params: IdParamSchema,
    body: {
      content: { 'application/json': { schema: PatchAgentDraftRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Draft updated',
      content: { 'application/json': { schema: SuccessResponseSchema(DraftResponseSchema) } },
    },
    404: {
      description: 'Draft not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

agentDraftRoutes.openapi(patchAgentDraftRoute, async (c) => {
  const { id: draftId } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();
    const draft = await findAgentDraftById(db, draftId);

    if (!draft) {
      return errorResponse(c, 'NOT_FOUND', `Draft ${draftId} not found`);
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

    // Regenerate — use registry provider if available, else direct Claude
    let patchProvider = await getLLMProvider();
    if (!patchProvider) {
      const patchApiKey = process.env.ANTHROPIC_API_KEY;
      if (!patchApiKey) {
        return c.json(
          {
            success: false as const,
            error: { code: 'PROVIDER_ERROR', message: 'No LLM provider configured' },
          },
          500
        );
      }
      patchProvider = createClaudeProvider({
        apiKey: patchApiKey,
        model: llmConfig.model,
      });
    }

    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
    const genResult = await patchProvider.generate(fullPrompt, {
      temperature: llmConfig.temperature,
      maxTokens: llmConfig.max_tokens,
    });
    const generatedText = genResult.text;

    // Record usage (fire-and-forget)
    if (genResult.usage.inputTokens || genResult.usage.outputTokens) {
      recordUsageFireAndForget(db, {
        user_id: getUserId(c) ?? undefined,
        project_id: draft.projectId,
        endpoint: 'agent_draft_patch',
        model: patchProvider.id,
        input_tokens: genResult.usage.inputTokens,
        output_tokens: genResult.usage.outputTokens,
      });
    }

    const validation = validateDraft(generatedText, mustHave, mustntHave);
    const completedAt = new Date();

    // Update database
    await updateAgentDraft(db, draftId, {
      text: generatedText,
      mustHave,
      bridgePayload: { intent },
      completedAt,
    });

    const data: DraftResponse = {
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

    return c.json({ success: true as const, data }, 200);
  } catch (err) {
    if (err instanceof LLMProviderError) {
      return c.json(
        {
          success: false as const,
          error: { code: 'LLM_ERROR', message: err.message },
        },
        500
      );
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json(
      {
        success: false as const,
        error: { code: 'DRAFT_UPDATE_FAILED', message },
      },
      500
    );
  }
});
