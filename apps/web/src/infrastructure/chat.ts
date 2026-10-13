/**
 * Chat/LLM integration API
 */

import { API_V1, fetchWithTimeout, handleResponse } from './core';

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

export function splitSseFrames(
  buffer: string,
  final = false
): { frames: string[]; remaining: string } {
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

export function frameData(frame: string): string | null {
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
