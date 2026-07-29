'use client';

import { AlertCircle, FileOutput, Layers3, Plus } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { LeafDetailWorkspace } from '@/app/project/[projectId]/leaf/[leafId]/page';
import { LoadingSpinner } from '@/components/layout/ApiStatus';
import { ProjectLeafManager } from '@/components/project/ProjectLeafManager';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatUserFacingError } from '@/domain/format/errors';
import {
  buildLeafCreateCandidates,
  buildProjectOutputArtifacts,
  type ProjectOutputArtifact,
  type ProjectOutputStatus,
} from '@/domain/outputs/projectOutputs';
import { dispatchLeafChanged } from '@/hooks/leaves/leafEvents';
import { useCreateLeaf } from '@/hooks/leaves/useCreateLeaf';
import { useDeleteLeaf } from '@/hooks/leaves/useDeleteLeaf';
import { useProjectOutputsData } from '@/hooks/leaves/useProjectOutputsData';
import type { ApiCommit, LeafType } from '@/types/api';

interface ProjectOutputsTabProps {
  projectId: string;
}

export function ProjectOutputsTab({ projectId }: ProjectOutputsTabProps) {
  const data = useProjectOutputsData(projectId);
  const { create: createLeaf } = useCreateLeaf();
  const { remove: deleteLeaf } = useDeleteLeaf();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedLeafId = searchParams.get('leaf');
  const [deletedLeafIds, setDeletedLeafIds] = useState<Set<string>>(() => new Set());
  const visibleLeaves = useMemo(
    () => data.leaves.filter((leaf) => !deletedLeafIds.has(leaf.id)),
    [data.leaves, deletedLeafIds]
  );
  const artifacts = useMemo(
    () => buildProjectOutputArtifacts(visibleLeaves, data.workspaces, data.commits),
    [data.commits, data.workspaces, visibleLeaves]
  );
  const createCandidates = useMemo(
    () => buildLeafCreateCandidates(visibleLeaves, data.workspaces, data.commits),
    [data.commits, data.workspaces, visibleLeaves]
  );
  const [selectedLeafId, setSelectedLeafId] = useState<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [creatingTargetId, setCreatingTargetId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deletingLeafId, setDeletingLeafId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const replaceLeafRoute = useCallback(
    (leafId: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (leafId) {
        params.set('leaf', leafId);
      } else {
        params.delete('leaf');
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    },
    [pathname, router, searchParams]
  );

  const navigateToLeaf = useCallback(
    (leafId: string) => {
      setSelectedLeafId(leafId);
      replaceLeafRoute(leafId);
    },
    [replaceLeafRoute]
  );

  const clearSelectedLeaf = useCallback(() => {
    setSelectedLeafId(null);
    replaceLeafRoute(null);
  }, [replaceLeafRoute]);

  useEffect(() => {
    if (artifacts.length === 0) {
      if (!data.loading) setSelectedLeafId(null);
      return;
    }
    setSelectedLeafId((currentLeafId) => {
      if (requestedLeafId && artifacts.some((artifact) => artifact.leaf.id === requestedLeafId)) {
        return requestedLeafId;
      }
      if (currentLeafId && artifacts.some((artifact) => artifact.leaf.id === currentLeafId)) {
        return currentLeafId;
      }
      return artifacts[0].leaf.id;
    });
  }, [artifacts, data.loading, requestedLeafId]);

  const selectedArtifact =
    artifacts.find((artifact) => artifact.leaf.id === selectedLeafId) ??
    (requestedLeafId
      ? artifacts.find((artifact) => artifact.leaf.id === requestedLeafId)
      : undefined) ??
    artifacts[0] ??
    null;
  const activeLeafId = selectedArtifact?.leaf.id ?? null;

  const handleManagerOpenChange = useCallback((open: boolean) => {
    setManagerOpen(open);
    if (open) {
      setCreateError(null);
      setDeleteError(null);
    }
  }, []);

  const handleCreate = useCallback(
    async (commit: ApiCommit, leafType: LeafType, title: string) => {
      setCreatingTargetId(commit.hash);
      setCreateError(null);
      try {
        const leaf = await createLeaf({
          commit_hash: commit.hash,
          config: {},
          constraints: [],
          project_id: commit.project_id,
          source: { type: 'user' },
          title,
          type: leafType,
        });
        dispatchLeafChanged({
          commitHash: leaf.commit_hash,
          leafId: leaf.id,
          projectId,
          reason: 'created',
        });
        await data.refresh();
        navigateToLeaf(leaf.id);
        toast.success(`Created ${leaf.title || 'Leaf'}`);
      } catch (error) {
        const message = formatUserFacingError(error, 'Could not create Leaf.');
        setCreateError(message);
        throw error;
      } finally {
        setCreatingTargetId(null);
      }
    },
    [createLeaf, data.refresh, navigateToLeaf, projectId]
  );

  const handleDelete = useCallback(
    async (artifact: ProjectOutputArtifact) => {
      const { leaf } = artifact;
      setDeletingLeafId(leaf.id);
      setDeleteError(null);
      try {
        await deleteLeaf(leaf.id);
        setDeletedLeafIds((current) => {
          const next = new Set(current);
          next.add(leaf.id);
          return next;
        });

        const remainingArtifacts = artifacts.filter((candidate) => candidate.leaf.id !== leaf.id);
        if (activeLeafId === leaf.id) {
          const nextLeafId = remainingArtifacts[0]?.leaf.id ?? null;
          if (nextLeafId) {
            navigateToLeaf(nextLeafId);
          } else {
            clearSelectedLeaf();
          }
        }

        dispatchLeafChanged({
          commitHash: leaf.commit_hash,
          leafId: leaf.id,
          projectId,
          reason: 'deleted',
        });
        await data.refresh();
        toast.success(`Deleted ${leaf.title || 'Leaf'}`);
      } catch (error) {
        const message = formatUserFacingError(error, 'Could not delete Leaf.');
        setDeleteError(message);
        throw error;
      } finally {
        setDeletingLeafId(null);
      }
    },
    [
      activeLeafId,
      artifacts,
      clearSelectedLeaf,
      data.refresh,
      deleteLeaf,
      navigateToLeaf,
      projectId,
    ]
  );

  const openManager = useCallback(() => setManagerOpen(true), []);
  const embeddedNavigation = useMemo(
    () =>
      selectedArtifact
        ? {
            count: artifacts.length,
            onCreateLeaf: openManager,
            onManageLeaves: openManager,
            status: STATUS_PRESENTATION[selectedArtifact.status],
          }
        : undefined,
    [artifacts.length, openManager, selectedArtifact]
  );

  return (
    <section
      aria-busy={data.loading}
      className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--surface-app)]"
    >
      {data.error ? (
        <div
          className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--status-error)]/30 bg-[var(--status-error-muted)] px-4 py-2"
          role="alert"
        >
          <div className="flex min-w-0 items-center gap-2 text-sm text-[var(--status-error)]">
            <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
            <span>{data.error}</span>
          </div>
          <Button onClick={() => void data.refresh()} size="sm" type="button" variant="outline">
            Retry outputs
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        {data.loading && !selectedArtifact ? (
          <LoadingSpinner className="h-full" message="Loading Leaves..." />
        ) : data.error && artifacts.length === 0 ? null : selectedArtifact ? (
          <div className="flex h-full min-h-0 p-2">
            <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] shadow-sm">
              <LeafDetailWorkspace
                embeddedNavigation={embeddedNavigation}
                key={selectedArtifact.leaf.id}
                leafIdOverride={selectedArtifact.leaf.id}
                projectIdOverride={projectId}
              />
            </div>
          </div>
        ) : (
          <OutputsEmptyState
            availableCount={createCandidates.length}
            onManageLeaves={openManager}
          />
        )}
      </div>

      <ProjectLeafManager
        artifacts={artifacts}
        createCandidates={createCandidates}
        createError={createError}
        creatingTargetId={creatingTargetId}
        deleteError={deleteError}
        deletingLeafId={deletingLeafId}
        onCreate={handleCreate}
        onDelete={handleDelete}
        onOpenChange={handleManagerOpenChange}
        onSelect={navigateToLeaf}
        open={managerOpen}
        selectedLeafId={activeLeafId}
      />
    </section>
  );
}

function OutputsEmptyState({
  availableCount,
  onManageLeaves,
}: {
  availableCount: number;
  onManageLeaves: () => void;
}) {
  return (
    <div className="flex h-full min-h-[420px] p-2">
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] shadow-sm">
        <header className="flex min-h-12 shrink-0 items-center justify-between gap-4 border-b border-[var(--stroke-divider)] px-3 py-2">
          <Button
            aria-label="Manage Leaves, 0 existing"
            className="h-8 gap-1.5 px-2.5 text-xs"
            onClick={onManageLeaves}
            size="sm"
            type="button"
            variant="outline"
          >
            <Layers3 aria-hidden="true" className="size-3.5 text-[var(--accent-commit)]" />
            Leaves
            <Badge className="h-5 min-w-5 justify-center px-1.5" variant="outline">
              0
            </Badge>
          </Button>
          <Button onClick={onManageLeaves} size="sm" type="button" variant="branch">
            <Plus aria-hidden="true" className="size-4" />
            New Leaf
          </Button>
        </header>

        <div className="flex flex-1 items-center justify-center p-6">
          <div className="flex max-w-md flex-col items-center text-center">
            <span className="flex size-10 items-center justify-center rounded-md border border-[var(--accent-commit)]/25 bg-[var(--accent-commit-soft)] text-[var(--accent-commit)]">
              <FileOutput aria-hidden="true" className="size-5" />
            </span>
            <h2 className="mt-3 text-sm font-bold text-[var(--text-primary)]">
              No committed Leaves yet
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
              {availableCount > 0
                ? `${availableCount} committed ${availableCount === 1 ? 'version is' : 'versions are'} ready for Leaf creation.`
                : 'Commit a version first, then create its persistent Leaf here.'}
            </p>
            <Button
              className="mt-4"
              onClick={onManageLeaves}
              size="sm"
              type="button"
              variant="branch"
            >
              <Layers3 aria-hidden="true" className="size-4" />
              Manage Leaves
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

const STATUS_PRESENTATION: Record<
  ProjectOutputStatus,
  { label: string; variant: 'leaf' | 'pending' | 'warning' | 'outline' }
> = {
  fresh: { label: 'Fresh', variant: 'leaf' },
  ready: { label: 'Ready', variant: 'pending' },
  stale: { label: 'Stale', variant: 'warning' },
  unknown: { label: 'Unlinked', variant: 'outline' },
};
