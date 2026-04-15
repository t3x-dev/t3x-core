/**
 * usePlatformImport — view-facing API for platform-export import
 * (ChatGPT / Claude / Gemini conversation dumps).
 */

import { useCallback } from 'react';
import {
  importFromPlatform,
  previewPlatformImport,
  streamPlatformImport,
} from '@/infrastructure/misc';
import type { ImportStreamEvent, PlatformImportResult, PlatformPreviewResult } from '@/types/api';

export function usePlatformImport() {
  const preview = useCallback(
    async (file: File): Promise<PlatformPreviewResult> => previewPlatformImport(file),
    []
  );
  const stream = useCallback(
    (
      projectId: string,
      platformData: string,
      conversationIds?: string[]
    ): AsyncGenerator<ImportStreamEvent> =>
      streamPlatformImport(projectId, platformData, conversationIds),
    []
  );
  const run = useCallback(
    async (
      projectId: string,
      platformData: string,
      conversationIds?: string[]
    ): Promise<PlatformImportResult> =>
      importFromPlatform(projectId, platformData, conversationIds),
    []
  );
  return { preview, stream, run };
}
