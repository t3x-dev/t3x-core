'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import {
  type SchemaBindingActionKind,
  type SchemaBindingFeedbackTone,
  SchemaRegistry,
} from '@/components/schemas';
import { SchemaCatalogExperience } from '@/components/schemas/SchemaCatalogExperience';
import { formatUserFacingError } from '@/domain/format/errors';
import { mergePublishedSchemaVersions } from '@/domain/schemas/publishedSchemaVersions';
import {
  type ProjectWorkspaceSchemaBindings,
  rebindWorkspaceCandidate,
  schemaReleaseToWorkspaceBinding,
} from '@/domain/workspaces/schemaBindings';
import { useProjectYSchemaVersions } from '@/hooks/schemas/useProjectYSchemaVersions';
import { useYSchemaIdentityManagement } from '@/hooks/schemas/useYSchemaIdentityManagement';
import { useProjectWorkspaces } from '@/hooks/workspaces/useProjectWorkspaces';
import { useWorkspaceFlow } from '@/hooks/workspaces/useWorkspaceFlow';
import { useProjectWorkspaceSchemaBindingsStore } from '@/store/projectWorkspaceSchemaBindingsStore';
import type { SchemaReleasePreview } from '@/types/schemas';
import type { WorkspaceCandidate } from '@/types/workspaces';

interface ProjectSchemasTabProps {
  projectId: string;
  schemaBindings?: ProjectWorkspaceSchemaBindings;
}

interface BindingFeedback {
  message: string;
  tone: SchemaBindingFeedbackTone;
}

interface WorkspaceBindingResult {
  regenerationError?: string;
}

export function ProjectSchemasTab(props: ProjectSchemasTabProps) {
  return (
    <SchemaCatalogExperience key={props.projectId} projectId={props.projectId}>
      <ProjectSchemaStudio {...props} />
    </SchemaCatalogExperience>
  );
}
function ProjectSchemaStudio({ projectId, schemaBindings }: ProjectSchemasTabProps) {
  const searchParams = useSearchParams();
  const publishedVersions = useProjectYSchemaVersions(projectId);
  const identityManagement = useYSchemaIdentityManagement(projectId, publishedVersions.refresh);
  const registry = useMemo(
    () =>
      mergePublishedSchemaVersions(
        { defaultFamilyId: '', families: [] },
        publishedVersions.versions,
        projectId
      ),
    [projectId, publishedVersions.versions]
  );
  const projectWorkspaces = useProjectWorkspaces(projectId);
  const { extractCandidate, saveDraft } = useWorkspaceFlow();
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
        workspaceId: workspaceTarget.id,
      });

      try {
        const extracted = await extractCandidate(saved.workspace);
        const extractedBinding = extracted.workspace.schemaBindings[0] ?? binding;
        bindSchema({
          binding: extractedBinding,
          projectId,
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
    <>
      {!projectWorkspaces.loading &&
      (requestedWorkspaceId || requestedBranch) &&
      !workspaceTarget ? (
        <p className="p-4 text-sm text-[var(--status-error)]" role="alert">
          {requestedWorkspaceId
            ? `Workspace ${requestedWorkspaceId} was not found on this branch in this project.`
            : `No Workspace was found on branch ${requestedBranch}.`}{' '}
          No Schema binding will be changed.
        </p>
      ) : null}
      {publishedVersions.pending ? <output>Loading published schema versions…</output> : null}
      {publishedVersions.error ? <p role="alert">{publishedVersions.error}</p> : null}
      {!publishedVersions.pending && !publishedVersions.error && registry.families.length === 0 ? (
        <p className="p-4 text-sm text-[var(--text-secondary)]">
          No project schema versions are published yet. Built-in artifacts are available in Compose.
        </p>
      ) : null}
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
              }
            : undefined
        }
        bindingActions={{
          feedback,
          onApplyToWorkspace: handleApplyToWorkspace,
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
    </>
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
  if (requestedWorkspaceId?.trim()) {
    return explicitWorkspace &&
      (!requestedBranch || explicitWorkspace.targetBranch === requestedBranch)
      ? explicitWorkspace
      : undefined;
  }

  const branch = requestedBranch?.trim() || 'main';
  return (
    workspaces.find(
      (workspace) => workspace.targetBranch === branch && workspace.status !== 'committed'
    ) ?? workspaces.find((workspace) => workspace.targetBranch === branch)
  );
}
