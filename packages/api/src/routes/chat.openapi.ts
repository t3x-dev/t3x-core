/**
 * Generation Routes (OpenAPI)
 *
 * The /v1/chat* wire paths remain compatibility contracts while route
 * ownership and OpenAPI vocabulary describe the neutral Generation capability.
 *
 * POST /v1/chat           — Non-streaming generation (OpenAPI route)
 * GET  /v1/chat/providers — List available providers (OpenAPI route)
 */

import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import type { GenerationRuntimeProviderId, LLMPrompt, LLMProvider, LLMResult } from '@t3x-dev/core';
import {
  GENERATION_RUNTIME_PROVIDER_IDS,
  isGenerationRuntimeProviderId,
  LLMProviderError,
} from '@t3x-dev/core';
import { type Project, recordUsage } from '@t3x-dev/storage';
import type { Context } from 'hono';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import {
  createInferenceRuntime,
  getInferenceRuntime,
  INFERENCE_CONTRACT_VERSION,
  InferenceAdmissionDeniedError,
  type InferenceAttempt,
  type InferenceFinishStatus,
  type InferenceReceipt,
  resolveInferenceActor,
  resolveInferenceIngressChannel,
  resolveInferenceProjectScope,
  resolveInferenceRunId,
} from '../lib/inference';
import { assertProjectAccess, getUserId } from '../lib/project-access';
import { loadResolvedProviderConfig } from '../lib/provider-config';
import { getProviderRegistry, refreshProviderRegistryConfig } from '../lib/provider-registry';
import { resolveProviderAndModel } from '../lib/provider-resolver';
import { pinoLogger } from '../middleware/logger';
import {
  GenerationProvidersResponseDataSchema,
  GenerationRequestBodySchema,
  GenerationResponseDataSchema,
} from '../schemas/chat';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

// Create proxy-aware fetch. Always uses ProxyAgent when proxy is configured.
function getProxyFetch() {
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  if (proxyUrl) {
    const agent = new ProxyAgent(proxyUrl);
    return async (url: string, options?: RequestInit) => {
      try {
        return await undiciFetch(url, {
          ...options,
          dispatcher: agent,
        } as Parameters<typeof undiciFetch>[1]);
      } catch {
        return fetch(url, options);
      }
    };
  }
  return fetch;
}

// ============================================================================
// Input Validation & Error Sanitization
// ============================================================================

const ALLOWED_ROLES = new Set(['system', 'user', 'assistant']);
const MAX_MESSAGE_CONTENT_LENGTH = 128_000;

const VALID_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

function validateMessages(messages: unknown[]): string | null {
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i] as Record<string, unknown>;
    if (!msg || typeof msg !== 'object') return `messages[${i}]: must be an object`;
    if (typeof msg.role !== 'string' || !ALLOWED_ROLES.has(msg.role))
      return `messages[${i}]: invalid role "${String(msg.role)}"`;

    // String content (existing format)
    if (typeof msg.content === 'string') {
      if (msg.content.length === 0) return `messages[${i}]: content must be non-empty`;
      if (msg.content.length > MAX_MESSAGE_CONTENT_LENGTH)
        return `messages[${i}]: content exceeds max length`;
      continue;
    }

    // Array content (multimodal)
    if (Array.isArray(msg.content)) {
      if (msg.content.length === 0) return `messages[${i}]: content array must be non-empty`;
      let hasText = false;
      for (let j = 0; j < msg.content.length; j++) {
        const block = msg.content[j] as Record<string, unknown>;
        if (!block || typeof block !== 'object')
          return `messages[${i}].content[${j}]: invalid block`;
        if (block.type === 'text') {
          if (typeof block.text !== 'string' || !block.text)
            return `messages[${i}].content[${j}]: text block must have text`;
          if (block.text.length > MAX_MESSAGE_CONTENT_LENGTH)
            return `messages[${i}].content[${j}]: text exceeds max length`;
          hasText = true;
        } else if (block.type === 'image') {
          const source = block.source as Record<string, unknown> | undefined;
          if (!source || source.type !== 'base64')
            return `messages[${i}].content[${j}]: image must use base64 source`;
          if (!VALID_IMAGE_TYPES.has(source.media_type as string))
            return `messages[${i}].content[${j}]: invalid image type`;
          if (typeof source.data !== 'string' || !source.data)
            return `messages[${i}].content[${j}]: image data required`;
        } else {
          return `messages[${i}].content[${j}]: unknown block type "${String(block.type)}"`;
        }
      }
      if (!hasText) return `messages[${i}]: at least one text block required`;
      continue;
    }

    return `messages[${i}]: content must be string or array`;
  }
  return null;
}

function sanitizeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/rate.limit/i.test(message) || /429/.test(message))
    return 'Rate limited. Please try again later.';
  if (
    /invalid.*api.*key/i.test(message) ||
    /unauthorized|forbidden/i.test(message) ||
    /\b(?:401|403)\b/.test(message)
  )
    return 'Provider authentication failed.';
  if (/overloaded/i.test(message) || /503/.test(message)) return 'Provider temporarily overloaded.';
  if (/timeout/i.test(message) || /abort/i.test(message)) return 'Request timed out.';
  if (message.length > 200 || message.includes('{'))
    return 'Chat request failed. Please try again.';
  return message;
}

type ChatErrorClassification = {
  status: 401 | 429 | 500 | 502;
  code: 'AUTH_ERROR' | 'RATE_LIMITED' | 'PROVIDER_UNAVAILABLE' | 'CHAT_ERROR';
};

function classifyChatError(err: unknown): ChatErrorClassification {
  const statusCode = err instanceof LLMProviderError ? err.statusCode : undefined;
  const message = err instanceof Error ? err.message : String(err);

  if (statusCode === 429 || /rate.limit/i.test(message) || /\b429\b/.test(message)) {
    return { status: 429, code: 'RATE_LIMITED' };
  }

  if (
    statusCode === 401 ||
    statusCode === 403 ||
    /\b(?:401|403)\b/.test(message) ||
    /invalid.*api.*key|unauthorized|forbidden/i.test(message)
  ) {
    return { status: 401, code: 'AUTH_ERROR' };
  }

  if (
    err instanceof LLMProviderError ||
    /\b5\d\d\b/.test(message) ||
    /provider|api error|overloaded|timeout|abort|network|fetch failed/i.test(message)
  ) {
    return { status: 502, code: 'PROVIDER_UNAVAILABLE' };
  }

  return { status: 500, code: 'CHAT_ERROR' };
}

// ============================================================================
// Types
// ============================================================================

interface ContentBlock {
  type: 'text' | 'image';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentBlock[];
}

interface ChatResponse {
  content: string;
  model: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  finish_reason?: string;
}

type ChatRuntimeProviderId = GenerationRuntimeProviderId;

const CHAT_PROVIDER_RUNTIME_TO_PUBLIC: Record<ChatRuntimeProviderId, string> = {
  anthropic: 'claude',
  openai: 'openai',
  'google-ai': 'google',
};

const DEFAULT_MAX_TOKENS = 4096;
const MAX_CHAT_TOKENS = 16384;

// Per-provider capability table — kept in sync with
// apps/web/src/domain/providerCapabilities.ts. Single source of truth for
// "can this provider honour this toggle?". Adding a new provider/capability:
// flip the bit here AND in the web table, then wire the request body in
// the appropriate branch below.
const PROVIDER_CAPABILITY: Record<
  ChatRuntimeProviderId,
  { thinking: boolean; webSearch: boolean }
> = {
  anthropic: { thinking: true, webSearch: true },
  openai: { thinking: true, webSearch: true },
  'google-ai': { thinking: true, webSearch: true },
};

// ============================================================================
// Helpers
// ============================================================================

function isSupportedChatProviderId(value: string): value is ChatRuntimeProviderId {
  return isGenerationRuntimeProviderId(value);
}

async function resolveProviderApiKey(
  registry: Awaited<ReturnType<typeof getProviderRegistry>>,
  providerId: ChatRuntimeProviderId
): Promise<string | undefined> {
  const configKey = registry.getEntry(providerId)?.requiredEnvKeys[0];
  if (!configKey) {
    return undefined;
  }

  const overrides = await loadResolvedProviderConfig();
  return overrides[configKey] ?? process.env[configKey];
}

function getUnsupportedChatFeatureError(options: {
  providerId: ChatRuntimeProviderId;
  route: 'chat' | 'stream';
  thinking?: boolean;
  webSearch?: boolean;
}) {
  const capabilities = PROVIDER_CAPABILITY[options.providerId];

  if (options.thinking) {
    if (!capabilities.thinking) {
      return {
        code: 'PROVIDER_ERROR',
        message: `Provider ${options.providerId} does not support thinking`,
      } as const;
    }
    // Non-streaming chat only routes thinking through Anthropic's
    // dedicated handler. OpenAI / Google thinking is wired in the SSE
    // streaming branch only — keep the non-stream surface restrictive
    // so unsupported requests fail fast instead of silently dropping
    // the toggle.
    if (options.route !== 'stream' && options.providerId !== 'anthropic') {
      return {
        code: 'PROVIDER_ERROR',
        message: `Provider ${options.providerId} thinking is only supported on the streaming chat route`,
      } as const;
    }
  }

  if (options.webSearch) {
    if (!capabilities.webSearch) {
      return {
        code: 'PROVIDER_ERROR',
        message: `Provider ${options.providerId} does not support web_search`,
      } as const;
    }

    if (options.route !== 'stream') {
      return {
        code: 'PROVIDER_ERROR',
        message: 'web_search is only supported for streaming chat',
      } as const;
    }
  }

  return null;
}

async function resolveChatRequestTarget(options: {
  db?: Awaited<ReturnType<typeof getDB>>;
  provider?: string;
  model?: string;
  projectId?: string;
  userId?: string;
  supportedProviders?: readonly string[];
}) {
  await refreshProviderRegistryConfig();
  const resolution = await resolveProviderAndModel({
    db: options.db,
    requestedProvider: options.provider,
    requestedModel: options.model,
    projectId: options.projectId,
    userId: options.userId,
    supportedProviders:
      (options.supportedProviders as readonly ChatRuntimeProviderId[] | undefined) ??
      GENERATION_RUNTIME_PROVIDER_IDS,
    unavailableMessage: 'No configured chat provider is available',
  });
  if (!resolution.ok) {
    return {
      error: {
        code: 'PROVIDER_ERROR',
        message: resolution.message,
      },
    } as const;
  }

  return {
    registry: resolution.registry,
    provider: resolution.provider as LLMProvider,
    providerId: resolution.providerId,
    model: resolution.model,
  } as const;
}

async function callProviderNonStreaming(
  provider: LLMProvider,
  model: string,
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number
): Promise<ChatResponse> {
  if (!provider.generateFromPrompt) {
    throw new Error(`Provider ${provider.id} does not support chat prompts`);
  }

  const systemMessage = messages.find((message) => message.role === 'system');
  const prompt: LLMPrompt = {
    ...(systemMessage && {
      system:
        typeof systemMessage.content === 'string'
          ? systemMessage.content
          : JSON.stringify(systemMessage.content),
    }),
    messages: messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.content,
      })) as unknown as LLMPrompt['messages'],
  };

  const result: LLMResult = await provider.generateFromPrompt(prompt, {
    model,
    temperature,
    maxTokens,
  });

  return {
    content: result.text,
    model,
    usage: {
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
    },
  };
}

function toOpenAIContent(
  content: ChatMessage['content']
):
  | string
  | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> {
  if (typeof content === 'string') return content;
  return content.map((block) => {
    if (block.type === 'text') {
      return { type: 'text', text: block.text ?? '' };
    }
    return {
      type: 'image_url',
      image_url: {
        url: `data:${block.source?.media_type ?? 'image/png'};base64,${block.source?.data ?? ''}`,
      },
    };
  });
}

async function callOpenAINonStreaming(
  messages: ChatMessage[],
  model: string,
  apiKey: string,
  temperature: number,
  maxTokens: number
): Promise<ChatResponse> {
  const proxyFetch = getProxyFetch();
  const response = await proxyFetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      max_completion_tokens: maxTokens,
      messages: messages.map((message) => ({
        role: message.role,
        content: toOpenAIContent(message.content),
      })),
    }),
    signal: AbortSignal.timeout(120000),
  });

  const responseText = await response.text();
  if (!response.ok) {
    pinoLogger.error({ status: response.status, responseText }, 'OpenAI API error');
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = JSON.parse(responseText) as {
    model: string;
    choices?: Array<{
      message?: {
        content?: string | Array<{ type?: string; text?: string }>;
      };
      finish_reason?: string | null;
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
    };
  };

  const firstChoice = data.choices?.[0];
  const rawContent = firstChoice?.message?.content;
  const content =
    typeof rawContent === 'string'
      ? rawContent
      : Array.isArray(rawContent)
        ? rawContent
            .filter((part) => part.type === 'text' && typeof part.text === 'string')
            .map((part) => part.text)
            .join('')
        : '';

  if (!content) {
    throw new Error('No text content in OpenAI response');
  }

  return {
    content,
    model: data.model ?? model,
    usage: {
      input_tokens: data.usage?.prompt_tokens,
      output_tokens: data.usage?.completion_tokens,
    },
    finish_reason: firstChoice?.finish_reason ?? 'stop',
  };
}

async function callClaudeNonStreaming(
  messages: ChatMessage[],
  model: string,
  apiKey: string,
  temperature: number,
  maxTokens: number,
  options?: { thinking?: boolean }
): Promise<ChatResponse> {
  // Extract system message if present
  const systemMessage = messages.find((m) => m.role === 'system');
  const otherMessages = messages.filter((m) => m.role !== 'system');

  const proxyFetch = getProxyFetch();
  const response = await proxyFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: options?.thinking ? Math.max(maxTokens, 16384) : maxTokens,
      ...(options?.thinking
        ? { thinking: { type: 'enabled', budget_tokens: 10000 } }
        : { temperature }),
      ...(systemMessage && { system: systemMessage.content }),
      messages: otherMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    }),
    signal: AbortSignal.timeout(120000),
  });

  const responseText = await response.text();

  if (!response.ok) {
    pinoLogger.error({ status: response.status, responseText }, 'Claude API error');
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = JSON.parse(responseText) as {
    content: Array<{ type: string; text: string }>;
    model: string;
    usage?: { input_tokens: number; output_tokens: number };
    stop_reason?: string;
  };

  const textContent = data.content.find((c) => c.type === 'text');
  if (!textContent) {
    throw new Error('No text content in Claude response');
  }

  return {
    content: textContent.text,
    model: data.model,
    usage: data.usage,
    finish_reason: data.stop_reason ?? 'end_turn',
  };
}

type InferenceContextReader = {
  get(key: string): unknown;
};

function readInferenceContext(c: Context): InferenceContextReader {
  return c as unknown as InferenceContextReader;
}

function getAuthenticatedUserId(c: Context): string | undefined {
  const context = readInferenceContext(c);
  const hostedUserId = context.get('userId');
  if (typeof hostedUserId === 'string' && hostedUserId.length > 0) return hostedUserId;
  return getUserId(c);
}

function normalizeFinishStatus(value: string | undefined): InferenceFinishStatus {
  switch (value?.toLowerCase()) {
    case 'stop':
    case 'end_turn':
      return 'stop';
    case 'length':
    case 'max_tokens':
      return 'length';
    case 'tool_call':
    case 'tool_calls':
    case 'tool_use':
      return 'tool_call';
    case 'content_filter':
    case 'safety':
      return 'content_filter';
    default:
      return 'unknown';
  }
}

function createChatReceipt(
  attempt: InferenceAttempt,
  providerId: ChatRuntimeProviderId,
  result: ChatResponse,
  startedAt: string
): InferenceReceipt {
  return {
    contractVersion: INFERENCE_CONTRACT_VERSION,
    generationId: attempt.generationId,
    runId: attempt.runId,
    requestedModel: attempt.requestedModel,
    resolvedModel: result.model,
    resolvedProvider: providerId,
    usage: {
      inputTokens: result.usage?.input_tokens ?? 0,
      outputTokens: result.usage?.output_tokens ?? 0,
    },
    finishStatus: normalizeFinishStatus(result.finish_reason),
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

// -----------------------------------------------------------------------
// OpenAPI route definitions
// -----------------------------------------------------------------------

const generationRoute = createRoute({
  method: 'post',
  path: '/v1/chat',
  tags: ['Generation'],
  summary: 'Generate a complete response',
  description: 'Invoke a configured model provider and receive a complete response.',
  request: {
    body: {
      content: { 'application/json': { schema: GenerationRequestBodySchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Generation response',
      content: {
        'application/json': { schema: SuccessResponseSchema(GenerationResponseDataSchema) },
      },
    },
    400: {
      description: 'Invalid request or provider error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    401: {
      description: 'Provider authentication failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    429: {
      description: 'Provider rate limit exceeded',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    502: {
      description: 'Provider unavailable',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Generation error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const providersRoute = createRoute({
  method: 'get',
  path: '/v1/chat/providers',
  tags: ['Generation'],
  summary: 'List available providers',
  description: 'Returns the list of configured AI providers.',
  responses: {
    200: {
      description: 'Provider list',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(GenerationProvidersResponseDataSchema),
        },
      },
    },
  },
});

// -----------------------------------------------------------------------
// POST /v1/chat — Non-streaming chat (OpenAPI handler)
// -----------------------------------------------------------------------

const defaultInferenceRuntime = createInferenceRuntime();
export const generationRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });
/** @deprecated Compatibility export for callers that still use the old capability name. */
export const chatRoutes = generationRoutes;

generationRoutes.openapi(generationRoute, async (c) => {
  const body = c.req.valid('json') as {
    messages?: unknown[];
    provider?: string;
    model?: string;
    temperature?: number;
    max_tokens?: number;
    project_id?: string;
    web_search?: boolean;
    thinking?: boolean;
  };

  const messages = body.messages as ChatMessage[] | undefined;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 100) {
    return errorResponse(c, 'INVALID_REQUEST', 'messages must be an array of 1-100 items');
  }

  const msgError = validateMessages(messages);
  if (msgError) {
    return errorResponse(c, 'INVALID_REQUEST', msgError);
  }

  const db = await getDB();
  let inferenceProject: Project | null = null;
  if (body.project_id) {
    const accessResult = await assertProjectAccess(c, db, body.project_id);
    if (accessResult instanceof Response) return accessResult;
    inferenceProject = accessResult;
  }
  const target = await resolveChatRequestTarget({
    db,
    provider: body.provider,
    model: body.model,
    projectId: body.project_id,
    userId: getAuthenticatedUserId(c),
  });
  if ('error' in target) {
    return c.json({ success: false as const, error: target.error }, 400);
  }

  const { provider, providerId, model, registry } = target;
  const unsupportedFeatureError = getUnsupportedChatFeatureError({
    providerId,
    route: 'chat',
    thinking: body.thinking,
    webSearch: body.web_search,
  });
  if (unsupportedFeatureError) {
    return c.json({ success: false as const, error: unsupportedFeatureError }, 400);
  }

  const temperature = body.temperature ?? 0.7;
  const maxTokens = Math.min(
    Math.max(parseInt(String(body.max_tokens), 10) || DEFAULT_MAX_TOKENS, 1),
    MAX_CHAT_TOKENS
  );

  try {
    const execution = await (getInferenceRuntime(c) ?? defaultInferenceRuntime).execute(
      {
        runId: resolveInferenceRunId(c),
        feature: 'generation.chat.complete',
        requestedModel: body.model?.trim() || model,
        scope: {
          actor: resolveInferenceActor(c),
          ingressChannel: resolveInferenceIngressChannel(c),
          ...(inferenceProject ? resolveInferenceProjectScope(inferenceProject) : {}),
        },
      },
      async (attempt) => {
        const startedAt = new Date().toISOString();
        let result: ChatResponse;

        if (providerId === 'anthropic' && (body.thinking || body.web_search)) {
          const apiKey = await resolveProviderApiKey(registry, providerId);
          if (!apiKey) {
            return {
              ok: false,
              error: new Error('Anthropic API key not configured'),
              terminal: { kind: 'released', reason: 'pre_upstream_failure' },
            };
          }

          result = await callClaudeNonStreaming(messages, model, apiKey, temperature, maxTokens, {
            thinking: body.thinking,
          });
        } else if (providerId === 'openai') {
          const apiKey = await resolveProviderApiKey(registry, providerId);
          if (!apiKey) {
            return {
              ok: false,
              error: new Error('OpenAI API key not configured'),
              terminal: { kind: 'released', reason: 'pre_upstream_failure' },
            };
          }

          result = await callOpenAINonStreaming(messages, model, apiKey, temperature, maxTokens);
        } else {
          result = await callProviderNonStreaming(
            provider,
            model,
            messages,
            temperature,
            maxTokens
          );
        }

        return {
          ok: true,
          value: result,
          terminal: {
            kind: 'receipt',
            receipt: createChatReceipt(attempt, providerId, result, startedAt),
          },
        };
      }
    );
    const result = execution.value;

    if (body?.project_id && result.usage) {
      // biome-ignore lint/suspicious/noExplicitAny: generic error handler
      const apiKeyCtx = (c as any).get('apiKey') as { user_id?: string } | undefined;
      getDB()
        .then((db) =>
          recordUsage(db, {
            user_id: apiKeyCtx?.user_id,
            project_id: body!.project_id!,
            endpoint: 'chat',
            model: result.model,
            input_tokens: result.usage!.input_tokens ?? 0,
            output_tokens: result.usage!.output_tokens ?? 0,
          })
        )
        .catch((err) => pinoLogger.warn({ err }, 'Failed to record chat usage'));
    }

    return c.json({ success: true as const, data: result }, 200);
  } catch (err) {
    if (err instanceof InferenceAdmissionDeniedError) {
      return c.json(
        {
          success: false as const,
          error: { code: 'RATE_LIMITED' as const, message: err.message },
        },
        429
      );
    }
    pinoLogger.error({ err }, 'Chat error');
    const classified = classifyChatError(err);
    return c.json(
      {
        success: false as const,
        error: { code: classified.code, message: sanitizeError(err) },
      },
      classified.status
    );
  }
});

// -----------------------------------------------------------------------
// GET /v1/chat/providers — List available providers (OpenAPI handler)
// -----------------------------------------------------------------------

generationRoutes.openapi(providersRoute, (c) => {
  return refreshProviderRegistryConfig()
    .then(() => getProviderRegistry())
    .then((registry) => {
      const configuredProviders = registry
        .getProviderIdsForRole('generation')
        .filter(
          (providerId): providerId is ChatRuntimeProviderId =>
            isSupportedChatProviderId(providerId) && registry.isConfigured(providerId)
        );

      const defaultProviderId = registry
        .getProviderIdsForRole('generation')
        .find(
          (providerId) => isSupportedChatProviderId(providerId) && registry.isConfigured(providerId)
        );

      return c.json(
        {
          success: true as const,
          data: {
            providers: configuredProviders.map(
              (providerId) => CHAT_PROVIDER_RUNTIME_TO_PUBLIC[providerId]
            ),
            default: defaultProviderId
              ? CHAT_PROVIDER_RUNTIME_TO_PUBLIC[defaultProviderId as ChatRuntimeProviderId]
              : 'claude',
          },
        },
        200
      );
    });
});
