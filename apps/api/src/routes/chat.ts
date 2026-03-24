/**
 * Chat Routes
 *
 * POST /v1/chat - Non-streaming chat
 * GET  /v1/chat/providers - List available providers
 */

import { recordUsage } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { getDB } from '../lib/db';
import { jsonError, jsonSuccess } from '../lib/response';
import { pinoLogger } from '../middleware/logger';

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

const PROVIDER_DEFAULTS: Record<string, { model: string; envKey: string }> = {
  claude: { model: 'claude-sonnet-4-20250514', envKey: 'ANTHROPIC_API_KEY' },
  anthropic: { model: 'claude-sonnet-4-20250514', envKey: 'ANTHROPIC_API_KEY' },
  openai: { model: 'gpt-4o-mini', envKey: 'OPENAI_API_KEY' },
  gpt: { model: 'gpt-4o-mini', envKey: 'OPENAI_API_KEY' },
};

// ============================================================================
// Helpers
// ============================================================================

function inferProviderFromModel(model: string): string {
  const modelLower = model.toLowerCase();
  if (modelLower.startsWith('claude') || modelLower.includes('anthropic')) {
    return 'claude';
  }
  if (
    modelLower.startsWith('gpt') ||
    modelLower.startsWith('o1') ||
    modelLower.includes('openai')
  ) {
    return 'openai';
  }
  return 'claude';
}

function getApiKey(provider: string): string | undefined {
  const providerLower = provider.toLowerCase();
  if (providerLower === 'claude' || providerLower === 'anthropic') {
    return process.env.ANTHROPIC_API_KEY;
  }
  return process.env.OPENAI_API_KEY;
}

function encodeSseEvent(payload: string): Uint8Array {
  return new TextEncoder().encode(`data: ${payload}\n\n`);
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
      max_tokens: maxTokens,
      ...(options?.thinking
        ? { thinking: { type: 'enabled', budget_tokens: 10000 } }
        : { temperature }
      ),
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

export const chatRoutes = new Hono();

/**
 * POST /v1/chat - Non-streaming chat
 */
chatRoutes.post('/v1/chat', async (c) => {
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
    return jsonError(c, 'INVALID_JSON', 'Invalid JSON body', 400);
  }

  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 100) {
    return jsonError(c, 'INVALID_REQUEST', 'messages must be an array of 1-100 items', 400);
  }

  const msgError = validateMessages(messages);
  if (msgError) {
    return jsonError(c, 'INVALID_REQUEST', msgError, 400);
  }

  // Determine provider
  let provider = body.provider ?? 'claude';
  if (body.model && provider === 'claude') {
    const inferred = inferProviderFromModel(body.model);
    if (inferred !== provider) {
      provider = inferred;
    }
  }

  const apiKey = getApiKey(provider);
  if (!apiKey) {
    return jsonError(c, 'PROVIDER_ERROR', `API key not configured for provider: ${provider}`, 400);
  }

  const model = body.model ?? PROVIDER_DEFAULTS[provider]?.model ?? 'claude-sonnet-4-20250514';
  const temperature = body.temperature ?? 0.7;
  const maxTokens = Math.min(Math.max(parseInt(String(body.max_tokens), 10) || 4096, 1), 16384);

  try {
    // Currently only Claude is implemented
    if (provider === 'claude' || provider === 'anthropic') {
      const result = await callClaudeNonStreaming(messages, model, apiKey, temperature, maxTokens, { thinking: body.thinking });

      // Record token usage (fire-and-forget, only if project_id provided)
      if (body?.project_id && result.usage) {
        const apiKeyCtx = c.get('apiKey') as { user_id?: string } | undefined;
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

      return jsonSuccess(c, result);
    } else {
      return jsonError(c, 'PROVIDER_ERROR', `Provider ${provider} not implemented`, 400);
    }
  } catch (err) {
    pinoLogger.error({ err }, 'Chat error');
    return jsonError(c, 'CHAT_ERROR', sanitizeError(err), 500);
  }
});

/**
 * POST /v1/chat/stream - Streaming chat (SSE)
 *
 * Uses true streaming: calls Anthropic's API with stream=true and
 * re-emits token chunks as they arrive, so the user sees text
 * incrementally instead of waiting for the full response.
 */
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
    return jsonError(c, 'INVALID_JSON', 'Invalid JSON body', 400);
  }

  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 100) {
    return jsonError(c, 'INVALID_REQUEST', 'messages must be an array of 1-100 items', 400);
  }

  const msgError = validateMessages(messages);
  if (msgError) {
    return jsonError(c, 'INVALID_REQUEST', msgError, 400);
  }

  // Determine provider
  let provider = body.provider ?? 'claude';
  if (body.model && provider === 'claude') {
    const inferred = inferProviderFromModel(body.model);
    if (inferred !== provider) {
      provider = inferred;
    }
  }

  const apiKey = getApiKey(provider);
  if (!apiKey) {
    return jsonError(c, 'PROVIDER_ERROR', `API key not configured for provider: ${provider}`, 400);
  }

  const model = body.model ?? PROVIDER_DEFAULTS[provider]?.model ?? 'claude-sonnet-4-20250514';
  const temperature = body.temperature ?? 0.7;
  const maxTokens = Math.min(Math.max(parseInt(String(body.max_tokens), 10) || 4096, 1), 16384);

  if (provider !== 'claude' && provider !== 'anthropic') {
    return jsonError(c, 'PROVIDER_ERROR', `Provider ${provider} not implemented`, 400);
  }

  const useThinking = body.thinking && (provider === 'claude' || provider === 'anthropic');

  // Extract system message if present
  const systemMessage = messages.find((m) => m.role === 'system');
  const otherMessages = messages.filter((m) => m.role !== 'system');

  const stream = new ReadableStream({
    async start(controller) {
      let anthropicResponse: Response | undefined;
      try {
        const proxyFetch = getProxyFetch();
        anthropicResponse = (await proxyFetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            ...(body.web_search && { 'anthropic-beta': 'web-search-2025-03-05' }),
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            ...(useThinking
              ? { thinking: { type: 'enabled', budget_tokens: 10000 } }
              : { temperature }
            ),
            stream: true,
            ...(systemMessage && { system: systemMessage.content }),
            ...(body.web_search && { tools: [{ type: 'web_search_20250305' }] }),
            messages: otherMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
          signal: AbortSignal.timeout(120000),
        })) as unknown as Response;

        if (!anthropicResponse.ok) {
          const errorText = await anthropicResponse.text();
          pinoLogger.error(
            { status: anthropicResponse.status, errorText },
            'Claude streaming API error'
          );
          throw new Error(`Claude API error: ${anthropicResponse.status}`);
        }

        const reader = anthropicResponse.body?.getReader();
        if (!reader) {
          throw new Error('No response body from Claude API');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let resolvedModel = model;
        const usage: { input_tokens?: number; output_tokens?: number } = {};
        let receivedMessageStop = false;
        const citations: Array<{ url: string; title: string }> = [];
        let currentBlockType = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value as Uint8Array, { stream: true });

          // Parse SSE events separated by double newlines
          const parts = buffer.split('\n\n');
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

            let parsed: Record<string, unknown>;
            try {
              parsed = JSON.parse(dataStr);
            } catch {
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

        // If Anthropic stream ended without message_stop, emit done anyway
        // (safety net for abnormal stream termination)
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
          const apiKeyCtx = c.get('apiKey') as { user_id?: string } | undefined;
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

/**
 * GET /v1/chat/providers - List available providers
 */
chatRoutes.get('/v1/chat/providers', (c) => {
  const availableProviders: string[] = ['claude'];

  // Check if OpenAI is configured
  if (process.env.OPENAI_API_KEY) {
    availableProviders.push('openai');
  }

  return jsonSuccess(c, {
    providers: availableProviders,
    default: 'claude',
  });
});
