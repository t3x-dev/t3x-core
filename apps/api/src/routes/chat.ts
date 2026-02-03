/**
 * Chat Routes
 *
 * POST /v1/chat - Non-streaming chat
 * GET  /v1/chat/providers - List available providers
 */

import { Hono } from 'hono';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { jsonError, jsonSuccess } from '../lib/response';

// Create proxy agent if proxy is configured
function getProxyFetch() {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (proxyUrl) {
    const agent = new ProxyAgent(proxyUrl);
    return (url: string, options?: RequestInit) =>
      undiciFetch(url, { ...options, dispatcher: agent } as Parameters<typeof undiciFetch>[1]);
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
  claude: { model: 'claude-sonnet-4-5-20250929', envKey: 'ANTHROPIC_API_KEY' },
  anthropic: { model: 'claude-sonnet-4-5-20250929', envKey: 'ANTHROPIC_API_KEY' },
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
  } | null = null;

  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'INVALID_JSON', 'Invalid JSON body', 400);
  }

  if (!body?.messages || body.messages.length === 0) {
    return jsonError(c, 'INVALID_REQUEST', 'messages array is required', 400);
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

  const model = body.model ?? PROVIDER_DEFAULTS[provider]?.model ?? 'claude-sonnet-4-5-20250929';
  const temperature = body.temperature ?? 0.7;
  const maxTokens = body.max_tokens ?? 4096;

  try {
    // Currently only Claude is implemented
    if (provider === 'claude' || provider === 'anthropic') {
      const result = await callClaudeNonStreaming(
        body.messages,
        model,
        apiKey,
        temperature,
        maxTokens
      );
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
 */
chatRoutes.post('/v1/chat/stream', async (c) => {
  let body: {
    messages?: ChatMessage[];
    provider?: string;
    model?: string;
    temperature?: number;
    max_tokens?: number;
  } | null = null;

  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'INVALID_JSON', 'Invalid JSON body', 400);
  }

  if (!body?.messages || body.messages.length === 0) {
    return jsonError(c, 'INVALID_REQUEST', 'messages array is required', 400);
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

  const model = body.model ?? PROVIDER_DEFAULTS[provider]?.model ?? 'claude-sonnet-4-5-20250929';
  const temperature = body.temperature ?? 0.7;
  const maxTokens = body.max_tokens ?? 4096;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (provider === 'claude' || provider === 'anthropic') {
          const result = await callClaudeNonStreaming(
            body!.messages!,
            model,
            apiKey,
            temperature,
            maxTokens
          );
          controller.enqueue(
            encodeSseEvent(
              JSON.stringify({
                type: 'token',
                content: result.content,
                model: result.model,
              })
            )
          );
          controller.enqueue(encodeSseEvent(JSON.stringify({ type: 'done' })));
          controller.enqueue(encodeSseEvent('[DONE]'));
        } else {
          throw new Error(`Provider ${provider} not implemented`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        controller.enqueue(
          encodeSseEvent(
            JSON.stringify({
              type: 'error',
              message,
            })
          )
        );
        controller.enqueue(encodeSseEvent('[DONE]'));
      } finally {
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
