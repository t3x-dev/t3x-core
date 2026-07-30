import type { ApiCommit, Leaf } from '@/types/api';
import type { WorkspaceCandidate, WorkspaceOutputTarget } from '@/types/workspaces';

export type ProjectOutputStatus = 'fresh' | 'ready' | 'stale' | 'unknown';

export interface ProjectOutputArtifact {
  boundCommit: ApiCommit | null;
  id: string;
  leaf: Leaf;
  status: ProjectOutputStatus;
  target: WorkspaceOutputTarget | null;
  workspace: WorkspaceCandidate | null;
}

export interface ProjectOutputTargetCandidate {
  id: string;
  target: WorkspaceOutputTarget;
  workspace: WorkspaceCandidate;
}

export interface ProjectLeafCreateCandidate {
  commit: ApiCommit;
  existingLeaves: Leaf[];
  id: string;
  workspaces: WorkspaceCandidate[];
}

export function buildProjectOutputArtifacts(
  leaves: Leaf[],
  workspaces: WorkspaceCandidate[],
  commits: ApiCommit[]
): ProjectOutputArtifact[] {
  const commitByHash = new Map(commits.map((commit) => [commit.hash, commit] as const));
  const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace] as const));

  return leaves
    .map((leaf): ProjectOutputArtifact => {
      const commit = commitByHash.get(leaf.commit_hash);
      const boundCommit = commit?.project_id === leaf.project_id ? commit : null;
      const workspaceId = getLeafConfigString(leaf, 'workspace_id');
      const candidateWorkspace = workspaceId ? workspaceById.get(workspaceId) : undefined;
      const workspace =
        candidateWorkspace?.projectId === leaf.project_id ? candidateWorkspace : null;
      const target = resolveLeafOutputTarget(leaf, workspace);
      const latestCommitHash = workspace?.lastCommitHash ?? null;

      return {
        boundCommit,
        id: leaf.id,
        leaf,
        status: getLeafOutputStatus(leaf, latestCommitHash),
        target,
        workspace,
      };
    })
    .sort((left, right) => {
      const leftTime = artifactTimestamp(left);
      const rightTime = artifactTimestamp(right);
      if (leftTime !== rightTime) return rightTime - leftTime;
      return left.id.localeCompare(right.id);
    });
}

export function buildAvailableOutputTargets(
  artifacts: ProjectOutputArtifact[],
  workspaces: WorkspaceCandidate[]
): ProjectOutputTargetCandidate[] {
  const materializedTargets = new Set(
    artifacts.flatMap((artifact) =>
      artifact.workspace && artifact.target
        ? [`${artifact.workspace.id}:${artifact.target.id}`]
        : []
    )
  );

  return workspaces
    .flatMap((workspace) => {
      if (!workspace.lastCommitHash) return [];
      const targets = Array.isArray(workspace.outputTargets) ? workspace.outputTargets : [];
      return targets
        .filter((target) => !materializedTargets.has(`${workspace.id}:${target.id}`))
        .map((target) => ({
          id: `${workspace.id}:${target.id}`,
          target,
          workspace,
        }));
    })
    .sort((left, right) => {
      const workspaceOrder = left.workspace.title.localeCompare(right.workspace.title);
      if (workspaceOrder !== 0) return workspaceOrder;
      const targetOrder = left.target.title.localeCompare(right.target.title);
      return targetOrder !== 0 ? targetOrder : left.id.localeCompare(right.id);
    });
}

export function buildLeafCreateCandidates(
  leaves: Leaf[],
  workspaces: WorkspaceCandidate[],
  commits: ApiCommit[]
): ProjectLeafCreateCandidate[] {
  const leavesByCommit = new Map<string, Leaf[]>();
  for (const leaf of leaves) {
    const existing = leavesByCommit.get(leaf.commit_hash) ?? [];
    existing.push(leaf);
    leavesByCommit.set(leaf.commit_hash, existing);
  }

  const workspacesByCommit = new Map<string, WorkspaceCandidate[]>();
  for (const workspace of workspaces) {
    if (!workspace.lastCommitHash) continue;
    const existing = workspacesByCommit.get(workspace.lastCommitHash) ?? [];
    existing.push(workspace);
    workspacesByCommit.set(workspace.lastCommitHash, existing);
  }

  return commits
    .map((commit) => ({
      commit,
      existingLeaves: leavesByCommit.get(commit.hash) ?? [],
      id: commit.hash,
      workspaces: workspacesByCommit.get(commit.hash) ?? [],
    }))
    .sort((left, right) => {
      const leftTime = validTimestamp(left.commit.committed_at);
      const rightTime = validTimestamp(right.commit.committed_at);
      if (leftTime !== rightTime) return rightTime - leftTime;
      return left.commit.hash.localeCompare(right.commit.hash);
    });
}

function getLeafConfigString(leaf: Leaf, key: string): string | null {
  const value = leaf.config[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function resolveLeafOutputTarget(
  leaf: Leaf,
  workspace: WorkspaceCandidate | null
): WorkspaceOutputTarget | null {
  if (!workspace) return null;
  const targets = Array.isArray(workspace.outputTargets) ? workspace.outputTargets : [];

  const targetId = getLeafConfigString(leaf, 'output_target_id');
  if (targetId) {
    return targets.find((target) => target.id === targetId) ?? null;
  }

  return targets.length === 1 ? targets[0] : null;
}

function getLeafOutputStatus(leaf: Leaf, latestCommitHash: string | null): ProjectOutputStatus {
  if (!latestCommitHash) return 'unknown';
  if (leaf.commit_hash !== latestCommitHash) return 'stale';
  return leaf.output ? 'fresh' : 'ready';
}

function artifactTimestamp(artifact: ProjectOutputArtifact): number {
  for (const value of [
    artifact.leaf.generated_at,
    artifact.leaf.created_at,
    artifact.workspace?.updatedAt,
  ]) {
    const parsed = validTimestamp(value);
    if (parsed !== Number.NEGATIVE_INFINITY) return parsed;
  }
  return Number.NEGATIVE_INFINITY;
}

function validTimestamp(value: string | null | undefined): number {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}
