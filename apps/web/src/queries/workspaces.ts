import {
  decideProjectWorkspaceTransition,
  listProjectWorkspaces,
  reviewProjectWorkspaceTransition,
  saveProjectWorkspace,
  type WorkspaceSaveResponse,
  type WorkspaceTransitionContent,
  type WorkspaceTransitionDecisionResponse,
  type WorkspaceTransitionOutcome,
  type WorkspaceTransitionPrecondition,
  type WorkspaceTransitionReviewResponse,
} from '@/infrastructure/workspaces';
import type { WorkspaceCandidate } from '@/types/workspaces';

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
