/**
 * Chat Routes (OpenAPI)
 *
 * POST /v1/chat         — Non-streaming chat (OpenAPI route)
 * POST /v1/chat/stream  — Streaming SSE (plain Hono handler — OpenAPI can't describe SSE)
 * GET  /v1/chat/providers — List available providers (OpenAPI route)
 */

import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import type { LLMPrompt, LLMProvider, LLMResult } from '@t3x-dev/core';
import { recordUsage } from '@t3x-dev/storage';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { getUserId } from '../lib/project-access';
import { loadResolvedProviderConfig } from '../lib/provider-config';
import { getProviderRegistry, refreshProviderRegistryConfig } from '../lib/provider-registry';
import { resolveProviderAndModel } from '../lib/provider-resolver';
import { pinoLogger } from '../middleware/logger';
import {
  ChatRequestBodySchema,
  ChatResponseDataSchema,
  ProvidersResponseDataSchema,
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
  if (/invalid.*api.*key/i.test(message) || /unauthorized/i.test(message))
    return 'Provider authentication failed.';
  if (/overloaded/i.test(message) || /503/.test(message)) return 'Provider temporarily overloaded.';
  if (/timeout/i.test(message) || /abort/i.test(message)) return 'Request timed out.';
  if (message.length > 200 || message.includes('{'))
    return 'Chat request failed. Please try again.';
  return message;
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

type ChatRuntimeProviderId = 'anthropic' | 'openai' | 'google-ai';

const CHAT_PROVIDER_RUNTIME_TO_PUBLIC: Record<ChatRuntimeProviderId, string> = {
  anthropic: 'claude',
  openai: 'openai',
  'google-ai': 'google',
};

const CHAT_PROVIDER_RUNTIME_IDS = ['anthropic', 'openai', 'google-ai'] as const;
const STREAM_PROVIDER_RUNTIME_IDS = ['anthropic', 'openai', 'google-ai'] as const;
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
  openai: { thinking: true, webSearch: false },
  'google-ai': { thinking: true, webSearch: true },
};

// ============================================================================
// Helpers
// ============================================================================

function isSupportedChatProviderId(value: string): value is ChatRuntimeProviderId {
  return (CHAT_PROVIDER_RUNTIME_IDS as readonly string[]).includes(value);
}

function isSupportedStreamProviderId(value: string): value is ChatRuntimeProviderId {
  return (STREAM_PROVIDER_RUNTIME_IDS as readonly string[]).includes(value);
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
      CHAT_PROVIDER_RUNTIME_IDS,
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
      })),
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

function encodeSseEvent(payload: string): Uint8Array {
  return new TextEncoder().encode(`data: ${payload}\n\n`);
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

// ============================================================================
// Routes
// ============================================================================

export const chatRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });

// -----------------------------------------------------------------------
// OpenAPI route definitions
// -----------------------------------------------------------------------

const chatRoute = createRoute({
  method: 'post',
  path: '/v1/chat',
  tags: ['Chat'],
  summary: 'Non-streaming chat',
  description: 'Send messages to an AI provider and receive a complete response.',
  request: {
    body: {
      content: { 'application/json': { schema: ChatRequestBodySchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Chat response',
      content: { 'application/json': { schema: SuccessResponseSchema(ChatResponseDataSchema) } },
    },
    400: {
      description: 'Invalid request or provider error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Chat error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const providersRoute = createRoute({
  method: 'get',
  path: '/v1/chat/providers',
  tags: ['Chat'],
  summary: 'List available providers',
  description: 'Returns the list of configured AI providers.',
  responses: {
    200: {
      description: 'Provider list',
      content: {
        'application/json': { schema: SuccessResponseSchema(ProvidersResponseDataSchema) },
      },
    },
  },
});

// -----------------------------------------------------------------------
// POST /v1/chat — Non-streaming chat (OpenAPI handler)
// -----------------------------------------------------------------------

chatRoutes.openapi(chatRoute, async (c) => {
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
  const target = await resolveChatRequestTarget({
    db,
    provider: body.provider,
    model: body.model,
    projectId: body.project_id,
    userId: getUserId(c),
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
    const result = await (async () => {
      if (providerId === 'anthropic' && (body.thinking || body.web_search)) {
        const apiKey = await resolveProviderApiKey(registry, providerId);
        if (!apiKey) {
          throw new Error('Anthropic API key not configured');
        }

        return callClaudeNonStreaming(messages, model, apiKey, temperature, maxTokens, {
          thinking: body.thinking,
        });
      }

      if (providerId === 'openai') {
        const apiKey = await resolveProviderApiKey(registry, providerId);
        if (!apiKey) {
          throw new Error('OpenAI API key not configured');
        }

        return callOpenAINonStreaming(messages, model, apiKey, temperature, maxTokens);
      }

      return callProviderNonStreaming(provider, model, messages, temperature, maxTokens);
    })();

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
    pinoLogger.error({ err }, 'Chat error');
    return c.json(
      { success: false as const, error: { code: 'CHAT_ERROR', message: sanitizeError(err) } },
      500
    );
  }
});

// -----------------------------------------------------------------------
// POST /v1/chat/stream — Streaming SSE (plain Hono handler)
// OpenAPI cannot describe SSE, so this stays as a plain .post() handler.
// -----------------------------------------------------------------------

chatRoutes.post('/v1/chat/stream', async (c) => {
  let body: {
    messages?: ChatMessage[];
    provider?: string;
    model?: string;
    temperature?: number;
    max_tokens?: number;
    project_id?: string;
    web_search?: boolean;
    thinking?: boolean;
  } | null = null;

  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { success: false as const, error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } },
      400
    );
  }
  if (!body)
    return c.json(
      { success: false as const, error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } },
      400
    );

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 100) {
    return errorResponse(c, 'INVALID_REQUEST', 'messages must be an array of 1-100 items');
  }

  const msgError = validateMessages(messages);
  if (msgError) {
    return errorResponse(c, 'INVALID_REQUEST', msgError);
  }

  const db = await getDB();
  const target = await resolveChatRequestTarget({
    db,
    provider: body.provider,
    model: body.model,
    projectId: body.project_id,
    userId: getUserId(c),
    supportedProviders: STREAM_PROVIDER_RUNTIME_IDS,
  });
  if ('error' in target) {
    return c.json({ success: false as const, error: target.error }, 400);
  }

  const { providerId, model, registry } = target;
  const unsupportedFeatureError = getUnsupportedChatFeatureError({
    providerId,
    route: 'stream',
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
  const apiKey = await resolveProviderApiKey(registry, providerId);
  if (!apiKey) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'PROVIDER_ERROR',
          message: `API key not configured for provider: ${providerId}`,
        },
      },
      400
    );
  }

  if (!isSupportedStreamProviderId(providerId)) {
    return c.json(
      {
        success: false as const,
        error: { code: 'PROVIDER_ERROR', message: `Provider ${providerId} not implemented` },
      },
      400
    );
  }

  const useThinking = body.thinking && providerId === 'anthropic';

  // Extract system message if present
  const systemMessage = messages.find((m) => m.role === 'system');
  const otherMessages = messages.filter((m) => m.role !== 'system');

  const stream = new ReadableStream({
    async start(controller) {
      let upstreamResponse: Response | undefined;
      let resolvedModel = model;
      const usage: { input_tokens?: number; output_tokens?: number } = {};
      try {
        const proxyFetch = getProxyFetch();
        if (providerId === 'anthropic') {
          upstreamResponse = (await proxyFetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              ...(body.web_search && { 'anthropic-beta': 'web-search-2025-03-05' }),
            },
            body: JSON.stringify({
              model,
              max_tokens: useThinking ? Math.max(maxTokens, 16384) : maxTokens,
              ...(useThinking
                ? { thinking: { type: 'enabled', budget_tokens: 10000 } }
                : { temperature }),
              stream: true,
              ...(systemMessage && { system: systemMessage.content }),
              ...(body.web_search && {
                tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
              }),
              messages: otherMessages.map((message) => ({
                role: message.role,
                content: message.content,
              })),
            }),
            signal: AbortSignal.timeout(120000),
          })) as unknown as Response;
        } else if (providerId === 'openai') {
          upstreamResponse = (await proxyFetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              // GPT-5 / o-series support reasoning. Setting reasoning_effort
              // surfaces extended thinking; ignored by older models that
              // don't recognise it. medium is a balanced default — small
              // enough to keep latency reasonable.
              ...(body.thinking && { reasoning_effort: 'medium' }),
              // Reasoning models (gpt-5/o-series) reject `temperature`. Skip
              // it whenever thinking is on so the request validates.
              ...(body.thinking ? {} : { temperature }),
              max_completion_tokens: maxTokens,
              stream: true,
              stream_options: { include_usage: true },
              messages: messages.map((message) => ({
                role: message.role,
                content: toOpenAIContent(message.content),
              })),
            }),
            signal: AbortSignal.timeout(120000),
          })) as unknown as Response;
        } else if (providerId === 'google-ai') {
          // Gemini's streaming SSE endpoint: ?alt=sse on the streamGenerateContent path.
          // Uses x-goog-api-key header instead of bearer auth.
          const useThinkingGoogle = body.thinking;
          upstreamResponse = (await proxyFetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
              },
              body: JSON.stringify({
                contents: messages
                  .filter((m) => m.role !== 'system')
                  .map((m) => ({
                    role: m.role === 'assistant' ? 'model' : m.role,
                    parts: [{ text: m.content }],
                  })),
                ...(systemMessage && {
                  systemInstruction: { parts: [{ text: systemMessage.content }] },
                }),
                generationConfig: {
                  temperature,
                  maxOutputTokens: maxTokens,
                  // When thinking is OFF, cap the implicit thinking budget
                  // small so Pro models don't burn output tokens. When ON,
                  // give it real headroom (-1 = let the model decide).
                  ...(useThinkingGoogle
                    ? { thinkingConfig: { thinkingBudget: -1, includeThoughts: true } }
                    : { thinkingConfig: { thinkingBudget: 256 } }),
                },
                ...(body.web_search && {
                  // Search Grounding tool — Gemini's web search equivalent.
                  // Returns groundingMetadata with citations on each candidate.
                  tools: [{ googleSearch: {} }],
                }),
              }),
              signal: AbortSignal.timeout(120000),
            }
          )) as unknown as Response;
        } else {
          throw new Error(`Provider ${providerId} not implemented`);
        }

        if (!upstreamResponse.ok) {
          const errorText = await upstreamResponse.text();
          pinoLogger.error({ status: upstreamResponse.status, errorText }, 'Streaming API error');
          throw new Error(`${providerId} API error: ${upstreamResponse.status}`);
        }

        const reader = upstreamResponse.body?.getReader();
        if (!reader) {
          throw new Error(`No response body from ${providerId} API`);
        }

        const decoder = new TextDecoder();
        let buffer = '';
        resolvedModel = model;
        let receivedMessageStop = false;
        const citations: Array<{ url: string; title: string }> = [];
        let currentBlockType = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value as Uint8Array, { stream: true });

          // Parse SSE events separated by double newlines. Gemini emits
          // CRLF (`\r\n\r\n`) per the SSE spec, while Anthropic / OpenAI
          // emit LF-only (`\n\n`). Splitting on either keeps all three
          // working without provider-specific branches.
          const parts = buffer.split(/\r?\n\r?\n/);
          buffer = parts.pop() || '';

          for (const part of parts) {
            const lines = part.split('\n');
            let eventType = '';
            let dataStr = '';

            for (const line of lines) {
              if (line.startsWith('event:')) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                dataStr = line.slice(5).trim();
              }
            }

            if (!dataStr) continue;
            if (providerId === 'openai' && dataStr === '[DONE]') {
              receivedMessageStop = true;
              controller.enqueue(
                encodeSseEvent(
                  JSON.stringify({
                    type: 'done',
                    model: resolvedModel,
                    usage,
                  })
                )
              );
              controller.enqueue(encodeSseEvent('[DONE]'));
              continue;
            }

            let parsed: Record<string, unknown>;
            try {
              parsed = JSON.parse(dataStr);
            } catch {
              continue;
            }

            if (providerId === 'openai') {
              if (typeof parsed.model === 'string') {
                resolvedModel = parsed.model;
              }
              const usageChunk = parsed.usage as Record<string, number> | undefined;
              if (usageChunk) {
                usage.input_tokens = usageChunk.prompt_tokens ?? usage.input_tokens;
                usage.output_tokens = usageChunk.completion_tokens ?? usage.output_tokens;
              }
              const choices = Array.isArray(parsed.choices)
                ? (parsed.choices as Array<Record<string, unknown>>)
                : [];
              for (const choice of choices) {
                const delta = choice.delta as Record<string, unknown> | undefined;
                // GPT-5 / o-series surface reasoning summaries on a separate
                // delta key; map them to thinking events so the UI shows them
                // the same way as Anthropic's thinking blocks.
                if (typeof delta?.reasoning_content === 'string') {
                  controller.enqueue(
                    encodeSseEvent(
                      JSON.stringify({ type: 'thinking', content: delta.reasoning_content })
                    )
                  );
                }
                if (typeof delta?.content === 'string') {
                  controller.enqueue(
                    encodeSseEvent(JSON.stringify({ type: 'token', content: delta.content }))
                  );
                }
                if (typeof choice.finish_reason === 'string' && choice.finish_reason.length > 0) {
                  receivedMessageStop = true;
                }
              }
              continue;
            }

            if (providerId === 'google-ai') {
              if (typeof parsed.modelVersion === 'string') {
                resolvedModel = parsed.modelVersion;
              }
              const usageChunk = parsed.usageMetadata as Record<string, number> | undefined;
              if (usageChunk) {
                usage.input_tokens = usageChunk.promptTokenCount ?? usage.input_tokens;
                usage.output_tokens = usageChunk.candidatesTokenCount ?? usage.output_tokens;
              }
              const candidates = Array.isArray(parsed.candidates)
                ? (parsed.candidates as Array<Record<string, unknown>>)
                : [];
              for (const candidate of candidates) {
                const content = candidate.content as
                  | { parts?: Array<{ text?: string; thought?: boolean }> }
                  | undefined;
                for (const part of content?.parts ?? []) {
                  if (typeof part.text !== 'string' || part.text.length === 0) continue;
                  // Gemini 2.5+ tags thought summaries with thought:true so
                  // the visible-output and thinking streams map cleanly to
                  // the same SSE event types we use for Anthropic / OpenAI.
                  controller.enqueue(
                    encodeSseEvent(
                      JSON.stringify({
                        type: part.thought === true ? 'thinking' : 'token',
                        content: part.text,
                      })
                    )
                  );
                }
                // Search Grounding citations land in groundingMetadata.
                const grounding = candidate.groundingMetadata as
                  | { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> }
                  | undefined;
                for (const chunk of grounding?.groundingChunks ?? []) {
                  if (chunk.web?.uri) {
                    citations.push({
                      url: chunk.web.uri,
                      title: chunk.web.title ?? chunk.web.uri,
                    });
                  }
                }
                if (
                  typeof candidate.finishReason === 'string' &&
                  candidate.finishReason.length > 0
                ) {
                  receivedMessageStop = true;
                }
              }
              continue;
            }

            if (eventType === 'message_start') {
              const msg = parsed.message as Record<string, unknown> | undefined;
              if (msg?.model) resolvedModel = msg.model as string;
              if (msg?.usage) {
                const u = msg.usage as Record<string, number>;
                usage.input_tokens = u.input_tokens;
              }
            } else if (eventType === 'content_block_start') {
              const contentBlock = parsed.content_block as Record<string, unknown> | undefined;
              currentBlockType = (contentBlock?.type as string) ?? '';
              // Emit searching indicator when web search starts
              if (currentBlockType === 'server_tool_use' && contentBlock?.name === 'web_search') {
                const input = contentBlock?.input as Record<string, unknown> | undefined;
                controller.enqueue(
                  encodeSseEvent(JSON.stringify({ type: 'searching', query: input?.query ?? '' }))
                );
              }
            } else if (eventType === 'content_block_stop') {
              currentBlockType = '';
            } else if (eventType === 'content_block_delta') {
              const delta = parsed.delta as Record<string, unknown> | undefined;
              if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
                controller.enqueue(
                  encodeSseEvent(JSON.stringify({ type: 'token', content: delta.text }))
                );
              } else if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') {
                controller.enqueue(
                  encodeSseEvent(JSON.stringify({ type: 'thinking', content: delta.thinking }))
                );
              }
            } else if (eventType === 'message_delta') {
              const u = parsed.usage as Record<string, number> | undefined;
              if (u?.output_tokens) {
                usage.output_tokens = u.output_tokens;
              }
            } else if (eventType === 'message_stop') {
              receivedMessageStop = true;
              controller.enqueue(
                encodeSseEvent(
                  JSON.stringify({
                    type: 'done',
                    model: resolvedModel,
                    usage,
                    ...(citations.length > 0 && { citations }),
                  })
                )
              );
              controller.enqueue(encodeSseEvent('[DONE]'));
            }
          }
        }

        // If the upstream stream ends without an explicit stop event, emit done anyway.
        if (!receivedMessageStop) {
          controller.enqueue(
            encodeSseEvent(
              JSON.stringify({
                type: 'done',
                model: resolvedModel,
                usage,
                ...(citations.length > 0 && { citations }),
              })
            )
          );
          controller.enqueue(encodeSseEvent('[DONE]'));
        }
        reader.releaseLock();
      } catch (err) {
        pinoLogger.error({ err }, 'Chat stream error');
        controller.enqueue(
          encodeSseEvent(JSON.stringify({ type: 'error', message: sanitizeError(err) }))
        );
        controller.enqueue(encodeSseEvent('[DONE]'));
      } finally {
        // Record token usage (fire-and-forget, only if project_id provided)
        if (body?.project_id && (usage.input_tokens || usage.output_tokens)) {
          // biome-ignore lint/suspicious/noExplicitAny: generic error handler
          const apiKeyCtx = (c as any).get('apiKey') as { user_id?: string } | undefined;
          getDB()
            .then((db) =>
              recordUsage(db, {
                user_id: apiKeyCtx?.user_id,
                project_id: body!.project_id!,
                endpoint: 'chat',
                model: resolvedModel,
                input_tokens: usage.input_tokens ?? 0,
                output_tokens: usage.output_tokens ?? 0,
              })
            )
            .catch((err) => pinoLogger.warn({ err }, 'Failed to record stream chat usage'));
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});

// -----------------------------------------------------------------------
// GET /v1/chat/providers — List available providers (OpenAPI handler)
// -----------------------------------------------------------------------

chatRoutes.openapi(providersRoute, (c) => {
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
