/**
 * POST /v1/extract-yops
 *
 * New-architecture extraction endpoint. Takes turns + optional failing_ops
 * (for surgical retry), calls the LLM via provider registry, parses the
 * output as YOp[], returns { ops }.
 *
 * Does NOT persist to yops_log. Does NOT do drift detection. Those are
 * client concerns in the new architecture — this endpoint is a pure LLM
 * wrapper.
 *
 * The client-side retry loop (in extractionWorker.ts) drives all deterministic
 * source validation. If parsed ops lack `source`, the validator rejects them
 * and the worker calls this endpoint again with `failing_ops` populated.
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  buildYOpsPrompt,
  DEFAULT_STYLE,
  type ExtractionTurn,
  getCanonicalModelId,
  getModelInfo,
  parseYOpsOutput,
} from '@t3x-dev/core';
import { findConversationById, listYOpsLogByConversation } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { getProviderRegistry } from '../lib/provider-registry';
import { replayYOpsLog, toYOpsLogEntries } from '../lib/yops-log-utils';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const extractYopsRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ── Request schema ──

const TurnInput = z.object({
  turn_hash: z.string().min(1),
  content: z.string(),
});

const FailingOpInput = z.object({
  op: z.unknown(),
  opIndex: z.number().int(),
  reason: z.string(),
  detail: z.string().optional(),
});

type ExtractRuntimeProviderId = 'anthropic' | 'openai' | 'google-ai';

const EXTRACT_PROVIDER_ALIAS_TO_RUNTIME: Record<string, ExtractRuntimeProviderId> = {
  anthropic: 'anthropic',
  claude: 'anthropic',
  openai: 'openai',
  gpt: 'openai',
  gemini: 'google-ai',
  google: 'google-ai',
  'google-ai': 'google-ai',
};

const EXTRACT_PROVIDER_RUNTIME_TO_PUBLIC: Record<ExtractRuntimeProviderId, 'anthropic' | 'openai' | 'google'> = {
  anthropic: 'anthropic',
  openai: 'openai',
  'google-ai': 'google',
};

const EXTRACT_PROVIDER_RUNTIME_IDS = ['anthropic', 'openai', 'google-ai'] as const;

function normalizeExtractProvider(provider: string | undefined): ExtractRuntimeProviderId | null {
  if (!provider) return null;
  return EXTRACT_PROVIDER_ALIAS_TO_RUNTIME[provider.toLowerCase()] ?? null;
}

function findProviderForModel(
  registry: Awaited<ReturnType<typeof getProviderRegistry>>,
  model: string,
  candidateProviders: readonly string[]
): ExtractRuntimeProviderId | null {
  const providerPrefix = model.split(':', 1)[0];
  if (providerPrefix && providerPrefix !== model) {
    const normalizedPrefixedProvider = normalizeExtractProvider(providerPrefix);
    if (normalizedPrefixedProvider && candidateProviders.includes(normalizedPrefixedProvider)) {
      return normalizedPrefixedProvider;
    }
  }

  for (const provider of registry.listProviders()) {
    if (!candidateProviders.includes(provider.id)) continue;
    if (provider.defaultModel === model || provider.availableModels?.includes(model)) {
      return provider.id as ExtractRuntimeProviderId;
    }
  }

  const catalogProvider = getModelInfo(model)?.provider;
  if (!catalogProvider) {
    return null;
  }

  const runtimeProvider = Object.entries(EXTRACT_PROVIDER_RUNTIME_TO_PUBLIC).find(
    ([, publicProvider]) => publicProvider === catalogProvider
  )?.[0];

  if (!runtimeProvider || !candidateProviders.includes(runtimeProvider)) {
    return null;
  }

  return runtimeProvider as ExtractRuntimeProviderId;
}

function stripProviderPrefixFromModel(model: string, providerId: ExtractRuntimeProviderId): string {
  const separatorIndex = model.indexOf(':');
  if (separatorIndex === -1) {
    return model;
  }

  const providerPrefix = model.slice(0, separatorIndex);
  const normalizedPrefixedProvider = normalizeExtractProvider(providerPrefix);
  if (normalizedPrefixedProvider !== providerId) {
    return model;
  }

  const providerModel = model.slice(separatorIndex + 1);
  return providerModel || model;
}

const ExtractYopsRequest = z.object({
  conversation_id: z.string().min(1),
  turns: z.array(TurnInput),
  failing_ops: z.array(FailingOpInput).optional(),
  provider: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
});

// Response schema — ops is opaque YOp[]; OpenAPI uses z.any() for the payload.
const ExtractYopsResponse = z.object({
  ops: z.array(z.any()),
});

// ── Route ──

const route = createRoute({
  method: 'post',
  path: '/v1/extract-yops',
  tags: ['Extraction'],
  summary: 'Produce YOps from turns via LLM (client-driven retry loop)',
  description:
    'Calls the LLM with the provided turns (and optional failing_ops for surgical retry) and returns parsed YOp[]. Does not persist to the yops_log — the caller is responsible for saving and validating.',
  request: {
    body: {
      content: { 'application/json': { schema: ExtractYopsRequest } },
    },
  },
  responses: {
    200: {
      description: 'YOps successfully produced',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ExtractYopsResponse),
        },
      },
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

// ── Handler ──

extractYopsRoutes.openapi(route, async (c) => {
  const { conversation_id, turns, failing_ops, provider: requestedProvider, model: requestedModel } =
    c.req.valid('json');

  try {
    const db = await getDB();

    // Verify conversation exists
    const conversation = await findConversationById(db, conversation_id);
    if (!conversation) {
      return errorResponse(
        c,
        'CONVERSATION_NOT_FOUND',
        `Conversation not found: ${conversation_id}`
      );
    }

    // Short-circuit: empty turns → no LLM call needed
    if (turns.length === 0) {
      return c.json({ success: true as const, data: { ops: [] } }, 200);
    }

    // Load existing yops log and replay to get the current snapshot.
    // If it's empty, fall back to a minimal non-empty snapshot so the prompt
    // builder uses incremental mode (which includes SOURCE_CONTRACT).
    const yopsRecords = await listYOpsLogByConversation(db, conversation_id);
    const replayedSnapshot = replayYOpsLog(toYOpsLogEntries(yopsRecords));
    const snapshot =
      replayedSnapshot.trees.length > 0
        ? replayedSnapshot
        : {
            trees: [{ key: '_root', slots: {}, children: [] }],
            relations: [],
          };

    // Build prompt — use replayed snapshot to ensure incremental mode with SOURCE_CONTRACT
    const extractionTurns: ExtractionTurn[] = turns.map((t) => ({
      turn_hash: t.turn_hash,
      role: 'user' as const,
      content: t.content,
    }));

    const { systemPrompt, userPrompt } = buildYOpsPrompt(
      {
        turns: extractionTurns,
        snapshot,
        processedTurnCount: 0,
      },
      {
        style: DEFAULT_STYLE,
        failingOps: failing_ops ?? [],
      }
    );

    // Combine system + user prompt (same pattern as YamlExtractionStrategy)
    const combinedPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

    // Call the LLM via the explicitly selected provider/model when available.
    // Otherwise, fall back to the current generation-role default chain.
    const reg = await getProviderRegistry();
    let rawText: string;
    try {
      const explicitProvider = normalizeExtractProvider(requestedProvider);
      if (requestedProvider && !explicitProvider) {
        return errorResponse(c, 'EXTRACTION_FAILED', `Unknown provider: ${requestedProvider}`);
      }

      const modelProvider = requestedModel
        ? findProviderForModel(reg, requestedModel, EXTRACT_PROVIDER_RUNTIME_IDS)
        : null;
      if (requestedModel && !modelProvider) {
        return errorResponse(c, 'EXTRACTION_FAILED', `Unknown or unsupported model: ${requestedModel}`);
      }

      if (explicitProvider && modelProvider && explicitProvider !== modelProvider) {
        return errorResponse(
          c,
          'EXTRACTION_FAILED',
          `Model ${requestedModel} does not match provider: ${requestedProvider}`
        );
      }

      const defaultProvider = reg
        .getProviderIdsForRole('generation')
        .find(
          (id) =>
            (EXTRACT_PROVIDER_RUNTIME_IDS as readonly string[]).includes(id) && reg.isConfigured(id)
        ) as ExtractRuntimeProviderId | undefined;

      const providerId = explicitProvider ?? modelProvider ?? defaultProvider ?? null;
      if (!providerId) {
        return errorResponse(c, 'EXTRACTION_FAILED', 'No configured extraction provider is available');
      }

      const provider = reg.getById<any>(providerId);
      if (!provider) {
        return errorResponse(c, 'EXTRACTION_FAILED', `Provider ${providerId} is unavailable`);
      }

      const model = requestedModel
        ? (getCanonicalModelId(stripProviderPrefixFromModel(requestedModel, providerId)) ?? null)
        : (reg.getEntry(providerId)?.defaultModel ?? null);
      if (!model) {
        return errorResponse(c, 'EXTRACTION_FAILED', `No default model configured for provider: ${providerId}`);
      }

      const genResult =
        typeof provider.generateFromPrompt === 'function'
          ? await provider.generateFromPrompt(
              {
                messages: [{ role: 'user', content: combinedPrompt }],
              },
              {
                model,
                temperature: 0.1,
                maxTokens: 8192,
              }
            )
          : await provider.generate(combinedPrompt, {
              temperature: 0.1,
              maxTokens: 8192,
            });
      rawText = genResult.text;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'LLM provider error';
      return errorResponse(c, 'EXTRACTION_FAILED', message);
    }

    // Parse LLM output
    const parseResult = parseYOpsOutput(rawText, { strictYopsList: true });
    if (!parseResult.ok) {
      return errorResponse(c, 'EXTRACTION_FAILED', `LLM output parse error: ${parseResult.error}`);
    }

    return c.json({ success: true as const, data: { ops: parseResult.yops ?? [] } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'EXTRACTION_FAILED', message);
  }
});

export default extractYopsRoutes;
