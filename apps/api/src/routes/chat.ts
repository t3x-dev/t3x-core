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

// Check if URL host matches NO_PROXY list
function isNoProxy(url: string): boolean {
  const noProxy = process.env.NO_PROXY || process.env.no_proxy;
  if (!noProxy) return false;
  if (noProxy === '*') return true;
  try {
    const host = new URL(url).hostname;
    return noProxy.split(',').some((p) => host.endsWith(p.trim()));
  } catch {
    return false;
  }
}

// Create proxy-aware fetch. Respects NO_PROXY env var.
function getProxyFetch() {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (proxyUrl) {
    const agent = new ProxyAgent(proxyUrl);
    return async (url: string, options?: RequestInit) => {
      if (isNoProxy(url)) {
        // Node.js built-in fetch also uses proxy env vars — temporarily unset them
        const saved = { hp: process.env.HTTP_PROXY, hs: process.env.HTTPS_PROXY, hp2: process.env.http_proxy, hs2: process.env.https_proxy };
        delete process.env.HTTP_PROXY; delete process.env.HTTPS_PROXY; delete process.env.http_proxy; delete process.env.https_proxy;
        try { return await fetch(url, options); } finally {
          if (saved.hp) process.env.HTTP_PROXY = saved.hp; if (saved.hs) process.env.HTTPS_PROXY = saved.hs;
          if (saved.hp2) process.env.http_proxy = saved.hp2; if (saved.hs2) process.env.https_proxy = saved.hs2;
        }
      }
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
// Types
// ============================================================================

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
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
  maxTokens: number
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
      temperature,
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
    throw new Error(`Claude API error: ${response.status} ${responseText}`);
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
      const result = await callClaudeNonStreaming(messages, model, apiKey, temperature, maxTokens);

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
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'CHAT_ERROR', message, 500);
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
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            temperature,
            stream: true,
            ...(systemMessage && { system: systemMessage.content }),
            messages: otherMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
          signal: AbortSignal.timeout(120000),
        })) as unknown as Response;

        if (!anthropicResponse.ok) {
          const errorText = await anthropicResponse.text();
          throw new Error(`Claude API error: ${anthropicResponse.status} ${errorText}`);
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
              // Extract model and initial usage from message_start
              const msg = parsed.message as Record<string, unknown> | undefined;
              if (msg?.model) resolvedModel = msg.model as string;
              if (msg?.usage) {
                const u = msg.usage as Record<string, number>;
                usage.input_tokens = u.input_tokens;
              }
            } else if (eventType === 'content_block_delta') {
              // Extract text delta and emit as token
              const delta = parsed.delta as Record<string, unknown> | undefined;
              if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
                controller.enqueue(
                  encodeSseEvent(JSON.stringify({ type: 'token', content: delta.text }))
                );
              }
            } else if (eventType === 'message_delta') {
              // Extract final usage from message_delta
              const u = parsed.usage as Record<string, number> | undefined;
              if (u?.output_tokens) {
                usage.output_tokens = u.output_tokens;
              }
            } else if (eventType === 'message_stop') {
              // Stream complete — emit done
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
            }
            // Ignore other event types (content_block_start, content_block_stop, ping)
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
              })
            )
          );
          controller.enqueue(encodeSseEvent('[DONE]'));
        }
        reader.releaseLock();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        controller.enqueue(encodeSseEvent(JSON.stringify({ type: 'error', message })));
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
