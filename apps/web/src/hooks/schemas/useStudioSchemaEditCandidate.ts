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
  const activeKey = useRef(key);
  activeKey.current = key;
  const mounted = useRef(false);
  const readRequest = useRef(0);
  const running = useRef<{
    epoch: number;
    facts: string;
    promise: Promise<Awaited<ReturnType<typeof saveStudioSchemaEditCandidate>>>;
  } | null>(null);
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
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (
      !projectId ||
      !workspaceId ||
      !mounted.current ||
      activeKey.current !== key ||
      running.current?.epoch === epoch.current
    )
      return;
    const current = epoch.current;
    const token = ++readRequest.current;
    const isCurrent = () =>
      mounted.current &&
      activeKey.current === key &&
      current === epoch.current &&
      token === readRequest.current;
    try {
      const candidate = await readStudioSchemaEditCandidate(projectId, workspaceId);
      if (isCurrent()) setResult({ key, candidate });
    } catch (error) {
      if (isCurrent())
        setResult({
          key,
          candidate: null,
          error: error instanceof Error ? error.message : 'Schema edit candidate unavailable',
        });
    }
  }, [key, projectId, workspaceId]);

  useEffect(() => {
    mounted.current = true;
    ++epoch.current;
    setResult(undefined);
    setPendingKey(null);
    void refresh();
    return () => {
      mounted.current = false;
      ++epoch.current;
      ++readRequest.current;
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
    pending: pendingKey === key,
    refresh,
    save: (input: SaveStudioSchemaEditCandidateInput) => {
      if (!mounted.current || activeKey.current !== key || !projectId || !workspaceId)
        return Promise.reject(new Error('The Schema editing context changed. Reopen the Draft.'));
      const currentEpoch = epoch.current;
      const isCurrent = () =>
        mounted.current && activeKey.current === key && currentEpoch === epoch.current;
      const scope = `${projectId}:${workspaceId}`;
      const { retryKey: _retryKey, ...facts } = input;
      const fingerprint = canonicalJson(JSON.parse(JSON.stringify(facts)));
      const pending = running.current;
      if (pending?.epoch === currentEpoch) {
        return pending.facts === fingerprint
          ? pending.promise
          : Promise.reject(new Error('Schema is already saving. Wait before saving another edit.'));
      }
      if (saveAttempt.current?.scope !== scope || saveAttempt.current.facts !== fingerprint) {
        saveAttempt.current = { scope, facts: fingerprint, input: structuredClone(input) };
      }
      const attempt = saveAttempt.current;
      // Reads started before this write cannot acknowledge or replace its result.
      ++readRequest.current;
      setPendingKey(key);
      const run = async () => {
        let saved: Awaited<ReturnType<typeof saveStudioSchemaEditCandidate>>;
        try {
          saved = await saveStudioSchemaEditCandidate(projectId, workspaceId, attempt.input);
        } catch (error) {
          if (!isCurrent()) throw error;
          // A lost response does not prove that the write failed. Only retry the
          // exact request after the server identifies it as the saved attempt.
          const recovered = await readStudioSchemaEditCandidate(projectId, workspaceId).catch(
            () => null
          );
          if (!isCurrent() || recovered?.retryKey !== attempt.input.retryKey) throw error;
          saved = await saveStudioSchemaEditCandidate(projectId, workspaceId, attempt.input);
        }
        if (!isCurrent()) throw new Error('The Schema editing context changed. Reopen the Draft.');
        if (saveAttempt.current === attempt) saveAttempt.current = undefined;
        setResult({ key, candidate: saved.candidate });
        return saved;
      };
      const promise = run().finally(() => {
        if (running.current?.promise === promise) running.current = null;
        if (isCurrent()) setPendingKey(null);
      });
      running.current = { epoch: currentEpoch, facts: fingerprint, promise };
      return promise;
    },
  };
}
