import { SchemaRegistry } from '@/components/schemas';
import { getSchemaReleasePreviews } from '@/data/schemaReleases';
import { getWorkspacePreviewCandidates } from '@/data/workspaceCandidates';
import {
  type ProjectWorkspaceSchemaBindings,
  schemaReleaseToWorkspaceBinding,
  type WorkspaceSchemaBindingScope,
} from '@/domain/workspaces/schemaBindings';
import { selectWorkspaceCandidate } from '@/domain/workspaces/selectors';
import type { SchemaRelease } from '@/types/schemas';
import type { WorkspaceSchemaBinding } from '@/types/workspaces';

interface ProjectSchemasTabProps {
  projectId: string;
  selectedWorkspaceId?: string | null;
  schemaBindings?: ProjectWorkspaceSchemaBindings;
  onWorkspaceSchemaBindingChange?: (input: {
    binding: WorkspaceSchemaBinding;
    scope: WorkspaceSchemaBindingScope;
    workspaceId?: string;
  }) => void;
}

export function ProjectSchemasTab({
  onWorkspaceSchemaBindingChange,
  projectId,
  schemaBindings,
  selectedWorkspaceId,
}: ProjectSchemasTabProps) {
  const workspaceCandidates = getWorkspacePreviewCandidates(projectId);
  const selectedWorkspace = selectWorkspaceCandidate(
    workspaceCandidates,
    selectedWorkspaceId ?? null
  );
  const currentWorkspaceBinding = selectedWorkspace
    ? (schemaBindings?.byWorkspaceId[selectedWorkspace.id] ??
      selectedWorkspace.schemaBindings.find((binding) => binding.mode === 'pinned') ??
      selectedWorkspace.schemaBindings[0])
    : null;

  function handleBindRelease(release: SchemaRelease, scope: WorkspaceSchemaBindingScope) {
    const mode = scope === 'project_default' ? 'project_default' : 'pinned';
    onWorkspaceSchemaBindingChange?.({
      binding: schemaReleaseToWorkspaceBinding(release, mode),
      scope,
      workspaceId: selectedWorkspace?.id,
    });
  }

  return (
    <SchemaRegistry
      bindingTargetLabel={selectedWorkspace?.title ?? 'Current workspace'}
      currentWorkspaceBindingLabel={formatSchemaBinding(currentWorkspaceBinding)}
      onBindRelease={handleBindRelease}
      projectDefaultBindingLabel={formatSchemaBinding(schemaBindings?.projectDefault ?? null)}
      releases={getSchemaReleasePreviews(projectId)}
    />
  );
}

function formatSchemaBinding(
  binding: WorkspaceSchemaBinding | null | undefined
): string | undefined {
  if (!binding) return undefined;
  return `${binding.schemaName} ${binding.version}`;
}
