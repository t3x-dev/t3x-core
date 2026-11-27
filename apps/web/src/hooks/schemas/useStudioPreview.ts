'use client';
import type { StudioPreview, StudioPreviewInput } from '@t3x-dev/api-client';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useSessionUserId } from '@/hooks/shared/useSession';
import { ApiError } from '@/infrastructure/core';
import { applyStudioSelection, previewStudioSelection } from '@/infrastructure/schemaStudio';

import {
  createStudioPreviewCache,
  invalidateStudioPreviews,
  type StudioPreviewCache,
  StudioPreviewCacheContext,
  studioPreviewKey,
} from './studioPreviewCache';

const PREVIEW_FRESH_MS = 30_000;
const MAX_CACHED_PREVIEWS = 8;
const standaloneReads = createStudioPreviewCache();

type PreviewRead = {
  data?: StudioPreview;
  receivedAt?: number;
  error?: string;
};

function cachedPreview(cache: StudioPreviewCache | null, key: string) {
  const snapshot = cache?.snapshots.get(key);
  return snapshot && snapshot.expiresAt > Date.now() ? snapshot.data : undefined;
}

function readStudioPreview(cache: StudioPreviewCache | null, key: string) {
  const owner = cache ?? standaloneReads;
  const existing = owner.requests.get(key);
  if (existing) return existing;
  const [, projectId, input, revision] = JSON.parse(key) as [
    string | null,
    string,
    StudioPreviewInput,
    number | null,
  ];
  const previous = owner.snapshots.get(key)?.data;
  const request = previewStudioSelection(projectId, input).then(
    (data) => {
      if (owner.requests.get(key) !== request)
        throw new Error('The Schema changed. Reload it before editing.');
      if (
        input.workspaceId &&
        (data.workspace?.id !== input.workspaceId ||
          (revision !== null && data.workspace.revision !== revision))
      ) {
        owner.snapshots.delete(key);
        throw new Error('The Workspace changed. Refresh it before editing the Schema.');
      }
      if (previous && previous.reviewHash !== data.reviewHash) {
        owner.snapshots.delete(key);
        throw new Error('The Schema changed. Reload it before editing.');
      }
      const candidate = input.schemaEditCandidate;
      if (
        candidate &&
        (data.freshness.candidateId !== candidate.candidateId ||
          data.freshness.candidateRevision !== candidate.revision)
      ) {
        owner.snapshots.delete(key);
        throw new Error('The saved Schema draft changed. Reload it before editing.');
      }
      const canReuse =
        candidate ||
        (!input.candidateIds.length && !input.composition && Boolean(data.workspace?.boundSchema));
      if (
        cache &&
        revision !== null &&
        input.workspaceId &&
        !input.schemaDefinition &&
        !input.localContribution &&
        canReuse
      ) {
        if (cache.snapshots.size >= MAX_CACHED_PREVIEWS && !cache.snapshots.has(key)) {
          const oldest = cache.snapshots.keys().next().value;
          if (oldest !== undefined) cache.snapshots.delete(oldest);
        }
        cache.snapshots.set(key, { data, expiresAt: Date.now() + PREVIEW_FRESH_MS });
      }
      return data;
    },
    (error: unknown) => {
      if (owner.requests.get(key) === request) {
        owner.snapshots.delete(key);
        if (
          error instanceof ApiError &&
          ['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND'].includes(error.code)
        )
          invalidateStudioPreviews(owner);
      }
      throw error;
    }
  );
  owner.requests.set(key, request);
  const clear = () => {
    if (owner.requests.get(key) === request) owner.requests.delete(key);
  };
  void request.then(clear, clear);
  return request;
}

export function prefetchBoundStudioPreview(
  cache: StudioPreviewCache,
  userId: string | null,
  projectId: string,
  workspaceId: string,
  revision: number,
  branch: string
) {
  const key = studioPreviewKey(
    userId,
    projectId,
    { candidateIds: [], workspaceId },
    revision,
    branch
  );
  if (!cachedPreview(cache, key)) void readStudioPreview(cache, key).catch(() => {});
}

/** The editor and its early read share the same principal and versioned target. */
export function useStudioPreview(
  projectId: string,
  input: StudioPreviewInput,
  workspaceRevision?: number,
  branch?: string,
  initial?: StudioPreview
) {
  const userId = useSessionUserId();
  const cache = useContext(StudioPreviewCacheContext);
  const key = studioPreviewKey(userId, projectId, input, workspaceRevision, branch);
  const available = Boolean(input.candidateIds.length || input.workspaceId);
  const [result, setResult] = useState<PreviewRead & { key: string }>();
  const current = result?.key === key ? result : undefined;
  const readEpoch = useRef(0);

  const load = useCallback(
    (mode: 'initial' | 'focus' | 'retry') => {
      const epoch = ++readEpoch.current;
      if (!available) return;
      const exactSnapshot =
        mode === 'focus' ? cache?.snapshots.get(key)?.data : cachedPreview(cache, key);
      if (initial && mode !== 'retry') return;
      if (mode === 'initial' && exactSnapshot) {
        setResult({ key, data: exactSnapshot });
        return;
      }
      if (mode === 'retry') {
        cache?.snapshots.delete(key);
        (cache ?? standaloneReads).requests.delete(key);
      }
      if (mode === 'retry' || (mode === 'focus' && !exactSnapshot)) setResult(undefined);
      const request = readStudioPreview(cache, key);
      void request.then(
        (data) => {
          if (epoch !== readEpoch.current) return;
          setResult({ key, data, receivedAt: performance.now() });
        },
        (error: unknown) => {
          if (epoch === readEpoch.current)
            setResult({
              key,
              error: error instanceof Error ? error.message : 'Could not resolve selection',
            });
        }
      );
    },
    [available, cache, initial, key]
  );
  useEffect(() => {
    load('initial');
    const focus = () => load('focus');
    if (available) window.addEventListener('focus', focus);
    return () => {
      ++readEpoch.current;
      window.removeEventListener('focus', focus);
    };
  }, [available, load]);
  const refresh = useCallback(() => load('retry'), [load]);
  const data =
    current?.data ?? (!current?.error ? (initial ?? cachedPreview(cache, key)) : undefined);
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
