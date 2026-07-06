import { listProjectWorkspaces } from '@/infrastructure/workspaces';
import type { WorkspaceCandidate } from '@/types/workspaces';

export function fetchProjectWorkspaces(projectId: string): Promise<WorkspaceCandidate[]> {
  return listProjectWorkspaces(projectId);
}
