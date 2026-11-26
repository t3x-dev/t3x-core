import type {
  StudioPreview,
  StudioPreviewInput,
  StudioSchemaEditCandidateRead,
} from '@t3x-dev/api-client';
import { createContext } from 'react';
import { ApiError } from '@/infrastructure/core';
import { readStudioSchemaEditCandidate } from '@/infrastructure/schemaStudio';
import { getSessionReadEpoch } from '@/infrastructure/session';

type PreviewSnapshot = { data: StudioPreview; expiresAt: number };
type PreviewRequest = Promise<StudioPreview>;
type DraftSnapshot = {
  data: StudioSchemaEditCandidateRead;
  expiresAt: number;
  fromNavigation: boolean;
};

const DRAFT_PREVIEW_TTL = 30_000;
const MAX_DRAFT_PREVIEWS = 8;

export function createStudioPreviewCache() {
  return {
    snapshots: new Map<string, PreviewSnapshot>(),
    drafts: new Map<string, DraftSnapshot>(),
    draftRequests: new Map<string, Promise<StudioSchemaEditCandidateRead | null>>(),
    requests: new Map<string, PreviewRequest>(),
  };
}

export type StudioPreviewCache = ReturnType<typeof createStudioPreviewCache>;
export const StudioPreviewCacheContext = createContext<StudioPreviewCache | null>(null);

export function studioPreviewKey(
  userId: string | null,
  projectId: string,
  input: StudioPreviewInput,
  revision?: number,
  branch?: string
) {
  return JSON.stringify([userId, projectId, input, revision, branch]);
}

export function invalidateStudioPreviews(cache: StudioPreviewCache, workspaceId?: string) {
  for (const entries of [cache.drafts, cache.draftRequests]) {
    for (const key of entries.keys()) {
      const [, , cachedWorkspace] = JSON.parse(key) as DraftScope;
      if (!workspaceId || cachedWorkspace === workspaceId) entries.delete(key);
    }
  }
  for (const entries of [cache.snapshots, cache.requests]) {
    for (const key of entries.keys()) {
      const [, , input] = JSON.parse(key) as [unknown, unknown, StudioPreviewInput];
      if (!workspaceId || input.workspaceId === workspaceId) entries.delete(key);
    }
  }
}

type DraftScope = [
  userId: string | null,
  projectId: string,
  workspaceId: string,
  revision: number,
  branch: string,
  readEpoch: number,
];

export function studioDraftKey(
  userId: string | null,
  projectId: string,
  workspaceId: string,
  revision: number,
  branch: string,
  readEpoch: number
) {
  return JSON.stringify([userId, projectId, workspaceId, revision, branch, readEpoch]);
}

export function cachedStudioDraft(cache: StudioPreviewCache | null, key: string) {
  const snapshot = cache?.drafts.get(key);
  return snapshot && snapshot.expiresAt > Date.now() ? snapshot : undefined;
}

export function readStudioDraft(
  cache: StudioPreviewCache | null,
  key: string,
  fromNavigation = false
) {
  const existing = cache?.draftRequests.get(key);
  const cached = cachedStudioDraft(cache, key);
  if (fromNavigation && cached) return Promise.resolve(cached.data);
  if (existing) return existing;
  if (cached?.fromNavigation) {
    cached.fromNavigation = false;
    return Promise.resolve(cached.data);
  }

  const [, projectId, workspaceId, revision, , readEpoch] = JSON.parse(key) as DraftScope;
  const request = readStudioSchemaEditCandidate(projectId, workspaceId, revision)
    .then((candidate) => {
      if (readEpoch !== getSessionReadEpoch())
        throw new Error('Session access changed. Reload the Schema before editing.');
      if (cache && cache.draftRequests.get(key) !== request)
        throw new Error('The saved Schema draft changed. Reload it before editing.');

      const draft = candidate?.draftPreview?.saved;
      if (
        candidate &&
        draft &&
        (draft.workspace?.id !== workspaceId ||
          draft.workspace.revision !== revision ||
          draft.freshness.candidateId !== candidate.candidateId ||
          draft.freshness.candidateRevision !== candidate.revision)
      )
        throw new Error('The saved Schema draft changed. Reload it before editing.');

      if (cache && candidate && draft) {
        if (cache.drafts.size >= MAX_DRAFT_PREVIEWS && !cache.drafts.has(key)) {
          const oldest = cache.drafts.keys().next().value;
          if (oldest !== undefined) cache.drafts.delete(oldest);
        }
        cache.drafts.set(key, {
          data: candidate,
          expiresAt: Date.now() + DRAFT_PREVIEW_TTL,
          fromNavigation,
        });
      } else cache?.drafts.delete(key);
      return candidate;
    })
    .catch((error: unknown) => {
      if (cache?.draftRequests.get(key) === request) {
        cache.drafts.delete(key);
        if (error instanceof ApiError && ['UNAUTHORIZED', 'FORBIDDEN'].includes(error.code))
          invalidateStudioPreviews(cache);
      }
      throw error;
    })
    .finally(() => {
      if (cache?.draftRequests.get(key) === request) cache.draftRequests.delete(key);
    });
  cache?.draftRequests.set(key, request);
  return request;
}

export function prefetchStudioDraft(
  cache: StudioPreviewCache,
  userId: string | null,
  projectId: string,
  workspaceId: string,
  revision: number,
  branch: string
) {
  const key = studioDraftKey(
    userId,
    projectId,
    workspaceId,
    revision,
    branch,
    getSessionReadEpoch()
  );
  return readStudioDraft(cache, key, true).catch(() => null);
}
