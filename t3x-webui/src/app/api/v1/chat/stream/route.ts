/**
 * Chat Stream API Route
 *
 * POST /api/v1/chat/stream - Streaming chat with SSE
 */

import { NextRequest } from 'next/server';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

/**
 * Get proxy URL from environment variables
 */
function getProxyUrl(): string | undefined {
  return (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy
  );
}

/**
 * Create fetch options with proxy support
 */
function getFetchOptions(): { dispatcher?: ProxyAgent } {
  const proxyUrl = getProxyUrl();
  if (proxyUrl) {
    return { dispatcher: new ProxyAgent(proxyUrl) };
  }
  return {};
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  provider?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

const PROVIDER_DEFAULTS: Record<string, { model: string }> = {
  claude: { model: 'claude-sonnet-4-5-20250929' },
  anthropic: { model: 'claude-sonnet-4-5-20250929' },
};

function inferProviderFromModel(model: string): string {
  const modelLower = model.toLowerCase();
  if (modelLower.startsWith('claude') || modelLower.includes('anthropic')) {
    return 'claude';
  }
  if (modelLower.startsWith('gpt') || modelLower.startsWith('o1') || modelLower.includes('openai')) {
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

function errorResponse(code: string, message: string) {
  return { success: false, error: { code, message } };
}

export async function POST(request: NextRequest) {
  let body: ChatRequest | null = null;

  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify(errorResponse('INVALID_JSON', 'Invalid JSON body')), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body?.messages || body.messages.length === 0) {
    return new Response(
      JSON.stringify(errorResponse('INVALID_REQUEST', 'messages array is required')),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
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
    return new Response(
      JSON.stringify(errorResponse('PROVIDER_ERROR', `API key not configured for provider: ${provider}`)),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const model = body.model ?? PROVIDER_DEFAULTS[provider]?.model ?? 'claude-sonnet-4-5-20250929';
  const temperature = body.temperature ?? 0.7;
  const maxTokens = body.max_tokens ?? 4096;

  // Extract system message if present
  const systemMessage = body.messages.find((m) => m.role === 'system');
  const otherMessages = body.messages.filter((m) => m.role !== 'system');

  // Create streaming response
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await undiciFetch('https://api.anthropic.com/v1/messages', {
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
          ...getFetchOptions(),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          const errorEvent = { type: 'error', message: `Claude API error: ${response.status} ${errorBody}` };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
          controller.close();
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          const errorEvent = { type: 'error', message: 'No response body' };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let accumulatedContent = '';
        let sentDone = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process SSE events from Claude
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) continue;

            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') continue;

            try {
              const event = JSON.parse(dataStr) as {
                type: string;
                delta?: { type: string; text?: string };
                message?: { model?: string };
              };

              if (event.type === 'content_block_delta' && event.delta?.text) {
                const token = event.delta.text;
                accumulatedContent += token;

                // Send token event
                const tokenEvent = { type: 'token', content: token };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(tokenEvent)}\n\n`));
              } else if (event.type === 'message_stop' && !sentDone) {
                // Send done event
                const doneEvent = {
                  type: 'done',
                  model,
                  content: accumulatedContent,
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(doneEvent)}\n\n`));
                sentDone = true;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }

        // Ensure done event is sent if we haven't sent it yet
        if (accumulatedContent && !sentDone) {
          const doneEvent = {
            type: 'done',
            model,
            content: accumulatedContent,
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(doneEvent)}\n\n`));
        }

        controller.close();
      } catch (err) {
        const errorEvent = { type: 'error', message: (err as Error).message };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
