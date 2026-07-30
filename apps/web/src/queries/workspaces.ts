import {
  commitProjectWorkspace,
  listProjectWorkspaces,
  saveProjectWorkspace,
  type WorkspaceCommitResponse,
  type WorkspaceSaveResponse,
} from '@/infrastructure/workspaces';
import type { WorkspaceCandidate, WorkspaceValidationOverride } from '@/types/workspaces';
import type { WorkspaceYOpsTreeNode } from '@/types/workspaceYops';

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

export function commitWorkspaceDraft(
  projectId: string,
  workspaceId: string,
  content: { trees: WorkspaceYOpsTreeNode[]; relations: unknown[] },
  message?: string,
  validationOverride?: WorkspaceValidationOverride,
  ifRevision?: number
): Promise<WorkspaceCommitResponse> {
  return commitProjectWorkspace(
    projectId,
    workspaceId,
    content,
    message,
    validationOverride,
    ifRevision
  );
}
