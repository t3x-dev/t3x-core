'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { previewYSchemaComposition } from '@/infrastructure/schemaComposition';
import type { SchemaCompositionDraft, SchemaCompositionPreviewResult } from '@/types/schemaModules';

type PreviewState =
  | { status: 'idle' | 'pending'; result?: undefined; error?: undefined }
  | { status: 'ready'; result: SchemaCompositionPreviewResult; error?: undefined }
  | { status: 'error'; result?: undefined; error: string };

export function useSchemaCompositionPreview() {
  const [state, setState] = useState<PreviewState>({ status: 'idle' });
  const generation = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      ++generation.current;
    };
  }, []);

  const compile = useCallback(async (composition: SchemaCompositionDraft, projectId?: string) => {
    if (!mounted.current) return undefined;
    const token = ++generation.current;
    const isCurrent = () => mounted.current && generation.current === token;
    setState({ status: 'pending' });
    try {
      const preview = await previewYSchemaComposition(composition, projectId);
      if (!isCurrent()) return undefined;
      setState({ status: 'ready', result: preview });
      return preview;
    } catch (cause) {
      if (isCurrent())
        setState({
          status: 'error',
          error: cause instanceof Error ? cause.message : 'Composition preview failed.',
        });
      return undefined;
    }
  }, []);

  const reset = useCallback(() => {
    ++generation.current;
    setState({ status: 'idle' });
  }, []);

  const accept = useCallback((preview: SchemaCompositionPreviewResult) => {
    ++generation.current;
    setState({ status: 'ready', result: preview });
  }, []);

  return {
    accept,
    compile,
    error: state.error,
    pending: state.status === 'pending',
    reset,
    result: state.result,
  };
}
