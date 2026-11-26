'use client';

import type { RepositorySchemaStartup } from '@t3x-dev/api-client';
import { useParams } from 'next/navigation';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { resolveStudioWorkspaceId } from '@/domain/workspaces/studioTargets';
import type { useRepositoryAddress } from '@/hooks/projects/useRepositoryAddress';
import {
  createStudioPreviewCache,
  invalidateStudioPreviews,
  prefetchStudioDraft,
  StudioPreviewCacheContext,
} from '@/hooks/schemas/studioPreviewCache';
import { prefetchBoundStudioPreview } from '@/hooks/schemas/useStudioPreview';
import { type UseBranchesResult, useBranches } from '@/hooks/shared/useBranches';
import { useSessionUserId } from '@/hooks/shared/useSession';
import {
  type UseProjectWorkspacesResult,
  useProjectWorkspaces,
} from '@/hooks/workspaces/useProjectWorkspaces';
import {
  WorkspaceActivityCacheContext,
  type WorkspaceActivitySnapshot,
} from '@/hooks/workspaces/workspaceActivityCache';
import type { DirectoryStateEntry } from '@/store/projectStore';
import type { WorkspaceCandidate } from '@/types/workspaces';

export const RepositoryAddressContext = createContext<
  ReturnType<typeof useRepositoryAddress> & { directoryStateEntry?: DirectoryStateEntry }
>({
  current: null,
  retry: () => {},
});

export function useRepositoryRouteParams() {
  const {
    owner,
    repository: name,
    repoPath,
  } = useParams<{
    owner: string;
    repository: string;
    repoPath?: string[];
  }>();
  const segments = repoPath ?? [];
  return {
    owner,
    name,
    segments,
    creating: segments.length === 0 && name.toLowerCase() === 'new',
    organizationSettings:
      segments.length === 0 &&
      owner.toLowerCase() === 't3x-dev' &&
      name.toLowerCase() === 'settings',
  };
}

const RepositoryViewDataContext = createContext<{
  projectId: string;
  branches: UseBranchesResult;
  workspaces: UseProjectWorkspacesResult;
  initialSchema?: RepositorySchemaStartup;
  loadSchemaInventory?: () => void;
  prefetchSchema: (branch?: string | null, workspaceId?: string | null) => void;
} | null>(null);

export function RepositoryViewData({
  active,
  children,
  projectId,
  schemaBranch,
  schemaWorkspaceId,
  initialSchema,
}: {
  active: boolean;
  children: ReactNode;
  projectId: string | null;
  schemaBranch?: string;
  schemaWorkspaceId?: string;
  initialSchema?: RepositorySchemaStartup;
}) {
  const userId = useSessionUserId();
  const [retainedProjectId, setRetainedProjectId] = useState<string | null>(null);
  const enabled = Boolean(projectId && (active || retainedProjectId === projectId));
  useEffect(() => {
    if (active || retainedProjectId !== projectId) setRetainedProjectId(active ? projectId : null);
  }, [active, projectId, retainedProjectId]);
  const activityCache = useMemo<{ current: WorkspaceActivitySnapshot | null }>(
    () => ({ current: null }),
    [projectId]
  );
  const studioPreviewCache = useMemo(
    () => (projectId ? createStudioPreviewCache() : null),
    [projectId]
  );
  const initialTarget = initialSchema?.workspace as WorkspaceCandidate | null | undefined;
  const initialWorkspaces = useMemo(
    () => (initialTarget ? [initialTarget] : undefined),
    [initialTarget]
  );
  const branches = useBranches(
    projectId,
    enabled,
    initialTarget ? (initialSchema?.branch ?? undefined) : undefined
  );
  const workspaces = useProjectWorkspaces(projectId, enabled, initialWorkspaces);
  const loadSchemaInventory = initialTarget
    ? () => {
        if (!branches.hasFullList && !branches.loading) void branches.refresh();
        if (workspaces.workspaces === initialWorkspaces && !workspaces.loading)
          void workspaces.refresh();
      }
    : undefined;
  const prefetchSchema = useCallback(
    (branch?: string | null, workspaceId?: string | null) => {
      if (!studioPreviewCache || !projectId || workspaces.error || !(branch || workspaceId)) return;
      if (
        initialTarget &&
        (branch === initialTarget.targetBranch || workspaceId === initialTarget.id)
      )
        return;
      const targetId = resolveStudioWorkspaceId(workspaces.workspaces, workspaceId ?? '', branch);
      const target = workspaces.workspaces.find(({ id }) => id === targetId);
      if (
        !target ||
        (branch && target.targetBranch !== branch) ||
        target.status === 'committed' ||
        target.revision === undefined ||
        target.schemaActivity?.hasPendingTask !== false
      )
        return;
      if (target.schemaActivity.hasEditCandidate) {
        void prefetchStudioDraft(
          studioPreviewCache,
          userId,
          projectId,
          target.id,
          target.revision,
          target.targetBranch
        );
      } else if (target.schemaActivity.hasEditCandidate === false && target.schemaBindings.length) {
        prefetchBoundStudioPreview(
          studioPreviewCache,
          userId,
          projectId,
          target.id,
          target.revision,
          target.targetBranch
        );
      }
    },
    [projectId, studioPreviewCache, initialTarget, userId, workspaces.error, workspaces.workspaces]
  );
  useEffect(() => {
    prefetchSchema(schemaBranch, schemaWorkspaceId);
  }, [prefetchSchema, schemaBranch, schemaWorkspaceId]);
  useEffect(() => {
    if (!studioPreviewCache) return;
    const invalidateCandidate = ({
      projectId: changedProject,
      workspaceId,
    }: {
      projectId: string;
      workspaceId: string;
    }) => {
      if (changedProject === projectId) invalidateStudioPreviews(studioPreviewCache, workspaceId);
    };
    const updated = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail) invalidateCandidate(detail);
    };
    const storage = (event: StorageEvent) => {
      if (event.key !== 't3x-schema-candidate-updated' || !event.newValue) return;
      try {
        invalidateCandidate(JSON.parse(event.newValue));
      } catch {
        // Ignore malformed cross-tab notifications.
      }
    };
    window.addEventListener('t3x-schema-candidate-updated', updated);
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener('t3x-schema-candidate-updated', updated);
      window.removeEventListener('storage', storage);
      invalidateStudioPreviews(studioPreviewCache);
    };
  }, [projectId, studioPreviewCache]);
  return (
    <RepositoryViewDataContext.Provider
      value={
        enabled && projectId
          ? { projectId, branches, workspaces, initialSchema, loadSchemaInventory, prefetchSchema }
          : null
      }
    >
      <WorkspaceActivityCacheContext.Provider value={enabled ? activityCache : null}>
        <StudioPreviewCacheContext.Provider value={enabled ? studioPreviewCache : null}>
          {children}
        </StudioPreviewCacheContext.Provider>
      </WorkspaceActivityCacheContext.Provider>
    </RepositoryViewDataContext.Provider>
  );
}

export function useRepositoryBranches(projectId: string | null, enabled: boolean) {
  const context = useContext(RepositoryViewDataContext);
  const shared = context?.projectId === projectId ? context : null;
  const branches = useBranches(projectId, enabled && !shared);
  return shared?.branches ?? branches;
}

export function useRepositoryViewData(projectId: string) {
  const context = useContext(RepositoryViewDataContext);
  const shared = context?.projectId === projectId ? context : null;
  const branches = useRepositoryBranches(projectId, true);
  const workspaces = useProjectWorkspaces(projectId, !shared);
  return { ...shared, branches, workspaces: shared?.workspaces ?? workspaces };
}

export function usePrefetchRepositorySchema() {
  return useContext(RepositoryViewDataContext)?.prefetchSchema;
}
