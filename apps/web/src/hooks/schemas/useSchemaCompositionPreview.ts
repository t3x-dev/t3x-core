'use client';

import { useCallback, useState } from 'react';
import { previewYSchemaComposition } from '@/infrastructure/schemaComposition';
import type { SchemaCompositionDraft, SchemaCompositionPreviewResult } from '@/types/schemaModules';

export function useSchemaCompositionPreview() {
  const [result, setResult] = useState<SchemaCompositionPreviewResult>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const compile = useCallback(async (composition: SchemaCompositionDraft, projectId?: string) => {
    setPending(true);
    setError(undefined);
    try {
      const preview = await previewYSchemaComposition(composition, projectId);
      setResult(preview);
      return preview;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Composition preview failed.');
      return undefined;
    } finally {
      setPending(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(undefined);
    setError(undefined);
  }, []);

  const accept = useCallback((preview: SchemaCompositionPreviewResult) => {
    setResult(preview);
    setError(undefined);
  }, []);

  return { accept, compile, error, pending, reset, result };
}
