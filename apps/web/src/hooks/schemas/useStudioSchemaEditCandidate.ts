'use client';

import type {
  SaveStudioSchemaEditCandidateInput,
  StudioSchemaEditCandidate,
} from '@t3x-dev/api-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  readStudioSchemaEditCandidate,
  saveStudioSchemaEditCandidate,
} from '@/infrastructure/schemaStudio';

export function useStudioSchemaEditCandidate(
  projectId: string,
  workspaceId: string,
  workspaceRevision?: number
) {
  const key = `${projectId}:${workspaceId}:${workspaceRevision ?? 'unknown'}`;
  const epoch = useRef(0);
  const [result, setResult] = useState<{
    key: string;
    candidate: StudioSchemaEditCandidate | null;
    error?: string;
  }>();
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId || !workspaceId) return;
    const current = epoch.current;
    try {
      const candidate = await readStudioSchemaEditCandidate(projectId, workspaceId);
      if (current === epoch.current) setResult({ key, candidate });
    } catch (error) {
      if (current === epoch.current)
        setResult({
          key,
          candidate: null,
          error: error instanceof Error ? error.message : 'Schema edit candidate unavailable',
        });
    }
  }, [key, projectId, workspaceId]);

  useEffect(() => {
    ++epoch.current;
    setResult(undefined);
    setPending(false);
    void refresh();
    return () => {
      ++epoch.current;
    };
  }, [refresh]);

  const current = result?.key === key ? result : undefined;
  return {
    candidate: current?.candidate ?? null,
    error: current?.error,
    loading: Boolean(projectId && workspaceId) && !current,
    pending,
    refresh,
    save: async (input: SaveStudioSchemaEditCandidateInput) => {
      const currentEpoch = epoch.current;
      setPending(true);
      try {
        const saved = await saveStudioSchemaEditCandidate(projectId, workspaceId, input);
        if (currentEpoch === epoch.current) setResult({ key, candidate: saved.candidate });
        return saved;
      } finally {
        if (currentEpoch === epoch.current) setPending(false);
      }
    },
  };
}
