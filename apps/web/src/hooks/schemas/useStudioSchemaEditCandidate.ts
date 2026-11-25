'use client';

import type {
  SaveStudioSchemaEditCandidateInput,
  StudioSchemaEditCandidateRead,
} from '@t3x-dev/api-client';
import { canonicalJson } from '@t3x-dev/yops';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useSessionReadEpoch } from '@/hooks/shared/useSession';
import { ApiError } from '@/infrastructure/core';
import {
  readStudioSchemaEditCandidate,
  saveStudioSchemaEditCandidate,
} from '@/infrastructure/schemaStudio';
import { getSessionReadEpoch, getSessionUser } from '@/infrastructure/session';
import { notifySchemaCandidateUpdated } from '@/utils/schemaCandidateEvents';
import { invalidateStudioPreviews, StudioPreviewCacheContext } from './studioPreviewCache';

const DRAFT_PREVIEW_TTL = 30_000;
const MAX_DRAFT_PREVIEWS = 8;

function draftCacheKey(scope: string, readEpoch: number) {
  return JSON.stringify([scope, readEpoch]);
}

export function useStudioSchemaEditCandidate(
  projectId: string,
  workspaceId: string,
  workspaceRevision?: number,
  confirmedEmpty = false,
  previewBranch?: string
) {
  const sessionId = useRef(getSessionUser()?.id ?? null);
  const sameSession = () => (getSessionUser()?.id ?? null) === sessionId.current;
  const readEpoch = useSessionReadEpoch();
  const key = JSON.stringify([
    sessionId.current,
    projectId,
    workspaceId,
    workspaceRevision,
    previewBranch,
  ]);
  const cache = useContext(StudioPreviewCacheContext);
  const previewRevision = previewBranch ? workspaceRevision : undefined;
  const snapshot =
    previewRevision !== undefined ? cache?.drafts.get(draftCacheKey(key, readEpoch)) : undefined;
  const reusable =
    !confirmedEmpty && snapshot && snapshot.expiresAt > Date.now() ? snapshot.data : undefined;
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
    candidate: StudioSchemaEditCandidateRead | null;
    readEpoch?: number;
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
    const startedReadEpoch = getSessionReadEpoch();
    const cacheKey = draftCacheKey(key, startedReadEpoch);
    const isCurrent = () =>
      mounted.current &&
      activeKey.current === key &&
      current === epoch.current &&
      sameSession() &&
      token === readRequest.current;
    try {
      let request = previewRevision === undefined ? undefined : cache?.draftRequests.get(cacheKey);
      if (!request) {
        request =
          previewRevision === undefined
            ? readStudioSchemaEditCandidate(projectId, workspaceId)
            : readStudioSchemaEditCandidate(projectId, workspaceId, previewRevision);
        if (cache && previewRevision !== undefined) {
          cache.draftRequests.set(cacheKey, request);
          const clear = () => {
            if (cache.draftRequests.get(cacheKey) === request) cache.draftRequests.delete(cacheKey);
          };
          void request.then(clear, clear);
        }
      }
      const candidate = await request;
      if (!isCurrent()) return;
      if (previewRevision !== undefined && startedReadEpoch !== getSessionReadEpoch())
        throw new Error('Session access changed. Reload the Schema before editing.');
      const draft = candidate?.draftPreview?.saved;
      if (
        candidate &&
        draft &&
        (draft.workspace?.id !== workspaceId ||
          draft.workspace.revision !== previewRevision ||
          draft.freshness.candidateId !== candidate.candidateId ||
          draft.freshness.candidateRevision !== candidate.revision)
      )
        throw new Error('The saved Schema draft changed. Reload it before editing.');
      if (cache && previewRevision !== undefined) {
        if (candidate && draft) {
          if (cache.drafts.size >= MAX_DRAFT_PREVIEWS && !cache.drafts.has(cacheKey)) {
            const oldest = cache.drafts.keys().next().value;
            if (oldest !== undefined) cache.drafts.delete(oldest);
          }
          cache.drafts.set(cacheKey, {
            data: candidate,
            expiresAt: Date.now() + DRAFT_PREVIEW_TTL,
          });
        } else cache.drafts.delete(cacheKey);
      }
      setResult({
        key,
        candidate,
        readEpoch: previewRevision === undefined ? undefined : startedReadEpoch,
      });
    } catch (error) {
      if (isCurrent()) {
        cache?.drafts.delete(cacheKey);
        if (
          cache &&
          error instanceof ApiError &&
          ['UNAUTHORIZED', 'FORBIDDEN'].includes(error.code)
        )
          invalidateStudioPreviews(cache);
        setResult({
          key,
          candidate: null,
          error: error instanceof Error ? error.message : 'Schema edit candidate unavailable',
        });
      }
    }
  }, [cache, key, previewRevision, projectId, workspaceId]);

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
  const accessChanged = current?.readEpoch !== undefined && current.readEpoch !== readEpoch;
  return {
    candidate: accessChanged ? null : current ? current.candidate : (reusable ?? null),
    error: accessChanged
      ? 'Session access changed. Reload the Schema before editing.'
      : current?.error,
    loading: Boolean(projectId && workspaceId) && !confirmedEmpty && !current && !reusable,
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
