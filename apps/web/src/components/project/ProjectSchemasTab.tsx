'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import {
  type SchemaBindingActionKind,
  type SchemaBindingFeedbackTone,
  SchemaRegistry,
} from '@/components/schemas';
import { getSchemaRegistryPreview } from '@/data/schemaReleases';
import { formatUserFacingError } from '@/domain/format/errors';
import {
  getProjectDefaultSchemaBinding,
  type ProjectWorkspaceSchemaBindings,
  rebindWorkspaceCandidate,
  schemaReleaseToWorkspaceBinding,
} from '@/domain/workspaces/schemaBindings';
import { useProjectSchemaDefault } from '@/hooks/projects/useProjectSchemaDefault';
import { useProjectWorkspaces } from '@/hooks/workspaces/useProjectWorkspaces';
import { useWorkspaceFlow } from '@/hooks/workspaces/useWorkspaceFlow';
import { useProjectWorkspaceSchemaBindingsStore } from '@/store/projectWorkspaceSchemaBindingsStore';
import type { SchemaReleasePreview } from '@/types/schemas';
import type { WorkspaceCandidate } from '@/types/workspaces';

interface ProjectSchemasTabProps {
  projectId: string;
  projectMetadata?: Record<string, unknown>;
  schemaBindings?: ProjectWorkspaceSchemaBindings;
}

interface BindingFeedback {
  message: string;
  tone: SchemaBindingFeedbackTone;
}

export function ProjectSchemasTab({
  projectId,
  projectMetadata,
  schemaBindings,
}: ProjectSchemasTabProps) {
  const searchParams = useSearchParams();
  const registry = useMemo(() => getSchemaRegistryPreview(projectId), [projectId]);
  const projectWorkspaces = useProjectWorkspaces(projectId);
  const { extractCandidate, saveDraft } = useWorkspaceFlow();
  const setProjectDefault = useProjectSchemaDefault();
  const bindSchema = useProjectWorkspaceSchemaBindingsStore((state) => state.bindSchema);
  const [pending, setPending] = useState<SchemaBindingActionKind | null>(null);
  const [feedback, setFeedback] = useState<BindingFeedback>();
  const requestedWorkspaceId = searchParams?.get('workspace') ?? null;
  const requestedBranch = searchParams?.get('branch') ?? null;
  const workspaceTarget = useMemo(
    () =>
      resolveWorkspaceTarget(projectWorkspaces.workspaces, requestedWorkspaceId, requestedBranch),
    [projectWorkspaces.workspaces, requestedBranch, requestedWorkspaceId]
  );
  const defaultBinding =
    schemaBindings?.projectDefault ?? getProjectDefaultSchemaBinding(projectMetadata);
  const workspaceBinding = workspaceTarget
    ? (schemaBindings?.byWorkspaceId[workspaceTarget.id] ?? workspaceTarget.schemaBindings[0])
    : undefined;

  const handleSetProjectDefault = useCallback(
    async (release: SchemaReleasePreview) => {
      const binding = schemaReleaseToWorkspaceBinding(release, 'project_default');
      setPending('project_default');
      setFeedback(undefined);

      try {
        await setProjectDefault(projectId, projectMetadata, binding);
        setFeedback({
          message: `${release.name} ${release.version} will be used by new Workspaces.`,
          tone: 'success',
        });
      } catch (error) {
        setFeedback({
          message: formatUserFacingError(error, 'Failed to update the project Schema default.'),
          tone: 'error',
        });
      } finally {
        setPending(null);
      }
    },
    [projectId, projectMetadata, setProjectDefault]
  );

  const handleApplyToWorkspace = useCallback(
    async (release: SchemaReleasePreview) => {
      if (!workspaceTarget) return;
      const mode = release.status === 'draft' ? 'draft_override' : 'pinned';
      const binding = schemaReleaseToWorkspaceBinding(release, mode);
      const staleWorkspace = rebindWorkspaceCandidate(
        workspaceTarget,
        binding,
        new Date().toISOString()
      );
      setPending('workspace');
      setFeedback(undefined);

      try {
        const saved = await saveDraft(staleWorkspace);
        bindSchema({
          binding,
          projectId,
          scope: 'current_workspace',
          workspaceId: workspaceTarget.id,
        });

        try {
          const extracted = await extractCandidate(saved.workspace);
          const extractedBinding = extracted.workspace.schemaBindings[0] ?? binding;
          bindSchema({
            binding: extractedBinding,
            projectId,
            scope: 'current_workspace',
            workspaceId: workspaceTarget.id,
          });
          setFeedback({
            message: `${workspaceTarget.title} now uses ${release.name} ${release.version}; its candidate was regenerated.`,
            tone: 'success',
          });
        } catch (error) {
          setFeedback({
            message: `${release.name} ${release.version} was saved, but candidate regeneration failed: ${formatUserFacingError(error, 'Unknown error')}`,
            tone: 'warning',
          });
        }

        await projectWorkspaces.refresh();
      } catch (error) {
        setFeedback({
          message: formatUserFacingError(error, 'Failed to bind the Schema to this Workspace.'),
          tone: 'error',
        });
      } finally {
        setPending(null);
      }
    },
    [bindSchema, extractCandidate, projectId, projectWorkspaces.refresh, saveDraft, workspaceTarget]
  );

  return (
    <SchemaRegistry
      key={projectId}
      {...registry}
      compositionWorkspace={
        workspaceTarget?.revision
          ? {
              projectId,
              workspaceId: workspaceTarget.id,
              workspaceTitle: workspaceTarget.title,
              workspaceRevision: workspaceTarget.revision,
              composition: workspaceTarget.schemaComposition,
              appliedCompositionRevision: workspaceBinding?.compositionRevision,
              appliedSchemaHash: workspaceBinding?.schemaHash,
              onSaved: async () => {
                await projectWorkspaces.refresh();
              },
              onApplied: async (result) => {
                if (result.binding) {
                  bindSchema({
                    binding: result.binding,
                    projectId,
                    scope: 'current_workspace',
                    workspaceId: workspaceTarget.id,
                  });
                }
                await projectWorkspaces.refresh();
              },
            }
          : undefined
      }
      bindingActions={{
        defaultBinding,
        feedback,
        onApplyToWorkspace: handleApplyToWorkspace,
        onSetProjectDefault: handleSetProjectDefault,
        pending,
        workspaceTarget: workspaceTarget
          ? {
              binding: workspaceBinding,
              id: workspaceTarget.id,
              title: workspaceTarget.title,
            }
          : undefined,
      }}
    />
  );
}

function resolveWorkspaceTarget(
  workspaces: WorkspaceCandidate[],
  requestedWorkspaceId: string | null,
  requestedBranch: string | null
): WorkspaceCandidate | undefined {
  const explicitWorkspace = workspaces.find(
    (workspace) => workspace.id === requestedWorkspaceId?.trim()
  );
  if (explicitWorkspace) return explicitWorkspace;

  const branch = requestedBranch?.trim() || 'main';
  return (
    workspaces.find(
      (workspace) => workspace.targetBranch === branch && workspace.status !== 'committed'
    ) ??
    workspaces.find((workspace) => workspace.targetBranch === branch) ??
    workspaces.find((workspace) => workspace.status !== 'committed') ??
    workspaces[0]
  );
}
