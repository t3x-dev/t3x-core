import type { SourceBundleItem, WorkspaceCandidate } from '@/types/workspaces';

export function mergeWorkspaceOverride(
  candidate: WorkspaceCandidate,
  override?: WorkspaceCandidate
): WorkspaceCandidate {
  if (!override) return candidate;

  const draft = pickFresherDraft(candidate, override);
  const merged = {
    ...candidate,
    ...override,
    ...draft,
    outputTargets: candidate.outputTargets,
    schemaBindings:
      candidate.schemaBindings.length > 0 ? candidate.schemaBindings : override.schemaBindings,
    sourceBundle: mergeWorkspaceSourceBundles(candidate.sourceBundle, override.sourceBundle),
  };

  if (override.status !== 'committed' && !override.lastCommitHash) {
    delete merged.lastCommitHash;
  }

  return merged;
}

export function mergeWorkspaceSourceBundles(
  candidateSources: SourceBundleItem[],
  overrideSources: SourceBundleItem[]
): SourceBundleItem[] {
  const localSources = overrideSources.filter((source) => !source.materialId);
  const refreshedMaterials = candidateSources.filter((source) => Boolean(source.materialId));
  return [...localSources, ...refreshedMaterials];
}

function pickFresherDraft(candidate: WorkspaceCandidate, override: WorkspaceCandidate) {
  const serverRevision = candidate.revision ?? -1;
  const overrideRevision = override.revision ?? -1;
  if (serverRevision > overrideRevision) {
    return {
      revision: candidate.revision,
      schemaCandidate: candidate.schemaCandidate,
      schemaReview: candidate.schemaReview,
      status: candidate.status,
      updatedAt: candidate.updatedAt,
      yopsDraft: candidate.yopsDraft,
    };
  }
  if (overrideRevision > serverRevision) {
    return {
      revision: override.revision,
      schemaCandidate: override.schemaCandidate,
      schemaReview: override.schemaReview,
      status: override.status,
      updatedAt: override.updatedAt,
      yopsDraft: override.yopsDraft,
    };
  }

  const useOverride =
    override.yopsDraft.operations.length > 0 || candidate.yopsDraft.operations.length === 0;
  return {
    revision: override.revision ?? candidate.revision,
    schemaCandidate: useOverride ? override.schemaCandidate : candidate.schemaCandidate,
    schemaReview: useOverride ? override.schemaReview : candidate.schemaReview,
    status: override.status,
    updatedAt: override.updatedAt ?? candidate.updatedAt,
    yopsDraft: useOverride ? override.yopsDraft : candidate.yopsDraft,
  };
}
