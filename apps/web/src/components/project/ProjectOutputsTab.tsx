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
  buildAvailableOutputTargets,
  buildProjectOutputArtifacts,
  type ProjectOutputStatus,
} from '@/domain/outputs/projectOutputs';
import { buildOutputTargetLeafInput } from '@/domain/workspaces/outputTargetLeaf';
import { dispatchLeafChanged } from '@/hooks/leaves/leafEvents';
import { useCreateLeaf } from '@/hooks/leaves/useCreateLeaf';
import { useProjectOutputsData } from '@/hooks/leaves/useProjectOutputsData';
import type { WorkspaceCandidate, WorkspaceOutputTarget } from '@/types/workspaces';

interface ProjectOutputsTabProps {
  projectId: string;
}

export function ProjectOutputsTab({ projectId }: ProjectOutputsTabProps) {
  const data = useProjectOutputsData(projectId);
  const { create: createLeaf } = useCreateLeaf();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedLeafId = searchParams.get('leaf');
  const artifacts = useMemo(
    () => buildProjectOutputArtifacts(data.leaves, data.workspaces, data.commits),
    [data.commits, data.leaves, data.workspaces]
  );
  const availableTargets = useMemo(
    () => buildAvailableOutputTargets(artifacts, data.workspaces),
    [artifacts, data.workspaces]
  );
  const [selectedLeafId, setSelectedLeafId] = useState<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [creatingTargetId, setCreatingTargetId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const navigateToLeaf = useCallback(
    (leafId: string) => {
      setSelectedLeafId(leafId);
      const params = new URLSearchParams(searchParams.toString());
      params.set('leaf', leafId);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams]
  );

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
    if (open) setCreateError(null);
  }, []);

  const handleCreate = useCallback(
    async (workspace: WorkspaceCandidate, target: WorkspaceOutputTarget, title: string) => {
      setCreatingTargetId(target.id);
      setCreateError(null);
      try {
        const input = buildOutputTargetLeafInput(workspace, target.id);
        const leaf = await createLeaf({ ...input, title: title || input.title });
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
          <LeafDetailWorkspace
            embeddedNavigation={embeddedNavigation}
            key={selectedArtifact.leaf.id}
            leafIdOverride={selectedArtifact.leaf.id}
            projectIdOverride={projectId}
          />
        ) : (
          <OutputsEmptyState
            availableCount={availableTargets.length}
            onManageLeaves={openManager}
          />
        )}
      </div>

      <ProjectLeafManager
        artifacts={artifacts}
        availableTargets={availableTargets}
        createError={createError}
        creatingTargetId={creatingTargetId}
        onCreate={handleCreate}
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
    <div className="flex h-full min-h-[420px] flex-col">
      <header className="flex min-h-[58px] shrink-0 items-center justify-between gap-4 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-2">
        <Button
          aria-label="Manage Leaves, 0 existing"
          className="h-8 gap-1.5 px-2.5 text-xs"
          onClick={onManageLeaves}
          size="sm"
          type="button"
          variant="outline"
        >
          <Layers3 aria-hidden="true" className="size-3.5 text-[var(--accent-leaf)]" />
          Leaves
          <Badge className="h-5 min-w-5 justify-center px-1.5" variant="outline">
            0
          </Badge>
        </Button>
        <Button onClick={onManageLeaves} size="sm" type="button" variant="leaf">
          <Plus aria-hidden="true" className="size-4" />
          New Leaf
        </Button>
      </header>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="flex max-w-md flex-col items-center text-center">
          <span className="flex size-12 items-center justify-center rounded-lg border border-[var(--accent-leaf)]/25 bg-[var(--accent-leaf-soft)] text-[var(--accent-leaf)]">
            <FileOutput aria-hidden="true" className="size-5" />
          </span>
          <h2 className="mt-4 text-base font-semibold text-[var(--text-primary)]">
            No committed Leaves yet
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
            {availableCount > 0
              ? `${availableCount} committed ${availableCount === 1 ? 'output target is' : 'output targets are'} ready to become a Leaf.`
              : 'Commit a Workspace output target first, then create its persistent Leaf here.'}
          </p>
          <Button className="mt-5" onClick={onManageLeaves} type="button" variant="leaf">
            <Layers3 aria-hidden="true" className="size-4" />
            Manage Leaves
          </Button>
        </div>
      </div>
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
  unknown: { label: 'Unknown', variant: 'outline' },
};
