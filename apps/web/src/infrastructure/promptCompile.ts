import type {
  PromptCompilePreviewRequest,
  PromptCompilePreviewResponse,
} from '@/types/promptCompile';
import { API_V1, fetchWithTimeout, handleResponse } from './core';

export async function fetchPromptCompilePreview(
  request: PromptCompilePreviewRequest,
  signal?: AbortSignal
): Promise<PromptCompilePreviewResponse> {
  const response = await fetchWithTimeout(
    `${API_V1}/prompts/compile-preview`,
    {
      body: JSON.stringify(request),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
    undefined,
    signal
  );
  return handleResponse<PromptCompilePreviewResponse>(response);
}
