/**
 * Chat/LLM integration API
 */

import { API_V1, ApiError, fetchWithTimeout, handleResponse, injectAuthHeaders } from './core';

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

function splitSseFrames(buffer: string, final = false): { frames: string[]; remaining: string } {
  const frames: string[] = [];
  const delimiter = /\r?\n\r?\n/g;
  let frameStart = 0;
  let match: RegExpExecArray | null;

  while ((match = delimiter.exec(buffer)) !== null) {
    frames.push(buffer.slice(frameStart, match.index));
    frameStart = delimiter.lastIndex;
  }

  const remaining = buffer.slice(frameStart);
  if (final && remaining.trim()) {
    frames.push(remaining);
    return { frames, remaining: '' };
  }

  return { frames, remaining };
}

function frameData(frame: string): string | null {
  const data = frame
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n')
    .trim();

  return data || null;
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
  const headers = await injectAuthHeaders(new Headers({ 'Content-Type': 'application/json' }));
  const res = await fetch(`${API_V1}/chat/stream`, {
    method: 'POST',
    headers,
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

      const { frames, remaining } = splitSseFrames(buffer);
      buffer = remaining;

      for (const frame of frames) {
        const dataStr = frameData(frame);
        if (!dataStr) continue;
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

    buffer += decoder.decode();
    const { frames } = splitSseFrames(buffer, true);
    for (const frame of frames) {
      const dataStr = frameData(frame);
      if (!dataStr) continue;
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
  } finally {
    reader.releaseLock();
  }
}
