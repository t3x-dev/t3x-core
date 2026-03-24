/**
 * Chat/LLM integration API
 */

import { API_V1, ApiError, fetchWithTimeout, handleResponse } from './core';

export interface ContentBlock {
  type: 'text' | 'image';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface Citation {
  url: string;
  title: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  provider?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  web_search?: boolean;
  thinking?: boolean;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  finish_reason?: string;
}

export interface ChatStreamEvent {
  type: 'token' | 'done' | 'error' | 'searching' | 'thinking';
  content?: string;
  model?: string;
  message?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  query?: string;
  citations?: Citation[];
}

/**
 * Non-streaming chat
 */
export async function chat(request: ChatRequest): Promise<ChatResponse> {
  const res = await fetchWithTimeout(
    `${API_V1}/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    },
    120000
  ); // 2 minute timeout for LLM
  return handleResponse<ChatResponse>(res);
}

/**
 * Streaming chat - returns async generator for SSE events
 */
export async function* chatStream(
  request: ChatRequest,
  options?: { signal?: AbortSignal }
): AsyncGenerator<ChatStreamEvent, void, unknown> {
  // Call API server directly
  const res = await fetch(`${API_V1}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: options?.signal,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({
      error: {
        code: 'CHAT_ERROR',
        message: `Server returned HTTP ${res.status} with non-JSON body`,
      },
    }));
    throw new ApiError(
      errorData.error?.code || 'CHAT_ERROR',
      errorData.error?.message || `Chat failed: HTTP ${res.status}`
    );
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new ApiError('CHAT_ERROR', 'No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events: data: {...}\n\n
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') continue;

        try {
          const event = JSON.parse(dataStr) as ChatStreamEvent;
          yield event;
        } catch {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('Failed to parse SSE event:', dataStr.slice(0, 120));
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
