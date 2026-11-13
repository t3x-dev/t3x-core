'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { WorkspaceChecksRedirect } from '@/components/checks/WorkspaceChecksRedirect';
import { WorkspaceSnapshotReview } from '@/components/workspaces/WorkspaceSnapshotReview';
import { WorkspaceWorkbench } from '@/components/workspaces/WorkspaceWorkbench';
import {
  getProjectWorkspaceStarterCandidate,
  repairLeakedWorkspacePreviewCandidate,
} from '@/data/workspaceCandidates';
import { repositoryObjectHref } from '@/domain/project/objectLocation';
import { getCanonicalRepositoryPath, workspaceLocation } from '@/domain/project/repoPath';
import { selectWorkspaceForBranch } from '@/domain/workspaces/navigation';
import { useProjectMaterials } from '@/hooks/materials/useProjectMaterials';
import { useRepositoryObjectAddressResolver } from '@/hooks/projects/useRepositoryObjectAddress';
import { useBranches } from '@/hooks/shared/useBranches';
import { useSession } from '@/hooks/shared/useSession';
import { useProjectWorkspaces } from '@/hooks/workspaces/useProjectWorkspaces';
import type { SourceBundleItem, WorkspaceCandidate } from '@/types/workspaces';
import { BranchLoadError } from './BranchLoadError';

interface ProjectWorkspacesTabProps {
  projectId: string;
  workspaceBranch?: string | null;
  fixedReview?: { workspaceId: string; snapshotId: string; number: string };
}

export function ProjectWorkspacesTab({
  projectId,
  workspaceBranch,
  fixedReview,
}: ProjectWorkspacesTabProps) {
  const params = useSearchParams();
  if (!fixedReview && params.get('reviewPane') === 'checks')
    return <WorkspaceChecksRedirect projectId={projectId} />;
  const snapshotId = fixedReview?.snapshotId ?? params.get('reviewSnapshot');
  const workspaceId = fixedReview?.workspaceId ?? params.get('workspace');
  if (snapshotId) {
    if (!workspaceId)
      return (
        <p role="alert" className="p-6 text-sm">
          A Workspace ID is required to open this review snapshot.
        </p>
      );
    return (
      <WorkspaceSnapshotReview
        key={`${projectId}:${workspaceId}:${snapshotId}`}
        projectId={projectId}
        workspaceId={workspaceId}
        snapshotId={snapshotId}
        reviewNumber={fixedReview?.number}
      />
    );
  }
  return <ProjectWorkspacesContent projectId={projectId} workspaceBranch={workspaceBranch} />;
}

function ProjectWorkspacesContent({ projectId, workspaceBranch }: ProjectWorkspacesTabProps) {
  const resolveObjectAddress = useRepositoryObjectAddressResolver();
  const pathname = usePathname();
  const repositoryPath = getCanonicalRepositoryPath(pathname);
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeQuery = searchParams.toString();
  const navigationScope = useMemo(
    () => ({ active: true, request: 0 }),
    [projectId, pathname, routeQuery]
  );
  const activeNavigation = useRef(navigationScope);
  activeNavigation.current = navigationScope;
  useEffect(() => {
    navigationScope.active = true;
    return () => {
      navigationScope.active = false;
      ++navigationScope.request;
    };
  }, [navigationScope]);
  const captureNavigation = useCallback(() => {
    const request = ++navigationScope.request;
    return () =>
      navigationScope.active &&
      activeNavigation.current === navigationScope &&
      navigationScope.request === request;
  }, [navigationScope]);
  const projectMaterials = useProjectMaterials(projectId);
  const projectWorkspaces = useProjectWorkspaces(projectId);
  const { getUser } = useSession();
  const sessionUserId = getUser()?.id ?? null;
  const branch = workspaceBranch ?? (searchParams.get('branch')?.trim() || null);
  const {
    branchHeads,
    branches,
    loading: branchesLoading,
    error: branchesError,
    refresh: refreshBranches,
    create: createBranch,
  } = useBranches(projectId, true);
  const branchHead = branch && Object.hasOwn(branchHeads, branch) ? branchHeads[branch] : null;
  const starterCandidate = useMemo(
    () =>
      getProjectWorkspaceStarterCandidate(
        projectId,
        projectMaterials.materials,
        branch ?? 'main',
        branchHead,
        sessionUserId
      ),
    [branch, branchHead, projectId, projectMaterials.materials, sessionUserId]
  );
  const candidates = useMemo(
    () => mergePersistedWorkspaceCandidates(starterCandidate, projectWorkspaces.workspaces),
    [projectWorkspaces.workspaces, starterCandidate]
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
  const missingBranch =
    workspaceBranch && !branchesLoading && !branchesError && !branches.includes(workspaceBranch);
  const navigationError =
    projectWorkspaces.error ??
    (missingBranch
      ? `Branch ${workspaceBranch} was not found in this project.`
      : requestedWorkspaceId && !requestedCandidate
        ? `Workspace ${requestedWorkspaceId} was not found in this project.`
        : requestedWorkspaceId && branch && requestedCandidate?.targetBranch !== branch
          ? `Workspace ${requestedWorkspaceId} belongs to ${requestedCandidate?.targetBranch}, not ${branch}.`
          : null);

  const handleWorkspaceSelect = useCallback(
    (workspaceId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('workspace', workspaceId);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const handleWorkspaceBranchChange = useCallback(
    async (nextBranch: string, requestNavigation?: (navigate: () => void) => void) => {
      const isCurrent = captureNavigation();
      if (!isCurrent()) return;
      const [, branchesReady] = await Promise.all([projectWorkspaces.refresh(), refreshBranches()]);
      if (!isCurrent() || branchesReady === false) return;
      const params = new URLSearchParams(routeQuery);
      params.set('branch', nextBranch);
      params.delete('workspace');
      const href = repositoryPath
        ? workspaceLocation(repositoryPath, nextBranch, params)
        : `?${params}`;
      const navigate = () => {
        if (isCurrent()) router.replace(href, { scroll: false });
      };
      if (requestNavigation) requestNavigation(navigate);
      else navigate();
    },
    [
      captureNavigation,
      projectWorkspaces.refresh,
      refreshBranches,
      repositoryPath,
      router,
      routeQuery,
    ]
  );

  const handleCreateWorkspaceBranch = useCallback(
    async (
      name: string,
      fromBranch: string,
      requestNavigation?: (navigate: () => void) => void
    ) => {
      const isCurrent = captureNavigation();
      if (!isCurrent()) return;
      await createBranch(name, fromBranch);
      if (!isCurrent()) return;
      await handleWorkspaceBranchChange(name, requestNavigation);
    },
    [captureNavigation, createBranch, handleWorkspaceBranchChange]
  );

  const handleViewCommitInState = useCallback(
    async (commitHash: string, branch: string) => {
      const isCurrent = captureNavigation();
      const params = new URLSearchParams({
        branch,
        commit: commitHash,
        view: 'canvas',
      });
      const address =
        repositoryPath && /^sha256:[0-9a-f]{64}$/.test(commitHash)
          ? await resolveObjectAddress(projectId, 'commit', commitHash).catch(() => null)
          : null;
      if (!isCurrent()) return;
      router.push(
        repositoryPath && address
          ? repositoryObjectHref(repositoryPath, 'commits', address.number, params)
          : `${repositoryPath ?? pathname}?${params}`
      );
    },
    [captureNavigation, pathname, projectId, repositoryPath, resolveObjectAddress, router]
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <BranchLoadError error={branchesError} loading={branchesLoading} onRetry={refreshBranches} />
      {!(branchesError && !branches.length && !projectWorkspaces.workspaces.length) && (
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
          onWorkspacesRefresh={projectWorkspaces.refresh}
          onWorkspaceBranchChange={handleWorkspaceBranchChange}
          onCreateWorkspaceBranch={handleCreateWorkspaceBranch}
        />
      )}
    </div>
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

  const currentCommittedWorkspace = branchCandidates.find(
    (candidate) =>
      candidate.status === 'committed' &&
      candidate.lastCommitHash === starterCandidate.baseCommitHash
  );
  if (currentCommittedWorkspace) return mergedCandidates;

  const previousCommittedWorkspace = branchCandidates.find(
    (candidate) => candidate.status === 'committed'
  );
  if (previousCommittedWorkspace && starterCandidate.baseCommitHash) {
    const nextWorkspace = buildNextWorkspaceAtBranchHead(
      starterCandidate,
      previousCommittedWorkspace
    );
    return mergedCandidates.map((candidate) =>
      candidate.id === previousCommittedWorkspace.id ? nextWorkspace : candidate
    );
  }

  return [...mergedCandidates, starterCandidate];
}

function buildNextWorkspaceAtBranchHead(
  starterCandidate: WorkspaceCandidate,
  previousCommittedWorkspace: WorkspaceCandidate
): WorkspaceCandidate {
  return {
    ...starterCandidate,
    id: previousCommittedWorkspace.id,
    ...(previousCommittedWorkspace.revision === undefined
      ? {}
      : { revision: previousCommittedWorkspace.revision }),
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
      id: previousCommittedWorkspace.yopsDraft.id,
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
