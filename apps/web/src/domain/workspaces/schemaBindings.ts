import type { SchemaReleasePreview } from '@/types/schemas';
import type { WorkspaceCandidate, WorkspaceSchemaBinding } from '@/types/workspaces';

export const PROJECT_DEFAULT_SCHEMA_BINDING_METADATA_KEY = 'default_schema_binding';

export interface ProjectWorkspaceSchemaBindings {
  projectDefault?: WorkspaceSchemaBinding;
  byWorkspaceId: Record<string, WorkspaceSchemaBinding>;
}

export type WorkspaceSchemaBindingScope = 'project_default' | 'current_workspace';

export const EMPTY_PROJECT_WORKSPACE_SCHEMA_BINDINGS: ProjectWorkspaceSchemaBindings = {
  byWorkspaceId: {},
};

export function schemaReleaseToWorkspaceBinding(
  release: SchemaReleasePreview,
  mode: WorkspaceSchemaBinding['mode']
): WorkspaceSchemaBinding {
  if (!isSchemaReleaseBindable(release)) {
    throw new Error(
      `Schema release ${release.canonicalName}@${release.version} is not available for binding.`
    );
  }
  if (!/^sha256:[a-f0-9]{64}$/i.test(release.schemaHash)) {
    throw new Error(
      `Schema release ${release.canonicalName}@${release.version} does not have a complete hash.`
    );
  }

  return {
    canonicalName: release.canonicalName,
    schemaHash: release.schemaHash,
    schemaName: release.name,
    version: release.version,
    mode,
  };
}

export function isSchemaReleaseBindable(release: SchemaReleasePreview): boolean {
  return release.status !== 'draft' && release.runtimeAvailable;
}

export function getProjectDefaultSchemaBinding(
  metadata: Record<string, unknown> | null | undefined
): WorkspaceSchemaBinding | undefined {
  const value = metadata?.[PROJECT_DEFAULT_SCHEMA_BINDING_METADATA_KEY];
  if (!isWorkspaceSchemaBinding(value)) return undefined;
  return { ...value, mode: 'project_default' };
}

export function withProjectDefaultSchemaBinding(
  metadata: Record<string, unknown> | null | undefined,
  binding: WorkspaceSchemaBinding
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    [PROJECT_DEFAULT_SCHEMA_BINDING_METADATA_KEY]: {
      ...binding,
      mode: 'project_default',
    },
  };
}

export function mergeProjectWorkspaceSchemaBindings(
  persisted: ProjectWorkspaceSchemaBindings,
  live: ProjectWorkspaceSchemaBindings | undefined
): ProjectWorkspaceSchemaBindings {
  if (!live) return persisted;
  return {
    projectDefault: live.projectDefault ?? persisted.projectDefault,
    byWorkspaceId: {
      ...persisted.byWorkspaceId,
      ...live.byWorkspaceId,
    },
  };
}

export function workspaceSchemaBindingsEqual(
  left: WorkspaceSchemaBinding | undefined,
  right: WorkspaceSchemaBinding | undefined
): boolean {
  if (!left || !right) return left === right;
  return (
    left.canonicalName === right.canonicalName &&
    left.schemaHash === right.schemaHash &&
    left.compositionId === right.compositionId &&
    left.compositionRevision === right.compositionRevision &&
    left.compositionHash === right.compositionHash &&
    left.schemaName === right.schemaName &&
    left.version === right.version
  );
}

export function rebindWorkspaceCandidate(
  candidate: WorkspaceCandidate,
  binding: WorkspaceSchemaBinding,
  updatedAt = candidate.updatedAt
): WorkspaceCandidate {
  if (workspaceSchemaBindingsEqual(candidate.schemaBindings[0], binding)) return candidate;

  const { commitOverride: _commitOverride, ...workspace } = candidate;
  const schemaLabel = `${binding.schemaName} ${binding.version}`;
  return {
    ...workspace,
    status: 'draft',
    updatedAt,
    schemaBindings: replaceCurrentWorkspaceBinding(candidate.schemaBindings, binding),
    schemaCandidate: {
      summary: `Schema binding changed to ${schemaLabel}. Regenerate the candidate from its sources.`,
      fields: [],
    },
    schemaReview: {
      verdict: 'needs_review',
      summary: `The previous candidate was produced under a different Schema and is now stale.`,
      gaps: [`Regenerate the candidate against ${schemaLabel}.`],
    },
    yopsDraft: {
      ...candidate.yopsDraft,
      operations: [],
    },
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
      return rebindWorkspaceCandidate(candidate, workspaceBinding);
    }

    if (!bindings.projectDefault || candidate.revision !== undefined) return candidate;
    const nextBindings = replaceProjectDefaultBinding(
      candidate.schemaBindings,
      bindings.projectDefault
    );
    const nextBinding = nextBindings[0];
    return nextBinding ? rebindWorkspaceCandidate(candidate, nextBinding) : candidate;
  });
}

function isWorkspaceSchemaBinding(value: unknown): value is WorkspaceSchemaBinding {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.schemaName === 'string' &&
    record.schemaName.trim().length > 0 &&
    typeof record.version === 'string' &&
    record.version.trim().length > 0
  );
}

function replaceCurrentWorkspaceBinding(
  _bindings: WorkspaceSchemaBinding[],
  nextBinding: WorkspaceSchemaBinding
): WorkspaceSchemaBinding[] {
  return [nextBinding];
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
