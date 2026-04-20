/**
 * SSE Extraction Stream client — fetch() + manual line parser.
 * Follows the same pattern as chatStream() in chat.ts.
 * Parses named SSE events (event: type\ndata: json).
 */

import { API_V1, ApiError, injectAuthHeaders } from './core';

export interface ExtractionStreamEvent {
  type: 'status' | 'yop' | 'reorganized' | 'drift' | 'skipped' | 'done' | 'error';
  data: Record<string, unknown>;
}

export interface ExtractionStreamRequest {
  conversation_id: string;
  turn_hashes?: string[];
  topic_id?: string;
  force_extract?: boolean;
}

export async function* extractionStream(
  request: ExtractionStreamRequest,
  options?: { signal?: AbortSignal }
): AsyncGenerator<ExtractionStreamEvent, void, unknown> {
  const headers = await injectAuthHeaders(new Headers({ 'Content-Type': 'application/json' }));
  const res = await fetch(`${API_V1}/extract/trees/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
    signal: options?.signal,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({
      error: { code: 'EXTRACTION_ERROR', message: `HTTP ${res.status}` },
    }));
    throw new ApiError(
      errorData.error?.code || 'EXTRACTION_ERROR',
      errorData.error?.message || `Extraction stream failed: HTTP ${res.status}`
    );
  }

  const reader = res.body?.getReader();
  if (!reader) throw new ApiError('EXTRACTION_ERROR', 'No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';

      for (const chunk of chunks) {
        const lines = chunk.trim().split('\n');
        let eventType = '';
        let eventData = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) eventType = line.slice(7);
          else if (line.startsWith('data: ')) eventData = line.slice(6);
        }

        if (!eventType || !eventData || eventData === '[DONE]') continue;

        try {
          const parsed = JSON.parse(eventData);
          yield { type: eventType as ExtractionStreamEvent['type'], data: parsed };
        } catch {
          // Skip malformed events
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
