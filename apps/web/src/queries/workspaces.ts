import {
  listProjectWorkspaces,
  saveProjectWorkspace,
  type WorkspaceSaveResponse,
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
