'use client';

import type {
  SaveStudioSchemaEditCandidateInput,
  StudioSchemaEditCandidate,
} from '@t3x-dev/api-client';
import { canonicalJson } from '@t3x-dev/yops';
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
  const saveAttempt = useRef<
    | {
        scope: string;
        facts: string;
        input: SaveStudioSchemaEditCandidateInput;
      }
    | undefined
  >(undefined);
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

  useEffect(() => {
    const updated = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId: string; workspaceId: string }>).detail;
      if (detail?.projectId === projectId && detail.workspaceId === workspaceId) void refresh();
    };
    const storage = (event: StorageEvent) => {
      if (event.key !== 't3x-schema-candidate-updated' || !event.newValue) return;
      try {
        updated(
          new CustomEvent('t3x-schema-candidate-updated', { detail: JSON.parse(event.newValue) })
        );
      } catch {
        /* Ignore unrelated malformed notifications. */
      }
    };
    const focus = () => void refresh();
    window.addEventListener('focus', focus);
    window.addEventListener('t3x-schema-candidate-updated', updated);
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener('focus', focus);
      window.removeEventListener('t3x-schema-candidate-updated', updated);
      window.removeEventListener('storage', storage);
    };
  }, [projectId, workspaceId, refresh]);

  const current = result?.key === key ? result : undefined;
  return {
    candidate: current?.candidate ?? null,
    error: current?.error,
    loading: Boolean(projectId && workspaceId) && !current,
    pending,
    refresh,
    save: async (input: SaveStudioSchemaEditCandidateInput) => {
      const currentEpoch = epoch.current;
      const scope = `${projectId}:${workspaceId}`;
      const { retryKey: _retryKey, ...facts } = input;
      const fingerprint = canonicalJson(JSON.parse(JSON.stringify(facts)));
      if (saveAttempt.current?.scope !== scope || saveAttempt.current.facts !== fingerprint) {
        saveAttempt.current = { scope, facts: fingerprint, input: structuredClone(input) };
      }
      const attempt = saveAttempt.current;
      setPending(true);
      try {
        let saved: Awaited<ReturnType<typeof saveStudioSchemaEditCandidate>>;
        try {
          saved = await saveStudioSchemaEditCandidate(projectId, workspaceId, attempt.input);
        } catch (error) {
          // A lost response does not prove that the write failed. Only retry the
          // exact request after the server identifies it as the saved attempt.
          const recovered = await readStudioSchemaEditCandidate(projectId, workspaceId).catch(
            () => null
          );
          if (currentEpoch !== epoch.current || recovered?.retryKey !== attempt.input.retryKey)
            throw error;
          saved = await saveStudioSchemaEditCandidate(projectId, workspaceId, attempt.input);
        }
        if (saveAttempt.current === attempt) saveAttempt.current = undefined;
        if (currentEpoch === epoch.current) setResult({ key, candidate: saved.candidate });
        return saved;
      } finally {
        if (currentEpoch === epoch.current) setPending(false);
      }
    },
  };
}
