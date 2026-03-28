import { useCallback, useState } from 'react';
import { createProject } from '@/lib/api/projects';
import { useChatStore } from '@/store/chatStore';

export function useAutoProject() {
  const [isCreating, setIsCreating] = useState(false);
  const activeProjectId = useChatStore((s) => s.activeProjectId);

  const ensureProject = useCallback(
    async (topicHint?: string): Promise<string> => {
      // If project already exists, return it
      if (activeProjectId) return activeProjectId;

      setIsCreating(true);
      try {
        const name = topicHint?.slice(0, 60) || `Project ${new Date().toLocaleDateString()}`;
        const project = await createProject(name);
        const store = useChatStore.getState();
        store.setActiveConversation(store.activeConversationId, project.project_id);
        store.refreshSidebar();
        return project.project_id;
      } finally {
        setIsCreating(false);
      }
    },
    [activeProjectId]
  );

  return { ensureProject, isCreating };
}
