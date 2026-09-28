import type { SchemaReleasePreview } from '@/types/schemas';
import type { WorkspaceCandidate, WorkspaceSchemaBinding } from '@/types/workspaces';

export interface ProjectWorkspaceSchemaBindings {
  byWorkspaceId: Record<string, WorkspaceSchemaBinding>;
}

export const EMPTY_PROJECT_WORKSPACE_SCHEMA_BINDINGS: ProjectWorkspaceSchemaBindings = {
  byWorkspaceId: {},
};

export const DEFAULT_WORKSPACE_SCHEMA_BINDING: WorkspaceSchemaBinding = {
  canonicalName: 't3x/prd',
  schemaName: 'PRD Schema',
  version: 'v2',
  mode: 'pinned',
};

export const DEFAULT_WORKSPACE_SCHEMA_CHOICE_ID = 'default';

export function isDefaultWorkspaceSchemaBinding(
  binding: WorkspaceSchemaBinding | undefined
): boolean {
  return (
    binding?.canonicalName === DEFAULT_WORKSPACE_SCHEMA_BINDING.canonicalName &&
    binding.version === DEFAULT_WORKSPACE_SCHEMA_BINDING.version
  );
}

export function workspaceSchemaChoiceId(binding: WorkspaceSchemaBinding): string {
  if (isDefaultWorkspaceSchemaBinding(binding)) return DEFAULT_WORKSPACE_SCHEMA_CHOICE_ID;
  return `${binding.canonicalName ?? binding.schemaName}@${binding.version}`;
}

export function listWorkspaceSchemaChoices(
  releases: readonly SchemaReleasePreview[],
  current?: WorkspaceSchemaBinding
): Array<{ binding: WorkspaceSchemaBinding; id: string; label: string }> {
  const choices = [
    {
      id: DEFAULT_WORKSPACE_SCHEMA_CHOICE_ID,
      label: 'Default · PRD Schema v2',
      binding: DEFAULT_WORKSPACE_SCHEMA_BINDING,
    },
  ];
  const seen = new Set([DEFAULT_WORKSPACE_SCHEMA_CHOICE_ID]);
  for (const release of releases) {
    if (!isSchemaReleaseBindable(release) || !/^sha256:[a-f0-9]{64}$/i.test(release.schemaHash)) {
      continue;
    }
    if (release.canonicalName === 't3x/prd' && release.version === 'v2') continue;
    const binding = schemaReleaseToWorkspaceBinding(release, 'pinned');
    const id = workspaceSchemaChoiceId(binding);
    if (seen.has(id)) continue;
    seen.add(id);
    choices.push({
      id,
      label: `${binding.schemaName} ${binding.version}`,
      binding,
    });
  }
  if (current && !seen.has(workspaceSchemaChoiceId(current))) {
    choices.push({
      id: workspaceSchemaChoiceId(current),
      label: `${current.schemaName} ${current.version}`,
      binding: current,
    });
  }
  return choices;
}

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
