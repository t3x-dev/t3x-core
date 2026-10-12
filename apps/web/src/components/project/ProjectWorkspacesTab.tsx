'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { WorkspaceWorkbench } from '@/components/workspaces/WorkspaceWorkbench';
import {
  getProjectWorkspaceStarterCandidate,
  repairLeakedWorkspacePreviewCandidate,
} from '@/data/workspaceCandidates';
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
  const {
    branchHeads,
    branches,
    loading: branchesLoading,
    refresh: refreshBranches,
  } = useBranches(projectId, true);
  const branchHead = branch && Object.hasOwn(branchHeads, branch) ? branchHeads[branch] : null;
  const starterCandidate = useMemo(
    () =>
      getProjectWorkspaceStarterCandidate(
        projectId,
        projectMaterials.materials,
        branch ?? 'main',
        branchHead
      ),
    [branch, branchHead, projectId, projectMaterials.materials]
  );
  const workspaceCandidates = useMemo(
    () => mergePersistedWorkspaceCandidates(starterCandidate, projectWorkspaces.workspaces),
    [projectWorkspaces.workspaces, starterCandidate]
  );
  const candidates = useMemo(
    () =>
      schemaBindings
        ? applyProjectWorkspaceSchemaBindings(workspaceCandidates, schemaBindings)
        : workspaceCandidates,
    [workspaceCandidates, schemaBindings]
  );
  const requestedWorkspaceId = searchParams.get('workspace')?.trim() || null;
  const branchWorkspace = branch ? selectWorkspaceForBranch(candidates, branch, branchHead) : null;
  const requestedCandidate = candidates.find((candidate) => candidate.id === requestedWorkspaceId);
  const selectedCandidate = requestedWorkspaceId
    ? requestedCandidate && (!branch || requestedCandidate.targetBranch === branch)
      ? requestedCandidate
      : null
    : branchWorkspace;
  const visibleCandidates = branch ? (selectedCandidate ? [selectedCandidate] : []) : candidates;
  const selectedWorkspaceId = branch ? (selectedCandidate?.id ?? null) : requestedWorkspaceId;
  const navigationError =
    projectWorkspaces.error ??
    (requestedWorkspaceId && !requestedCandidate
      ? `Workspace ${requestedWorkspaceId} was not found in this project.`
      : requestedWorkspaceId && branch && requestedCandidate?.targetBranch !== branch
        ? `Workspace ${requestedWorkspaceId} belongs to ${requestedCandidate?.targetBranch}, not ${branch}.`
        : null);

  const handleWorkspaceSelect = useCallback(
    (workspaceId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', 'workspaces');
      params.set('workspace', workspaceId);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const refreshWorkspacesAndBranches = useCallback(async () => {
    await Promise.all([projectWorkspaces.refresh(), refreshBranches()]);
  }, [projectWorkspaces.refresh, refreshBranches]);

  const handleWorkspaceBranchChange = useCallback(
    async (nextBranch: string) => {
      await Promise.all([projectWorkspaces.refresh(), refreshBranches()]);
      const params = new URLSearchParams(searchParams.toString());
      params.set('branch', nextBranch);
      params.delete('workspace');
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [projectWorkspaces.refresh, refreshBranches, router, searchParams]
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
      branchOptions={branches}
      candidates={visibleCandidates}
      errorMessage={navigationError ?? undefined}
      projectId={projectId}
      selectedWorkspaceId={selectedWorkspaceId}
      viewState={
        (projectWorkspaces.loading && projectWorkspaces.workspaces.length === 0) ||
        (Boolean(branch) && branchesLoading && branches.length === 0)
          ? 'loading'
          : navigationError
            ? 'error'
            : 'ready'
      }
      onSelectedWorkspaceChange={branch ? undefined : handleWorkspaceSelect}
      onSourceMaterialUploaded={projectMaterials.refresh}
      onViewCommitInState={handleViewCommitInState}
      onWorkspacesRefresh={refreshWorkspacesAndBranches}
      onWorkspaceBranchChange={handleWorkspaceBranchChange}
    />
  );
}

function mergePersistedWorkspaceCandidates(
  starterCandidate: WorkspaceCandidate,
  persistedCandidates: WorkspaceCandidate[]
): WorkspaceCandidate[] {
  const mergedCandidates = persistedCandidates.map((persistedCandidate) =>
    mergeWorkspaceCandidate(
      starterCandidate,
      repairLeakedWorkspacePreviewCandidate(persistedCandidate, starterCandidate)
    )
  );
  const branchCandidates = mergedCandidates.filter(
    (candidate) => candidate.targetBranch === starterCandidate.targetBranch
  );
  const openWorkspace = branchCandidates.find((candidate) => candidate.status !== 'committed');
  if (openWorkspace) return mergedCandidates;

  const latestCommittedWorkspace = branchCandidates
    .filter((candidate) => candidate.status === 'committed')
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  if (latestCommittedWorkspace && starterCandidate.baseCommitHash) {
    return [
      ...mergedCandidates,
      buildNextWorkspaceAtBranchHead(
        starterCandidate,
        latestCommittedWorkspace,
        starterCandidate.baseCommitHash
      ),
    ];
  }

  return [...mergedCandidates, starterCandidate];
}

/** A committed Workspace keeps its sealed authoring history, so the next round needs its own ID. */
function nextIterationWorkspaceId(branch: string, headCommitHash: string) {
  return `workspace_branch:${encodeURIComponent(branch)}@${headCommitHash
    .replace(/^sha256:/, '')
    .slice(0, 16)}`;
}

function buildNextWorkspaceAtBranchHead(
  starterCandidate: WorkspaceCandidate,
  previousCommittedWorkspace: WorkspaceCandidate,
  headCommitHash: string
): WorkspaceCandidate {
  const id = nextIterationWorkspaceId(starterCandidate.targetBranch, headCommitHash);
  return {
    ...starterCandidate,
    id,
    outputTargets:
      previousCommittedWorkspace.outputTargets.length > 0
        ? previousCommittedWorkspace.outputTargets
        : starterCandidate.outputTargets,
    schemaBindings: Array.isArray(previousCommittedWorkspace.schemaBindings)
      ? previousCommittedWorkspace.schemaBindings
      : starterCandidate.schemaBindings,
    sourceBundle: mergeSourceBundles(
      starterCandidate.sourceBundle,
      previousCommittedWorkspace.sourceBundle.filter((source) => source.type !== 'chat')
    ),
    yopsDraft: {
      id: `draft:${id}`,
      operations: [],
    },
  };
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
    : previewCandidate.schemaBindings;

  return {
    ...previewCandidate,
    ...persistedCandidate,
    outputTargets:
      persistedOutputTargets.length > 0 ? persistedOutputTargets : previewCandidate.outputTargets,
    schemaBindings: persistedSchemaBindings,
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
