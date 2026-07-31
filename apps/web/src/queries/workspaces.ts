import {
  decideProjectWorkspaceSourceRevert,
  decideProjectWorkspaceSourceTransition,
  decideProjectWorkspaceTransition,
  listProjectWorkspaces,
  reviewProjectWorkspaceSourceRevert,
  reviewProjectWorkspaceSourceTransition,
  reviewProjectWorkspaceTransition,
  saveProjectWorkspace,
  type WorkspaceSaveResponse,
  type WorkspaceSourceChange,
  type WorkspaceSourceTransitionDecisionResponse,
  type WorkspaceSourceTransitionPrecondition,
  type WorkspaceSourceTransitionReviewResponse,
  type WorkspaceTransitionContent,
  type WorkspaceTransitionDecisionResponse,
  type WorkspaceTransitionOutcome,
  type WorkspaceTransitionPrecondition,
  type WorkspaceTransitionReviewResponse,
} from '@/infrastructure/workspaces';
import type { WorkspaceCandidate, WorkspaceSourceArtifact } from '@/types/workspaces';

export function fetchProjectWorkspaces(projectId: string): Promise<WorkspaceCandidate[]> {
  return listProjectWorkspaces(projectId);
}

export function saveWorkspaceDraft(
  projectId: string,
  workspaceId: string,
  workspace: WorkspaceCandidate
): Promise<WorkspaceSaveResponse> {
  return saveProjectWorkspace(projectId, workspaceId, workspace);
}

export function reviewWorkspaceTransition(
  projectId: string,
  workspaceId: string,
  content: WorkspaceTransitionContent,
  why: string | undefined,
  ifRevision: number
): Promise<WorkspaceTransitionReviewResponse> {
  return reviewProjectWorkspaceTransition(projectId, workspaceId, content, why, ifRevision);
}

export function decideWorkspaceTransition(
  projectId: string,
  workspaceId: string,
  input: {
    content: WorkspaceTransitionContent;
    why?: string;
    outcome: WorkspaceTransitionOutcome;
    decisionReason?: string;
    precondition: WorkspaceTransitionPrecondition;
  }
): Promise<WorkspaceTransitionDecisionResponse> {
  return decideProjectWorkspaceTransition(projectId, workspaceId, input);
}

export function reviewWorkspaceSourceTransition(
  projectId: string,
  workspaceId: string,
  input: {
    artifact: WorkspaceSourceArtifact;
    change: WorkspaceSourceChange;
    why?: string;
    ifRevision: number;
  }
): Promise<WorkspaceSourceTransitionReviewResponse> {
  return reviewProjectWorkspaceSourceTransition(projectId, workspaceId, input);
}

export function decideWorkspaceSourceTransition(
  projectId: string,
  workspaceId: string,
  input: {
    artifact: WorkspaceSourceArtifact;
    change: WorkspaceSourceChange;
    why?: string;
    outcome: WorkspaceTransitionOutcome;
    decisionReason?: string;
    precondition: WorkspaceSourceTransitionPrecondition;
  }
): Promise<WorkspaceSourceTransitionDecisionResponse> {
  return decideProjectWorkspaceSourceTransition(projectId, workspaceId, input);
}

export function reviewWorkspaceSourceRevert(
  projectId: string,
  workspaceId: string,
  input: { commitId: string; why?: string; ifRevision: number }
): Promise<WorkspaceSourceTransitionReviewResponse> {
  return reviewProjectWorkspaceSourceRevert(projectId, workspaceId, input);
}

export function decideWorkspaceSourceRevert(
  projectId: string,
  workspaceId: string,
  input: {
    commitId: string;
    why?: string;
    outcome: WorkspaceTransitionOutcome;
    decisionReason?: string;
    precondition: WorkspaceSourceTransitionPrecondition;
  }
): Promise<WorkspaceSourceTransitionDecisionResponse> {
  return decideProjectWorkspaceSourceRevert(projectId, workspaceId, input);
}

export type {
  WorkspaceSourceChange,
  WorkspaceSourceTransitionPrecondition,
  WorkspaceSourceTransitionReviewResponse,
};
