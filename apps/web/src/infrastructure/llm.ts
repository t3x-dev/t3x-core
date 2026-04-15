/**
 * LLM models API
 */

import { API_BASE, API_V1, fetchWithTimeout, handleResponse } from './core';
import type { LLMModelsResponse } from './types';

export async function getAvailableModels(): Promise<LLMModelsResponse> {
  const res = await fetchWithTimeout(`${API_V1}/llm/models`);
  return handleResponse<LLMModelsResponse>(res);
}

/**
 * Raw POST to /api/v1/extract-yops. The endpoint returns an unwrapped
 * `{ ops }` payload (pre-envelope contract); callers parse it directly.
 *
 * L1 infrastructure surface for commands/yops/llmAdapter.ts — the command
 * layer must not call `fetch()` itself.
 */
export async function postExtractYops(body: Record<string, unknown>): Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}> {
  const base = API_BASE || (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000');
  return fetch(`${base}/api/v1/extract-yops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
