/**
 * LLM models API
 */

import { API_V1, ApiError, fetchWithTimeout, handleResponse } from './core';
import type { LLMModelsResponse } from './types';

export async function getAvailableModels(): Promise<LLMModelsResponse> {
  const res = await fetchWithTimeout(`${API_V1}/llm/models`);
  return handleResponse<LLMModelsResponse>(res).catch((error: unknown) => {
    if (error instanceof ApiError && error.code === 'SESSION_RENEWAL_FAILED') throw error;
    if (res.status === 504) throw new ApiError('TIMEOUT', 'Model discovery timed out');
    if (res.status === 502 || res.status === 503)
      throw new ApiError('MODEL_UPSTREAM_UNAVAILABLE', 'Upstream model service unavailable');
    throw error;
  });
}
