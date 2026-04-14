/**
 * useUrlImport — view-facing API for URL-based conversation import.
 *
 * Wraps the preview / streaming / plain-import functions. Streaming is
 * exposed as-is (async generator), so callers can `for await` over
 * events and render progress.
 */

import { useCallback } from 'react';
import { importFromUrl, previewUrlImport, streamUrlImport } from '@/infrastructure/misc';
import type { ImportPreviewResult, ImportResult, ImportStreamEvent } from '@/types/api';

export function useUrlImport() {
  const preview = useCallback(
    async (url: string, projectId?: string): Promise<ImportPreviewResult> =>
      previewUrlImport(url, projectId),
    []
  );
  const stream = useCallback(
    (url: string, projectId: string): AsyncGenerator<ImportStreamEvent> =>
      streamUrlImport(url, projectId),
    []
  );
  const run = useCallback(
    async (url: string, projectId: string): Promise<ImportResult> => importFromUrl(url, projectId),
    []
  );
  return { preview, stream, run };
}
