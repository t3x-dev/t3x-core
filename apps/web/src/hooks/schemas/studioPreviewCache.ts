import type { StudioPreview, StudioPreviewInput } from '@t3x-dev/api-client';
import { createContext } from 'react';

type PreviewSnapshot = { data: StudioPreview; expiresAt: number };
type PreviewRequest = Promise<StudioPreview>;

export function createStudioPreviewCache() {
  return {
    snapshots: new Map<string, PreviewSnapshot>(),
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
  for (const entries of [cache.snapshots, cache.requests]) {
    for (const key of entries.keys()) {
      const [, , input] = JSON.parse(key) as [unknown, unknown, StudioPreviewInput];
      if (!workspaceId || input.workspaceId === workspaceId) entries.delete(key);
    }
  }
}
