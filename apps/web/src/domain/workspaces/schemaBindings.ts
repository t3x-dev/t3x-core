import type { SchemaRelease } from '@/types/schemas';
import type { WorkspaceCandidate, WorkspaceSchemaBinding } from '@/types/workspaces';

export interface ProjectWorkspaceSchemaBindings {
  projectDefault?: WorkspaceSchemaBinding;
  byWorkspaceId: Record<string, WorkspaceSchemaBinding>;
}

export type WorkspaceSchemaBindingScope = 'project_default' | 'current_workspace';

export const EMPTY_PROJECT_WORKSPACE_SCHEMA_BINDINGS: ProjectWorkspaceSchemaBindings = {
  byWorkspaceId: {},
};

export function schemaReleaseToWorkspaceBinding(
  release: SchemaRelease,
  mode: WorkspaceSchemaBinding['mode']
): WorkspaceSchemaBinding {
  return {
    schemaName: release.name,
    version: release.version,
    mode,
  };
}

export function applyProjectWorkspaceSchemaBindings(
  candidates: WorkspaceCandidate[],
  bindings: ProjectWorkspaceSchemaBindings
): WorkspaceCandidate[] {
  if (!bindings.projectDefault && Object.keys(bindings.byWorkspaceId).length === 0) {
    return candidates;
  }

  return candidates.map((candidate) => {
    const workspaceBinding = bindings.byWorkspaceId[candidate.id];
    if (workspaceBinding) {
      return {
        ...candidate,
        schemaBindings: replaceCurrentWorkspaceBinding(candidate.schemaBindings, workspaceBinding),
      };
    }

    if (!bindings.projectDefault) return candidate;
    return {
      ...candidate,
      schemaBindings: replaceProjectDefaultBinding(
        candidate.schemaBindings,
        bindings.projectDefault
      ),
    };
  });
}

function replaceCurrentWorkspaceBinding(
  bindings: WorkspaceSchemaBinding[],
  nextBinding: WorkspaceSchemaBinding
): WorkspaceSchemaBinding[] {
  return [
    nextBinding,
    ...bindings.filter(
      (binding) => binding.mode !== 'pinned' && binding.mode !== 'project_default'
    ),
  ];
}

function replaceProjectDefaultBinding(
  bindings: WorkspaceSchemaBinding[],
  nextBinding: WorkspaceSchemaBinding
): WorkspaceSchemaBinding[] {
  if (bindings.some((binding) => binding.mode === 'pinned' || binding.mode === 'draft_override')) {
    return bindings;
  }

  return [nextBinding, ...bindings.filter((binding) => binding.mode !== 'project_default')];
}
