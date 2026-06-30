import { WorkspaceWorkbench } from '@/components/workspaces/WorkspaceWorkbench';
import { getWorkspacePreviewCandidates } from '@/data/workspaceCandidates';

export function ProjectWorkspacesTab({ projectId }: { projectId: string }) {
  const candidates = getWorkspacePreviewCandidates(projectId);

  return <WorkspaceWorkbench candidates={candidates} projectId={projectId} />;
}
