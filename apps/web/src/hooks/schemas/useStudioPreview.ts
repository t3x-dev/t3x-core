'use client';
import type { StudioPreview, StudioPreviewInput } from '@t3x-dev/api-client';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useSessionUserId } from '@/hooks/shared/useSession';
import { applyStudioSelection, previewStudioSelection } from '@/infrastructure/schemaStudio';

import { StudioPreviewCacheContext } from './studioPreviewCache';

const PREVIEW_FRESH_MS = 30_000;
const MAX_CACHED_PREVIEWS = 8;
const inFlight = new Map<string, { promise: Promise<StudioPreview>; invalidated: boolean }>();

/** Results belong to the exact selection and Workspace revision that requested them. */
export function useStudioPreview(
  projectId: string,
  input: StudioPreviewInput,
  workspaceRevision?: number
) {
  const userId = useSessionUserId();
  const cache = useContext(StudioPreviewCacheContext);
  const key = JSON.stringify([projectId, input, workspaceRevision, userId]);
  const epoch = useRef(0);
  const available = !!(input.candidateIds.length || input.workspaceId);
  const [result, setResult] = useState<{
    key: string;
    data?: StudioPreview;
    receivedAt?: number;
    error?: string;
  }>();
  const [retry, setRetry] = useState(0);
  const refresh = useCallback(() => {
    ++epoch.current;
    const request = inFlight.get(key);
    if (request) request.invalidated = true;
    inFlight.delete(key);
    cache?.delete(key);
    setResult(undefined);
    setRetry((value) => value + 1);
  }, [cache, key]);
  useEffect(() => {
    if (!available) return;
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [available, refresh]);
  useEffect(() => {
    const current = ++epoch.current;
    if (!available) return;
    const snapshot = cache?.get(key);
    if (snapshot && snapshot.expiresAt > Date.now()) {
      setResult({ key, data: snapshot.data });
      return;
    }
    const [target, selection, revision] = JSON.parse(key) as [
      string,
      StudioPreviewInput,
      number | null,
    ];
    let request = inFlight.get(key);
    if (!request) {
      request = { promise: previewStudioSelection(target, selection), invalidated: false };
      inFlight.set(key, request);
      const clear = () => {
        if (inFlight.get(key) === request) inFlight.delete(key);
      };
      void request.promise.then(clear, clear);
    }
    const activeRequest = request;
    void activeRequest.promise.then(
      (data) => {
        if (current !== epoch.current) return;
        const receivedAt = performance.now();
        if (
          data.workspace &&
          selection.workspaceId &&
          (data.workspace.id !== selection.workspaceId ||
            (revision !== null && data.workspace.revision !== revision))
        ) {
          setResult({ key, error: 'The Workspace changed. Refresh it before editing the Schema.' });
          return;
        }
        if (
          cache &&
          !activeRequest.invalidated &&
          revision !== null &&
          selection.candidateIds.length === 0 &&
          !selection.composition &&
          !selection.schemaEditCandidate &&
          !selection.schemaDefinition &&
          !selection.localContribution &&
          data.workspace?.boundSchema &&
          data.workspace.revision === revision
        ) {
          if (cache.size >= MAX_CACHED_PREVIEWS) {
            const oldest = cache.keys().next().value;
            if (oldest !== undefined) cache.delete(oldest);
          }
          cache.set(key, { data, expiresAt: Date.now() + PREVIEW_FRESH_MS });
        }
        setResult({ key, data, receivedAt });
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
  }, [available, cache, key, retry]);
  const cached = cache?.get(key);
  const fromCache = !!cached && cached.expiresAt > Date.now();
  const current = result?.key === key ? result : undefined;
  const data = current?.data ?? (fromCache ? cached.data : undefined);
  return {
    data,
    receivedAt: current?.receivedAt,
    error: current?.error,
    loading: available && !data && !current,
    refresh,
  };
}

export function useApplyStudioSelection(projectId: string) {
  return useCallback(
    (input: Parameters<typeof applyStudioSelection>[1]) => applyStudioSelection(projectId, input),
    [projectId]
  );
}

/** Read-only native sample check; uses the same exact-source resolver as Studio. */
export function useValidateStudioSample(projectId: string) {
  return useCallback(
    (input: StudioPreviewInput) => previewStudioSelection(projectId, input),
    [projectId]
  );
}
