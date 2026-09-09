/**
 * LLM models API
 */

import { API_V1, fetchWithTimeout, handleResponse } from './core';
import type { LLMModelsResponse } from './types';

export async function getAvailableModels(): Promise<LLMModelsResponse> {
  const res = await fetchWithTimeout(`${API_V1}/llm/models`);
  return handleResponse<LLMModelsResponse>(res);
}
