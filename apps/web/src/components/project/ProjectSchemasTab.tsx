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
import { mergePublishedSchemaVersions } from '@/domain/schemas/publishedSchemaVersions';
import {
  getProjectDefaultSchemaBinding,
  type ProjectWorkspaceSchemaBindings,
  rebindWorkspaceCandidate,
  schemaReleaseToWorkspaceBinding,
  workspaceSchemaBindingsEqual,
} from '@/domain/workspaces/schemaBindings';
import { useProjectSchemaDefault } from '@/hooks/projects/useProjectSchemaDefault';
import { useProjectYSchemaVersions } from '@/hooks/schemas/useProjectYSchemaVersions';
import { useYSchemaIdentityManagement } from '@/hooks/schemas/useYSchemaIdentityManagement';
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

interface WorkspaceBindingResult {
  regenerationError?: string;
}

export function ProjectSchemasTab({
  projectId,
  projectMetadata,
  schemaBindings,
}: ProjectSchemasTabProps) {
  const searchParams = useSearchParams();
  const publishedVersions = useProjectYSchemaVersions(projectId);
  const identityManagement = useYSchemaIdentityManagement(projectId, publishedVersions.refresh);
  const registry = useMemo(
    () =>
      mergePublishedSchemaVersions(
        getSchemaRegistryPreview(projectId),
        publishedVersions.versions,
        projectId
      ),
    [projectId, publishedVersions.versions]
  );
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

  const applyReleaseToWorkspace = useCallback(
    async (release: SchemaReleasePreview): Promise<WorkspaceBindingResult> => {
      if (!workspaceTarget) return {};
      const binding = schemaReleaseToWorkspaceBinding(release, 'pinned');
      const staleWorkspace = rebindWorkspaceCandidate(
        workspaceTarget,
        binding,
        new Date().toISOString()
      );
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
        return {};
      } catch (error) {
        return {
          regenerationError: formatUserFacingError(error, 'Unknown error'),
        };
      } finally {
        await projectWorkspaces.refresh();
      }
    },
    [bindSchema, extractCandidate, projectId, projectWorkspaces.refresh, saveDraft, workspaceTarget]
  );

  const handleSetProjectDefault = useCallback(
    async (release: SchemaReleasePreview) => {
      const binding = schemaReleaseToWorkspaceBinding(release, 'project_default');
      setPending('project_default');
      setFeedback(undefined);

      try {
        if (!workspaceSchemaBindingsEqual(defaultBinding, binding)) {
          await setProjectDefault(projectId, projectMetadata, binding);
        }
      } catch (error) {
        setFeedback({
          message: formatUserFacingError(error, 'Failed to update the project Schema default.'),
          tone: 'error',
        });
        setPending(null);
        return;
      }

      if (!workspaceTarget || workspaceSchemaBindingsEqual(workspaceBinding, binding)) {
        setFeedback({
          message: `${release.name} ${release.version} will be used by new Workspaces.`,
          tone: 'success',
        });
        setPending(null);
        return;
      }

      try {
        const result = await applyReleaseToWorkspace(release);
        setFeedback(
          result.regenerationError
            ? {
                message: `${release.name} ${release.version} is now the project default and was saved to ${workspaceTarget.title}, but candidate regeneration failed: ${result.regenerationError}`,
                tone: 'warning',
              }
            : {
                message: `${release.name} ${release.version} is now the project default and ${workspaceTarget.title} was regenerated with it.`,
                tone: 'success',
              }
        );
      } catch (error) {
        setFeedback({
          message: `${release.name} ${release.version} is now the project default, but updating ${workspaceTarget.title} failed: ${formatUserFacingError(error, 'Unknown error')}`,
          tone: 'warning',
        });
      }

      setPending(null);
    },
    [
      applyReleaseToWorkspace,
      defaultBinding,
      projectId,
      projectMetadata,
      setProjectDefault,
      workspaceBinding,
      workspaceTarget,
    ]
  );

  const handleApplyToWorkspace = useCallback(
    async (release: SchemaReleasePreview) => {
      if (!workspaceTarget) return;
      setPending('workspace');
      setFeedback(undefined);

      try {
        const result = await applyReleaseToWorkspace(release);
        setFeedback(
          result.regenerationError
            ? {
                message: `${release.name} ${release.version} was saved, but candidate regeneration failed: ${result.regenerationError}`,
                tone: 'warning',
              }
            : {
                message: `${workspaceTarget.title} now uses ${release.name} ${release.version}; its candidate was regenerated.`,
                tone: 'success',
              }
        );
      } catch (error) {
        setFeedback({
          message: formatUserFacingError(error, 'Failed to bind the Schema to this Workspace.'),
          tone: 'error',
        });
      } finally {
        setPending(null);
      }
    },
    [applyReleaseToWorkspace, workspaceTarget]
  );

  return (
    <SchemaRegistry
      key={projectId}
      {...registry}
      onArchiveIdentity={(family) => identityManagement.setLifecycle(family, 'archive')}
      onRestoreIdentity={(family) => identityManagement.setLifecycle(family, 'restore')}
      onUpdateIdentity={identityManagement.updateIdentity}
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
              onPublished: async () => {
                await publishedVersions.refresh();
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
