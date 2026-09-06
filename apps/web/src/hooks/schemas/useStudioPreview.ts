'use client';
import type { StudioPreview, StudioPreviewInput } from '@t3x-dev/api-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { applyStudioSelection, previewStudioSelection } from '@/infrastructure/schemaStudio';

/** Results belong to the exact selection and Workspace revision that requested them. */
export function useStudioPreview(
  projectId: string,
  input: StudioPreviewInput,
  workspaceRevision?: number
) {
  const key = JSON.stringify([projectId, input, workspaceRevision]);
  const epoch = useRef(0);
  const [result, setResult] = useState<{ key: string; data?: StudioPreview; error?: string }>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const current = ++epoch.current;
    setResult(undefined);
    const [target, selection] = JSON.parse(key) as [string, StudioPreviewInput];
    if (!selection.candidateIds.length) return;
    void previewStudioSelection(target, selection).then(
      (data) => {
        if (current === epoch.current) setResult({ key, data });
      },
      (error: unknown) => {
        if (current === epoch.current)
          setResult({
            key,
            error: error instanceof Error ? error.message : 'Could not resolve selection',
          });
      }
    );
    return () => {
      ++epoch.current;
    };
  }, [key, retry]);
  const current = result?.key === key ? result : undefined;
  return {
    data: current?.data,
    error: current?.error,
    loading: input.candidateIds.length > 0 && !current,
    refresh: () => setRetry((value) => value + 1),
  };
}

export function useApplyStudioSelection(projectId: string) {
  return useCallback(
    (input: Parameters<typeof applyStudioSelection>[1]) => applyStudioSelection(projectId, input),
    [projectId]
  );
}
