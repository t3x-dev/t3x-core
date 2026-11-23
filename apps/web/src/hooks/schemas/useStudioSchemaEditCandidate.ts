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
import { getSessionUser } from '@/infrastructure/session';
import { notifySchemaCandidateUpdated } from '@/utils/schemaCandidateEvents';

export function useStudioSchemaEditCandidate(
  projectId: string,
  workspaceId: string,
  workspaceRevision?: number,
  confirmedEmpty = false
) {
  const sessionId = useRef(getSessionUser()?.id ?? null);
  const sameSession = () => (getSessionUser()?.id ?? null) === sessionId.current;
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
    if (!sameSession()) {
      ++epoch.current;
      setPendingKey(null);
      setResult({ key, candidate: null, error: 'Account changed. Reload Schema before editing.' });
      return;
    }
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
      sameSession() &&
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
    if (!confirmedEmpty) void refresh();
    return () => {
      mounted.current = false;
      ++epoch.current;
      ++readRequest.current;
    };
  }, [refresh, confirmedEmpty]);

  useEffect(() => {
    const updated = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId: string; workspaceId: string }>).detail;
      if (detail?.projectId === projectId && detail.workspaceId === workspaceId) void refresh();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === 't3x-user' || event.key === null) {
        void refresh();
        return;
      }
      if (event.key !== 't3x-schema-candidate-updated' || !event.newValue) return;
      try {
        updated(
          new CustomEvent('t3x-schema-candidate-updated', { detail: JSON.parse(event.newValue) })
        );
      } catch {
        /* Ignore unrelated malformed notifications. */
      }
    };
    const focus = () => {
      if (!confirmedEmpty) void refresh();
    };
    window.addEventListener('focus', focus);
    window.addEventListener('t3x-schema-candidate-updated', updated);
    window.addEventListener('storage', storage);
    window.addEventListener('t3x:session-changed', focus);
    return () => {
      window.removeEventListener('focus', focus);
      window.removeEventListener('t3x-schema-candidate-updated', updated);
      window.removeEventListener('storage', storage);
      window.removeEventListener('t3x:session-changed', focus);
    };
  }, [projectId, workspaceId, refresh, confirmedEmpty]);

  const current = result?.key === key ? result : undefined;
  return {
    candidate: current?.candidate ?? null,
    error: current?.error,
    loading: Boolean(projectId && workspaceId) && !confirmedEmpty && !current,
    pending: pendingKey === key,
    refresh,
    save: (input: SaveStudioSchemaEditCandidateInput) => {
      if (
        !sameSession() ||
        !mounted.current ||
        activeKey.current !== key ||
        !projectId ||
        !workspaceId
      )
        return Promise.reject(new Error('The Schema editing context changed. Reopen the Draft.'));
      const currentEpoch = epoch.current;
      const isCurrent = () =>
        mounted.current &&
        sameSession() &&
        activeKey.current === key &&
        currentEpoch === epoch.current;
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
        notifySchemaCandidateUpdated(projectId, workspaceId);
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
