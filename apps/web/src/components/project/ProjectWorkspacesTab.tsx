'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { WorkspaceWorkbench } from '@/components/workspaces/WorkspaceWorkbench';
import { getWorkspacePreviewCandidates } from '@/data/workspaceCandidates';
import {
  buildWorkspaceContextCandidate,
  parseWorkspaceNavigationTarget,
  resolveWorkspaceNavigation,
  type WorkspaceSelectionReason,
} from '@/domain/workspaces/navigation';
import {
  applyProjectWorkspaceSchemaBindings,
  type ProjectWorkspaceSchemaBindings,
} from '@/domain/workspaces/schemaBindings';
import { useProjectMaterials } from '@/hooks/materials/useProjectMaterials';
import { useProjectWorkspaces } from '@/hooks/workspaces/useProjectWorkspaces';
import type { SourceBundleItem, WorkspaceCandidate } from '@/types/workspaces';

interface ProjectWorkspacesTabProps {
  projectId: string;
  schemaBindings?: ProjectWorkspaceSchemaBindings;
}

export function ProjectWorkspacesTab({ projectId, schemaBindings }: ProjectWorkspacesTabProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectMaterials = useProjectMaterials(projectId);
  const projectWorkspaces = useProjectWorkspaces(projectId);
  const currentProjectMaterials = useMemo(
    () => projectMaterials.materials.filter((material) => material.project_id === projectId),
    [projectId, projectMaterials.materials]
  );
  const previewCandidates = useMemo(
    () => getWorkspacePreviewCandidates(projectId, currentProjectMaterials),
    [currentProjectMaterials, projectId]
  );
  const workspaceCandidates = useMemo(
    () => mergePersistedWorkspaceCandidates(previewCandidates, projectWorkspaces.workspaces),
    [previewCandidates, projectWorkspaces.workspaces]
  );
  const candidates = useMemo(
    () =>
      schemaBindings
        ? applyProjectWorkspaceSchemaBindings(workspaceCandidates, schemaBindings)
        : workspaceCandidates,
    [workspaceCandidates, schemaBindings]
  );
  const navigationTarget = useMemo(
    () => parseWorkspaceNavigationTarget(searchParams),
    [searchParams]
  );
  const navigationResolution = useMemo(
    () => resolveWorkspaceNavigation(candidates, navigationTarget),
    [candidates, navigationTarget]
  );
  const navigationCandidate = useMemo(
    () =>
      navigationResolution.status === 'resolved'
        ? buildWorkspaceContextCandidate(navigationResolution.candidate, navigationTarget)
        : navigationResolution.candidate,
    [navigationResolution, navigationTarget]
  );
  const visibleCandidates = useMemo(() => {
    if (
      navigationResolution.status !== 'resolved' ||
      !navigationCandidate ||
      navigationCandidate.id === navigationResolution.candidate.id
    ) {
      return candidates;
    }

    return [
      navigationCandidate,
      ...candidates.filter(
        (candidate) =>
          candidate.id !== navigationResolution.candidate.id &&
          candidate.id !== navigationCandidate.id
      ),
    ];
  }, [candidates, navigationCandidate, navigationResolution]);
  const waitingForExplicitTarget =
    navigationTarget.explicitHandoff && !projectWorkspaces.initialized;

  const handleWorkspaceSelect = useCallback(
    (workspaceId: string) => {
      const candidate = candidates.find((item) => item.id === workspaceId);
      if (!candidate) return;

      const params = new URLSearchParams();
      const targetCommitMatches =
        navigationTarget.commitHash === candidate.lastCommitHash ||
        navigationTarget.commitHash === candidate.baseCommitHash;
      if (navigationTarget.branch === candidate.targetBranch && targetCommitMatches) {
        params.set('branch', navigationTarget.branch);
        params.set('commit', navigationTarget.commitHash!);
      }
      params.set('workspace', workspaceId);
      if (navigationTarget.sourceView) {
        params.set('sourceView', navigationTarget.sourceView);
      }
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [candidates, navigationTarget, router]
  );

  const handleViewCommitInState = useCallback(
    (commitHash: string, branch: string) => {
      const repositoryPath = pathname.endsWith('/workspaces')
        ? pathname.slice(0, -'/workspaces'.length)
        : pathname;
      const params = new URLSearchParams({
        branch,
        commit: commitHash,
        view: 'canvas',
      });
      router.push(`${repositoryPath}?${params.toString()}`);
    },
    [pathname, router]
  );

  return (
    <WorkspaceWorkbench
      candidates={visibleCandidates}
      errorMessage={
        navigationTarget.explicitHandoff ? (projectWorkspaces.error ?? undefined) : undefined
      }
      navigationConversationId={navigationResolution.conversationId ?? undefined}
      projectId={projectId}
      restoreStoredConversation={navigationResolution.restoreStoredConversation}
      selectedWorkspaceId={navigationCandidate?.id ?? null}
      selectionRequiredReason={
        !waitingForExplicitTarget && navigationResolution.status === 'selection_required'
          ? workspaceSelectionMessage(navigationResolution.reason)
          : undefined
      }
      sourceView={navigationResolution.sourceView ?? undefined}
      viewState={
        waitingForExplicitTarget
          ? 'loading'
          : navigationTarget.explicitHandoff && projectWorkspaces.error
            ? 'error'
            : 'ready'
      }
      onSelectedWorkspaceChange={handleWorkspaceSelect}
      onSourceMaterialUploaded={projectMaterials.refresh}
      onViewCommitInState={handleViewCommitInState}
    />
  );
}

function workspaceSelectionMessage(reason: WorkspaceSelectionReason): string {
  switch (reason) {
    case 'ambiguous_workspace':
      return 'More than one workspace matches this branch and commit. Choose the workspace to open.';
    case 'conversation_not_found':
      return 'The requested conversation does not belong to the matched workspace. Choose a workspace to continue without stale chat context.';
    case 'missing_context':
      return 'The workspace link is missing required branch or commit context. Choose the intended workspace.';
    case 'workspace_not_found':
      return 'No workspace matches the requested context. Choose an available workspace instead.';
  }
}

function mergePersistedWorkspaceCandidates(
  previewCandidates: WorkspaceCandidate[],
  persistedCandidates: WorkspaceCandidate[]
): WorkspaceCandidate[] {
  if (persistedCandidates.length === 0) return previewCandidates;

  const persistedById = new Map(
    persistedCandidates.map((candidate) => [candidate.id, candidate] as const)
  );
  const previewIds = new Set(previewCandidates.map((candidate) => candidate.id));
  const mergedCandidates = previewCandidates.map((candidate) => {
    const persisted = persistedById.get(candidate.id);
    return persisted ? mergeWorkspaceCandidate(candidate, persisted) : candidate;
  });
  const extraPersistedCandidates = persistedCandidates.filter(
    (candidate) => !previewIds.has(candidate.id)
  );

  return [...mergedCandidates, ...extraPersistedCandidates];
}

function mergeWorkspaceCandidate(
  previewCandidate: WorkspaceCandidate,
  persistedCandidate: WorkspaceCandidate
): WorkspaceCandidate {
  const persistedOutputTargets = Array.isArray(persistedCandidate.outputTargets)
    ? persistedCandidate.outputTargets
    : [];
  const persistedSchemaBindings = Array.isArray(persistedCandidate.schemaBindings)
    ? persistedCandidate.schemaBindings
    : [];

  return {
    ...previewCandidate,
    ...persistedCandidate,
    outputTargets:
      persistedOutputTargets.length > 0 ? persistedOutputTargets : previewCandidate.outputTargets,
    schemaBindings:
      persistedSchemaBindings.length > 0
        ? persistedSchemaBindings
        : previewCandidate.schemaBindings,
    sourceBundle: mergeSourceBundles(
      previewCandidate.sourceBundle,
      persistedCandidate.sourceBundle
    ),
  };
}

function mergeSourceBundles(
  previewSources: SourceBundleItem[],
  persistedSources: SourceBundleItem[]
): SourceBundleItem[] {
  const mergedById = new Map<string, SourceBundleItem>();

  for (const source of persistedSources) {
    mergedById.set(source.id, source);
  }
  for (const source of previewSources) {
    if (!mergedById.has(source.id)) {
      mergedById.set(source.id, source);
    }
  }

  return Array.from(mergedById.values());
}
