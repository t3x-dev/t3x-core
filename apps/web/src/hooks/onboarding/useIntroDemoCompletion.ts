import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { deleteProject } from '@/commands/projects';
import { fetchProject } from '@/queries/project';
import { useChatStore } from '@/store/chatStore';
import { useProjectStore } from '@/store/projectStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { isDemoWorkspaceProject } from './useEnsureDemoProject';

export function useIntroDemoCompletion(projectId?: string | null) {
  const router = useRouter();
  const [completing, setCompleting] = useState(false);

  const completeIntroDemo = useCallback(async () => {
    const targetProjectId = projectId?.trim();
    setCompleting(true);

    try {
      if (targetProjectId) {
        const project = await fetchProject(targetProjectId).catch(() => null);
        if (project && isDemoWorkspaceProject(project)) {
          await deleteProject(targetProjectId);
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
        }
      }
    } finally {
      router.push('/chat');
      setCompleting(false);
    }
  }, [projectId, router]);

  return { completeIntroDemo, completing };
}
