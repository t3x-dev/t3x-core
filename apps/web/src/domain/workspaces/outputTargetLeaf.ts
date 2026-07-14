import type { Constraint, LeafConfig, LeafType } from '@/types/api';
import type { WorkspaceCandidate, WorkspaceOutputTarget } from '@/types/workspaces';

interface OutputTargetLeafInput {
  commit_hash: string;
  config: LeafConfig;
  constraints: Constraint[];
  project_id: string;
  source: { type: 'user' };
  title: string;
  type: LeafType;
}

export function buildOutputTargetLeafInput(
  workspace: WorkspaceCandidate,
  targetId: string
): OutputTargetLeafInput {
  if (!workspace.lastCommitHash) {
    throw new Error('Commit this workspace before creating an output Leaf.');
  }

  const target = workspace.outputTargets.find((candidate) => candidate.id === targetId);
  if (!target) {
    throw new Error('Output target does not belong to this workspace.');
  }

  return {
    commit_hash: workspace.lastCommitHash,
    config: {
      format: target.format,
      output_target_id: target.id,
      source_scope: target.sourceScope,
      user_instruction: target.instruction,
      workspace_id: workspace.id,
    },
    constraints: buildConstraints(target),
    project_id: workspace.projectId,
    source: { type: 'user' },
    title: target.title,
    type: outputTargetToLeafType(target),
  };
}

function buildConstraints(target: WorkspaceOutputTarget): Constraint[] {
  return (target.constraints ?? []).map((value, index) => ({
    id: `constraint_${target.id}_${index + 1}`,
    match_mode: 'semantic',
    type: 'require',
    value,
  }));
}

function outputTargetToLeafType(target: WorkspaceOutputTarget): LeafType {
  return target.leafType === 'api' ? 'deploy_agent' : 'article';
}
