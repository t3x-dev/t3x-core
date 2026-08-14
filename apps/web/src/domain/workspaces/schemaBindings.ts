import type { SchemaReleasePreview } from '@/types/schemas';
import type { WorkspaceCandidate, WorkspaceSchemaBinding } from '@/types/workspaces';

export interface ProjectWorkspaceSchemaBindings {
  byWorkspaceId: Record<string, WorkspaceSchemaBinding>;
}

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

export function mergeProjectWorkspaceSchemaBindings(
  persisted: ProjectWorkspaceSchemaBindings,
  live: ProjectWorkspaceSchemaBindings | undefined
): ProjectWorkspaceSchemaBindings {
  if (!live) return persisted;
  return {
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
  if (Object.keys(bindings.byWorkspaceId).length === 0) {
    return candidates;
  }

  return candidates.map((candidate) => {
    const workspaceBinding = bindings.byWorkspaceId[candidate.id];
    if (workspaceBinding) {
      return rebindWorkspaceCandidate(candidate, workspaceBinding);
    }

    return candidate;
  });
}

function replaceCurrentWorkspaceBinding(
  _bindings: WorkspaceSchemaBinding[],
  nextBinding: WorkspaceSchemaBinding
): WorkspaceSchemaBinding[] {
  return [nextBinding];
}
