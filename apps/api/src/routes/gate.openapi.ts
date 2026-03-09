/**
 * Gate Check Routes
 *
 * Run quality gates (structure, semantic, business) on semantic content.
 *
 * Endpoints:
 * - POST /v1/gate/check - Run quality gates on semantic content
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { GateRunner, type LLMProvider } from '@t3x/core';
import { findConversationById, findTurnsByConversation } from '@t3x/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { getLLMProvider } from '../lib/provider-registry';
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
  scope: z.enum(['commit', 'project']).optional(),
});

const FrameSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  slots: z.record(z.any()),
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
});

const StructureChecksSchema = z.object({
  schema_valid: z.boolean(),
  refs_intact: z.boolean(),
  relations_valid: z.boolean(),
  no_cycles: z.boolean(),
  no_duplicate_ids: z.boolean(),
  no_self_relations: z.boolean(),
});

const StructureGateResultSchema = z.object({
  passed: z.boolean(),
  checks: StructureChecksSchema,
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
  dimensions: z.record(DimensionResultSchema),
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
  const { content, business_rules, gates } = body;
  let { turns } = body;
  const conversationId = body.conversation_id;

  try {
    // If conversation_id provided and no turns, fetch turns from DB
    if (conversationId && (!turns || turns.length === 0)) {
      const db = await getDB();
      const conversation = await findConversationById(db, conversationId);
      if (!conversation) {
        return errorResponse(
          c,
          'CONVERSATION_NOT_FOUND',
          `Conversation not found: ${conversationId}`
        );
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

    // Determine which gates to skip
    const skipSemantic = !gates.includes('semantic');
    const skipBusiness = !gates.includes('business');

    // Get LLM provider (for Gate 2 and/or Gate 3 LLM rules)
    let provider: LLMProvider | null = null;
    if (!skipSemantic || (!skipBusiness && business_rules?.some((r) => r.type === 'llm'))) {
      provider = await getLLMProvider();
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
