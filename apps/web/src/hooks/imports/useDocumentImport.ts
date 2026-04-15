/**
 * useDocumentImport — view-facing API for file-based conversation import
 * (PDF / Word / Markdown etc.).
 */

import { useCallback } from 'react';
import { importDocument, previewDocumentImport, streamDocumentImport } from '@/infrastructure/misc';
import type { ImportPreviewResult, ImportResult, ImportStreamEvent } from '@/types/api';

export function useDocumentImport() {
  const preview = useCallback(
    async (file: File, projectId?: string): Promise<ImportPreviewResult> =>
      previewDocumentImport(file, projectId),
    []
  );
  const stream = useCallback(
    (file: File, projectId: string): AsyncGenerator<ImportStreamEvent> =>
      streamDocumentImport(file, projectId),
    []
  );
  const run = useCallback(
    async (file: File, projectId: string): Promise<ImportResult> => importDocument(file, projectId),
    []
  );
  return { preview, stream, run };
}
