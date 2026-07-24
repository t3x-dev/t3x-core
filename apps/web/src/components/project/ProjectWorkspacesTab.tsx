'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { WorkspaceWorkbench } from '@/components/workspaces/WorkspaceWorkbench';
import { getWorkspacePreviewCandidates } from '@/data/workspaceCandidates';
import { selectWorkspaceForBranch } from '@/domain/workspaces/navigation';
import {
  applyProjectWorkspaceSchemaBindings,
  type ProjectWorkspaceSchemaBindings,
} from '@/domain/workspaces/schemaBindings';
import { useProjectMaterials } from '@/hooks/materials/useProjectMaterials';
import { useBranches } from '@/hooks/shared/useBranches';
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
  const branch = searchParams.get('branch')?.trim() || null;
  const { branchHeads, loading: branchesLoading } = useBranches(projectId, Boolean(branch));
  const branchHead = branch && Object.hasOwn(branchHeads, branch) ? branchHeads[branch] : null;
  const previewCandidates = useMemo(
    () => getWorkspacePreviewCandidates(projectId, projectMaterials.materials),
    [projectId, projectMaterials.materials]
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
  const requestedWorkspaceId = searchParams.get('workspace')?.trim() || null;
  const branchWorkspace = branch
    ? (selectWorkspaceForBranch(projectWorkspaces.workspaces, branch, branchHead) ??
      selectWorkspaceForBranch(previewCandidates, branch, branchHead))
    : null;
  const selectedCandidate = branch
    ? branchWorkspace
      ? (candidates.find((candidate) => candidate.id === branchWorkspace.id) ?? branchWorkspace)
      : null
    : (candidates.find((candidate) => candidate.id === requestedWorkspaceId) ?? null);
  const visibleCandidates = branch ? (selectedCandidate ? [selectedCandidate] : []) : candidates;
  const selectedWorkspaceId = branch ? (selectedCandidate?.id ?? null) : requestedWorkspaceId;
  const navigationError = projectWorkspaces.error;

  const handleWorkspaceSelect = useCallback(
    (workspaceId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', 'workspaces');
      params.set('workspace', workspaceId);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
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
      errorMessage={navigationError ?? undefined}
      projectId={projectId}
      selectedWorkspaceId={selectedWorkspaceId}
      viewState={
        projectWorkspaces.loading || (Boolean(branch) && branchesLoading)
          ? 'loading'
          : navigationError
            ? 'error'
            : 'ready'
      }
      onSelectedWorkspaceChange={branch ? undefined : handleWorkspaceSelect}
      onSourceMaterialUploaded={projectMaterials.refresh}
      onViewCommitInState={handleViewCommitInState}
    />
  );
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
