import { useCallback } from 'react';
import { ApiError } from '@/infrastructure/core';
import { fetchPromptCompilePreview } from '@/infrastructure/promptCompile';
import type {
  PromptCompilePreviewRequest,
  PromptCompilePreviewResponse,
} from '@/types/promptCompile';

export class PromptCompilePreviewClientError extends Error {
  constructor(
    message: string,
    readonly runtimeUnavailable: boolean
  ) {
    super(message);
    this.name = 'PromptCompilePreviewClientError';
  }
}

export function usePromptCompilePreview() {
  const compilePromptPreview = useCallback(
    async (request: PromptCompilePreviewRequest): Promise<PromptCompilePreviewResponse> => {
      try {
        return await fetchPromptCompilePreview(request);
      } catch (error) {
        const runtimeUnavailable =
          error instanceof ApiError &&
          error.code === 'INVALID_REQUEST' &&
          /runtime is unavailable/i.test(error.message);
        throw new PromptCompilePreviewClientError(
          error instanceof Error ? error.message : 'The compile preview request failed.',
          runtimeUnavailable
        );
      }
    },
    []
  );

  return { compilePromptPreview };
}
