import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { deleteProject } from '@/commands/projects';
import { fetchProject } from '@/queries/project';
import { fetchProjects } from '@/queries/projects';
import { useChatStore } from '@/store/chatStore';
import { useProjectStore } from '@/store/projectStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { notifyIntroDemoProjectDeleted } from './introDemoEvents';
import { isDemoWorkspaceProject } from './useEnsureDemoProject';

export function useIntroDemoCompletion(projectId?: string | null) {
  const router = useRouter();
  const [completing, setCompleting] = useState(false);

  const removeProjectLocally = useCallback((targetProjectId: string) => {
    notifyIntroDemoProjectDeleted(targetProjectId);
    useProjectStore.getState().removeProject(targetProjectId);

    const chatStore = useChatStore.getState();
    if (chatStore.activeProjectId === targetProjectId) {
      chatStore.setActiveConversation(null, null);
    }

    const workspaceStore = useWorkspaceStore.getState();
    if (workspaceStore.activeProjectId === targetProjectId) {
      workspaceStore.setActiveProject(null);
    }
    workspaceStore.reset();
  }, []);

  const completeIntroDemo = useCallback(async () => {
    let targetProjectId = projectId?.trim() || null;
    setCompleting(true);

    try {
      if (!targetProjectId) {
        const projects = await Promise.resolve(fetchProjects(50, 0))
          .then((data) => data?.projects ?? [])
          .catch(() => []);
        targetProjectId = projects.find(isDemoWorkspaceProject)?.project_id ?? null;
      }

      if (targetProjectId) {
        const project = await fetchProject(targetProjectId).catch(() => null);
        if (project && isDemoWorkspaceProject(project)) {
          removeProjectLocally(targetProjectId);
          await deleteProject(targetProjectId).catch((err) => {
            const message = err instanceof Error ? err.message.toLowerCase() : String(err);
            if (message.includes('404') || message.includes('not found')) return;
            throw err;
          });
        }
      }
    } finally {
      router.push('/chat');
      setCompleting(false);
    }
  }, [projectId, removeProjectLocally, router]);

  return { completeIntroDemo, completing };
}
