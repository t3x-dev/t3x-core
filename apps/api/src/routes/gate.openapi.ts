/**
 * Gate Check Routes
 *
 * Run quality gates (structure, semantic, business) on semantic content.
 *
 * Endpoints:
 * - POST /v1/gate/check - Run quality gates on semantic content
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { GateRunner, type LLMProvider } from '@t3x-dev/core';
import { findConversationById, findTurnsByConversation, getBusinessRules } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { getLLMProvider } from '../lib/provider-registry';
import { getUserId, recordUsageFireAndForget, wrapWithUsageTracking } from '../lib/usage-tracking';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const gateRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Schemas
// ============================================================

const TurnSchema = z.object({
  role: z.string().min(1),
  content: z.string().min(1),
});

const BusinessRuleSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['rule', 'llm']),
  rule: z.string().optional(),
  prompt: z.string().optional(),
  message: z.string().optional(),
  severity: z.enum(['error', 'warning']),
});

const FrameSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  slots: z.record(z.string(), z.any()),
  source: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const RelationSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: z.enum(['causes', 'conditions', 'contrasts', 'elaborates', 'follows', 'depends']),
  confidence: z.number().min(0).max(1).optional(),
});

const GateCheckRequest = z.object({
  content: z.object({
    frames: z.array(FrameSchema),
    relations: z.array(RelationSchema),
  }),
  turns: z.array(TurnSchema).optional(),
  business_rules: z.array(BusinessRuleSchema).optional(),
  gates: z
    .array(z.enum(['structure', 'semantic', 'business']))
    .optional()
    .default(['structure', 'semantic', 'business']),
  conversation_id: z.string().optional(),
  project_id: z.string().optional(),
});

const StructureChecksSchema = z.object({
  schema_valid: z.boolean(),
  refs_intact: z.boolean(),
  relations_valid: z.boolean(),
  no_cycles: z.boolean(),
  no_duplicate_ids: z.boolean(),
  no_self_relations: z.boolean(),
});

const ValidationWarningSchema = z.object({
  type: z.string(),
  message: z.string(),
  location: z.string(),
});

const StructureGateResultSchema = z.object({
  passed: z.boolean(),
  checks: StructureChecksSchema,
  warnings: z.array(ValidationWarningSchema).optional(),
});

const DimensionResultSchema = z.object({
  score: z.number(),
  details: z.string(),
});

const SemanticIssueSchema = z.object({
  severity: z.enum(['error', 'warning', 'info']),
  frame_id: z.string().optional(),
  dimension: z.string(),
  description: z.string(),
  suggestion: z.string().optional(),
});

const SemanticGateResultSchema = z.object({
  passed: z.boolean(),
  score: z.number(),
  dimensions: z.record(z.string(), DimensionResultSchema),
  issues: z.array(SemanticIssueSchema),
});

const BusinessRuleResultSchema = z.object({
  rule_id: z.string(),
  passed: z.boolean(),
  message: z.string().optional(),
  severity: z.enum(['error', 'warning']),
});

const BusinessGateResultSchema = z.object({
  passed: z.boolean(),
  results: z.array(BusinessRuleResultSchema),
});

const GateResultSchema = z.object({
  passed: z.boolean(),
  structure: StructureGateResultSchema,
  semantic: SemanticGateResultSchema.optional(),
  business: BusinessGateResultSchema.optional(),
});

const GateCheckResponse = SuccessResponseSchema(GateResultSchema);

// ============================================================
// Route Definition
// ============================================================

const gateCheckRoute = createRoute({
  method: 'post',
  path: '/v1/gate/check',
  tags: ['Gate'],
  summary: 'Run quality gates on semantic content',
  description:
    'Runs up to 3 quality gates (structure, semantic, business) on semantic frame content. Gate 1 (structure) is deterministic. Gate 2 (semantic) requires an LLM provider and conversation turns. Gate 3 (business) evaluates configurable rules.',
  request: {
    body: {
      content: { 'application/json': { schema: GateCheckRequest } },
    },
  },
  responses: {
    200: {
      description: 'Gate check completed',
      content: { 'application/json': { schema: GateCheckResponse } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Conversation not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// ============================================================
// Route Handler
// ============================================================

gateRoutes.openapi(gateCheckRoute, async (c) => {
  const body = c.req.valid('json');
  const { content, gates } = body;
  let { turns, business_rules } = body;
  const conversationId = body.conversation_id;
  const projectId = body.project_id;

  try {
    const db = await getDB();
    let resolvedProjectId = projectId;

    // If conversation_id provided and no turns, fetch turns from DB
    if (conversationId && (!turns || turns.length === 0)) {
      const conversation = await findConversationById(db, conversationId);
      if (!conversation) {
        return errorResponse(
          c,
          'CONVERSATION_NOT_FOUND',
          `Conversation not found: ${conversationId}`
        );
      }

      // Derive project_id from conversation if not explicitly provided
      if (!resolvedProjectId) {
        resolvedProjectId = conversation.projectId;
      }

      const dbTurns = await findTurnsByConversation(db, {
        conversationId,
        limit: 500,
      });

      if (dbTurns.length > 0) {
        turns = dbTurns.map((t) => ({
          role: t.role,
          content: t.content,
        }));
      }
    }

    // Access control check (if project_id is known)
    if (resolvedProjectId) {
      const accessResult = await assertProjectAccess(c, db, resolvedProjectId);
      if (accessResult instanceof Response) return accessResult;
    }

    // Auto-load business rules from project if none provided
    if ((!business_rules || business_rules.length === 0) && resolvedProjectId) {
      const storedRules = await getBusinessRules(db, resolvedProjectId);
      if (storedRules.length > 0) {
        business_rules = storedRules;
      }
    }

    // Determine which gates to skip
    const skipSemantic = !gates.includes('semantic');
    const skipBusiness = !gates.includes('business');

    // Get LLM provider (for Gate 2 and/or Gate 3 LLM rules)
    let provider: LLMProvider | null = null;
    let trackedUsage: { inputTokens: number; outputTokens: number } | null = null;
    if (!skipSemantic || (!skipBusiness && business_rules?.some((r) => r.type === 'llm'))) {
      const rawProvider = await getLLMProvider();
      if (rawProvider) {
        const tracked = wrapWithUsageTracking(rawProvider);
        provider = tracked.provider;
        trackedUsage = tracked.usage;
      }
    }

    // Run gates
    const runner = new GateRunner();
    const result = await runner.run(content, {
      provider: provider ?? undefined,
      turns,
      businessRules: business_rules,
      skipSemantic,
      skipBusiness,
    });

    // Record usage (fire-and-forget)
    if (
      trackedUsage &&
      (trackedUsage.inputTokens || trackedUsage.outputTokens) &&
      resolvedProjectId
    ) {
      recordUsageFireAndForget(db, {
        user_id: getUserId(c) ?? undefined,
        project_id: resolvedProjectId,
        endpoint: 'gate_check',
        model: provider?.id ?? 'unknown',
        input_tokens: trackedUsage.inputTokens,
        output_tokens: trackedUsage.outputTokens,
      });
    }

    return c.json(
      {
        success: true as const,
        data: result,
      },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'INTERNAL_ERROR', message);
  }
});

export default gateRoutes;
