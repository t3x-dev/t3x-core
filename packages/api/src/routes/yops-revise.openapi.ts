/**
 * POST /v1/conversations/{conversationId}/yops/revise
 *
 * AI-assisted full-script YOps revision endpoint. Produces revised candidate
 * YOps from natural-language feedback, dry-runs them deterministically, and
 * returns the candidate for user review. This route never writes yops_log.
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: revision route accepts permissive YOp payloads from provider/client and normalizes before deterministic dry-run */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { applySourcedYOps, canonicalizeYOps, type LLMPrompt, type SourcedYOp } from '@t3x-dev/core';
import { findConversationById } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { getUserId } from '../lib/project-access';
import { resolveProviderAndModel } from '../lib/provider-resolver';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const yopsReviseRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

const TreeNodeSchema = z
  .object({
    key: z.string(),
    slots: z.record(z.string(), z.any()).default({}),
    children: z.array(z.any()).default([]),
    source: z.any().optional(),
  })
  .passthrough();

const RelationSchema = z
  .object({
    from: z.string(),
    to: z.string(),
    type: z.string(),
  })
  .passthrough();

const RevisionTurnSchema = z.object({
  turn_hash: z.string().min(1),
  role: z.enum(['user', 'assistant', 'system', 'tool']).optional(),
  content: z.string(),
});

const ReviseYOpsRequestSchema = z.object({
  feedback: z.string().min(1).max(4000),
  trees: z.array(TreeNodeSchema).max(500).default([]),
  relations: z.array(RelationSchema).max(2000).default([]),
  yops: z.array(z.record(z.string(), z.any())).min(1).max(5000),
  turns: z.array(RevisionTurnSchema).max(200).optional().default([]),
  provider: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
});

const DryRunSchema = z.object({
  ok: z.boolean(),
  applied: z.number(),
  preview: z
    .object({
      trees: z.array(z.any()),
      relations: z.array(z.any()),
    })
    .optional(),
  error: z
    .object({
      op_index: z.number(),
      code: z.string(),
      message: z.string(),
    })
    .optional(),
});

const ReviseYOpsResponseSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ok'),
    ops: z.array(z.any()),
    reason: z.string(),
    dry_run: DryRunSchema,
  }),
  z.object({
    kind: z.literal('validation_failed'),
    ops: z.array(z.any()),
    reason: z.string(),
    dry_run: DryRunSchema,
  }),
  z.object({
    kind: z.literal('parse_failed'),
    reason: z.string(),
    message: z.string(),
  }),
]);

const ProviderRevisionSchema = z.object({
  reason: z.string().optional().default('Revised YOps from user feedback.'),
  yops: z.array(z.record(z.string(), z.any())).min(1),
});

const route = createRoute({
  method: 'post',
  path: '/v1/conversations/{conversationId}/yops/revise',
  tags: ['YOps'],
  operationId: 'reviseYOps',
  summary: 'Revise YOps with AI feedback',
  description:
    'Requests a revised full-script YOps candidate from the configured LLM and dry-runs it. ' +
    'The revised candidate is returned for review and is not persisted to yops_log.',
  request: {
    params: z.object({ conversationId: z.string().min(1) }),
    body: {
      content: {
        'application/json': {
          schema: ReviseYOpsRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Revision domain outcome',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ReviseYOpsResponseSchema),
        },
      },
    },
    400: {
      description: 'Invalid request or provider configuration',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Conversation not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Unexpected revision failure',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    502: {
      description: 'Provider unavailable',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

function jsonBlockFromText(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? text).trim();
}

function parseProviderText(text: string): z.infer<typeof ProviderRevisionSchema> | null {
  try {
    const parsed = JSON.parse(jsonBlockFromText(text));
    const validated = ProviderRevisionSchema.safeParse(parsed);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}

function buildPrompt(input: {
  feedback: string;
  yops: unknown[];
  trees: unknown[];
  relations: unknown[];
  turns: readonly z.infer<typeof RevisionTurnSchema>[];
}): LLMPrompt {
  const sourceContext = input.turns
    .slice(0, 20)
    .map((turn, index) => {
      const role = turn.role ?? 'user';
      return `T${index + 1} ${role} ${turn.turn_hash}\n${turn.content}`;
    })
    .join('\n\n');

  return {
    system:
      'You revise T3X YOps. Return only JSON matching this shape: ' +
      '{"reason":"short reason","yops":[{"set":{"path":"root/slot","value":"value"}}]}. ' +
      'Do not include markdown. Do not include review metadata inside individual YOps.',
    messages: [
      {
        role: 'user',
        content: JSON.stringify(
          {
            feedback: input.feedback,
            current_yops: input.yops,
            current_trees: input.trees,
            current_relations: input.relations,
            source_context: sourceContext,
          },
          null,
          2
        ),
      },
    ],
  };
}

function bestTurnRef(
  turns: readonly z.infer<typeof RevisionTurnSchema>[],
  fallbackFeedback: string
): { turn_hash: string; quote: string; start_char?: number; end_char?: number } {
  const turn = turns[0];
  if (!turn) {
    return {
      turn_hash: 'revision_feedback',
      quote: fallbackFeedback,
    };
  }
  return {
    turn_hash: turn.turn_hash,
    quote: turn.content,
    start_char: 0,
    end_char: turn.content.length,
  };
}

function hasValidSource(op: Record<string, unknown>): op is SourcedYOp {
  const source = op.source as Record<string, unknown> | undefined;
  if (!source) return false;
  if (source.type === 'human') {
    return typeof source.author === 'string' && source.author.length > 0;
  }
  if (source.type !== 'llm') return false;
  const turnRef = source.turn_ref as Record<string, unknown> | undefined;
  return (
    typeof source.model === 'string' &&
    source.model.length > 0 &&
    typeof source.at === 'string' &&
    source.at.length > 0 &&
    typeof turnRef?.turn_hash === 'string' &&
    turnRef.turn_hash.length > 0 &&
    typeof turnRef.quote === 'string'
  );
}

function ensureSourcedOps(input: {
  ops: readonly Record<string, unknown>[];
  model: string;
  turns: readonly z.infer<typeof RevisionTurnSchema>[];
  feedback: string;
}): SourcedYOp[] {
  const at = new Date().toISOString();
  const turn_ref = bestTurnRef(input.turns, input.feedback);
  return input.ops.map((op) => {
    if (hasValidSource(op)) return op;
    return {
      ...op,
      source: {
        type: 'llm',
        model: input.model,
        at,
        turn_ref,
      },
    } as SourcedYOp;
  });
}

async function generateRevision(input: {
  provider: any;
  model: string;
  prompt: LLMPrompt;
}): Promise<z.infer<typeof ProviderRevisionSchema> | null> {
  if (typeof input.provider.generateStructured === 'function') {
    const result = await input.provider.generateStructured(input.prompt, ProviderRevisionSchema, {
      model: input.model,
      temperature: 0.1,
      maxTokens: 4096,
    });
    const validated = ProviderRevisionSchema.safeParse(result.data);
    return validated.success ? validated.data : null;
  }

  const text =
    typeof input.provider.generateFromPrompt === 'function'
      ? (
          await input.provider.generateFromPrompt(input.prompt, {
            model: input.model,
            temperature: 0.1,
            maxTokens: 4096,
          })
        ).text
      : (
          await input.provider.generate(input.prompt.messages[0]?.content ?? '', {
            temperature: 0.1,
            maxTokens: 4096,
          })
        ).text;

  return typeof text === 'string' ? parseProviderText(text) : null;
}

yopsReviseRoutes.openapi(route, async (c) => {
  const { conversationId } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();
    const conversation = await findConversationById(db, conversationId);
    if (!conversation) {
      return errorResponse(
        c,
        'CONVERSATION_NOT_FOUND',
        `Conversation not found: ${conversationId}`
      );
    }

    const resolution = await resolveProviderAndModel({
      db,
      requestedProvider: body.provider,
      requestedModel: body.model,
      conversationId,
      userId: getUserId(c),
      unavailableMessage: 'No configured revision provider is available',
    });
    if (!resolution.ok) {
      const errorCode =
        resolution.code === 'unavailable' ? 'PROVIDER_KEY_MISSING' : 'INVALID_REQUEST';
      return errorResponse(c, errorCode, resolution.message);
    }

    const prompt = buildPrompt({
      feedback: body.feedback,
      yops: body.yops,
      trees: body.trees,
      relations: body.relations,
      turns: body.turns,
    });

    const providerRevision = await generateRevision({
      provider: resolution.provider,
      model: resolution.model,
      prompt,
    });

    if (!providerRevision) {
      return c.json(
        {
          success: true as const,
          data: {
            kind: 'parse_failed' as const,
            reason: 'The provider did not return a valid YOps revision payload.',
            message: 'Expected JSON with reason and yops fields.',
          },
        },
        200
      );
    }

    const canonicalOps = canonicalizeYOps(providerRevision.yops);
    const sourcedOps = ensureSourcedOps({
      ops: canonicalOps,
      model: resolution.model,
      turns: body.turns,
      feedback: body.feedback,
    });
    const result = applySourcedYOps(
      { trees: body.trees as any, relations: body.relations as any },
      sourcedOps
    );

    if (result.ok) {
      return c.json(
        {
          success: true as const,
          data: {
            kind: 'ok' as const,
            ops: sourcedOps,
            reason: providerRevision.reason,
            dry_run: {
              ok: true,
              applied: result.applied,
              preview: { trees: result.trees, relations: result.relations },
            },
          },
        },
        200
      );
    }

    return c.json(
      {
        success: true as const,
        data: {
          kind: 'validation_failed' as const,
          ops: sourcedOps,
          reason: providerRevision.reason,
          dry_run: {
            ok: false,
            applied: result.applied,
            error: {
              op_index: result.error?.op_index ?? result.applied,
              code: result.error?.code ?? 'UNKNOWN',
              message: result.error?.message ?? 'Unknown error',
            },
          },
        },
      },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown revision error';
    return errorResponse(c, 'INTERNAL_ERROR', message);
  }
});

export default yopsReviseRoutes;
