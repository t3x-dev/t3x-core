'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { WorkspaceWorkbench } from '@/components/workspaces/WorkspaceWorkbench';
import { getWorkspacePreviewCandidates } from '@/data/workspaceCandidates';
import {
  applyProjectWorkspaceSchemaBindings,
  type ProjectWorkspaceSchemaBindings,
} from '@/domain/workspaces/schemaBindings';
import { useProjectMaterials } from '@/hooks/materials/useProjectMaterials';
import { useProjectWorkspaces } from '@/hooks/workspaces/useProjectWorkspaces';
import type { WorkspaceCandidate } from '@/types/workspaces';

interface ProjectWorkspacesTabProps {
  projectId: string;
  schemaBindings?: ProjectWorkspaceSchemaBindings;
}

export function ProjectWorkspacesTab({ projectId, schemaBindings }: ProjectWorkspacesTabProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectMaterials = useProjectMaterials(projectId);
  const projectWorkspaces = useProjectWorkspaces(projectId);
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
  const selectedWorkspaceId = searchParams.get('workspace');

  const handleWorkspaceSelect = useCallback(
    (workspaceId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', 'workspaces');
      params.set('workspace', workspaceId);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  return (
    <WorkspaceWorkbench
      candidates={candidates}
      projectId={projectId}
      selectedWorkspaceId={selectedWorkspaceId}
      onSelectedWorkspaceChange={handleWorkspaceSelect}
      onSourceMaterialUploaded={projectMaterials.refresh}
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
  };
}
