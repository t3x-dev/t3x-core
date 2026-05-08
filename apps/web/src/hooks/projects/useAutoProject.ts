import { useCallback, useState } from 'react';
import { createProject } from '@/infrastructure/projects';
import { useChatStore } from '@/store/chatStore';

const AUTO_PROJECT_NAME_MAX_LENGTH = 30;

/**
 * Derive a short project name from the user's first message.
 * Strips question marks, filler words, and keeps it concise.
 * "What's a good plan for 2 weeks in Japan on $3000 budget?" → "Japan Trip Plan"
 * "I want to go to Beijing for a visit" → "Beijing Visit"
 */
export function deriveProjectName(message?: string): string {
  if (!message) return `Project ${new Date().toLocaleDateString()}`;

  // Remove question marks, periods, and common filler prefixes
  let clean = message
    .replace(/[?.!,;:]+$/g, '')
    .replace(
      /^(I want to|I'd like to|I need to|Can you|Could you|Please|Help me|Let's|What's a good|Tell me about|I'm looking for|I'm planning)\s+/i,
      ''
    )
    .trim();

  // Take first ~30 chars, break at word boundary
  if (clean.length > AUTO_PROJECT_NAME_MAX_LENGTH) {
    clean = clean.slice(0, AUTO_PROJECT_NAME_MAX_LENGTH).replace(/\s+\S*$/, '');
  }

  // Capitalize first letter of each word (title case)
  const titled = clean
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  return titled || `Project ${new Date().toLocaleDateString()}`;
}

export function useAutoProject() {
  const [isCreating, setIsCreating] = useState(false);
  const activeProjectId = useChatStore((s) => s.activeProjectId);

  const ensureProject = useCallback(
    async (topicHint?: string): Promise<string> => {
      if (activeProjectId) return activeProjectId;

      setIsCreating(true);
      try {
        const name = deriveProjectName(topicHint);
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
