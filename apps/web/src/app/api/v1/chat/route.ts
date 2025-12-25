/**
 * Chat API Route
 *
 * POST /api/v1/chat - Non-streaming chat
 */

import { type NextRequest, NextResponse } from 'next/server';

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
 * Fetch with proxy support - uses undici when proxy is configured
 */
async function fetchWithProxy(
  url: string,
  options: RequestInit
): Promise<Response> {
  const proxyUrl = getProxyUrl();
  if (proxyUrl) {
    // Dynamic import to avoid build-time issues with undici
    const { ProxyAgent, fetch: undiciFetch } = await import('undici');
    const response = await undiciFetch(url, {
      ...options,
      dispatcher: new ProxyAgent(proxyUrl),
    } as Parameters<typeof undiciFetch>[1]);
    return response as unknown as Response;
  }
  return fetch(url, options);
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

  const response = await fetchWithProxy('https://api.anthropic.com/v1/messages', {
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

function successResponse<T>(data: T) {
  return { success: true, data };
}

function errorResponse(code: string, message: string) {
  return { success: false, error: { code, message } };
}

export async function POST(request: NextRequest) {
  let body: ChatRequest | null = null;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(errorResponse('INVALID_JSON', 'Invalid JSON body'), { status: 400 });
  }

  if (!body?.messages || body.messages.length === 0) {
    return NextResponse.json(
      errorResponse('INVALID_REQUEST', 'messages array is required'),
      { status: 400 }
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
    return NextResponse.json(
      errorResponse('PROVIDER_ERROR', `API key not configured for provider: ${provider}`),
      { status: 400 }
    );
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
      return NextResponse.json(successResponse(result));
    } else {
      return NextResponse.json(
        errorResponse('PROVIDER_ERROR', `Provider ${provider} not implemented`),
        { status: 400 }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(errorResponse('CHAT_ERROR', message), { status: 500 });
  }
}
