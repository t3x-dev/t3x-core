import { create } from 'zustand';

interface ChatState {
  activeConversationId: string | null;
  activeProjectId: string | null;
  activeBranch: string;
  sidebarCollapsed: boolean;
  expandedProjectIds: Set<string>;
  /** Incremented to signal sidebar should refresh */
  refreshKey: number;

  setActiveConversation: (conversationId: string | null, projectId: string | null) => void;
  setActiveBranch: (branch: string) => void;
  toggleSidebar: () => void;
  toggleProjectExpanded: (projectId: string) => void;
  refreshSidebar: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  activeConversationId: null,
  activeProjectId: null,
  activeBranch: 'main',
  sidebarCollapsed: false,
  expandedProjectIds: new Set<string>(),
  refreshKey: 0,

  setActiveConversation: (conversationId, projectId) =>
    set({ activeConversationId: conversationId, activeProjectId: projectId }),
  setActiveBranch: (branch) => set({ activeBranch: branch }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleProjectExpanded: (projectId) =>
    set((s) => {
      const next = new Set(s.expandedProjectIds);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return { expandedProjectIds: next };
    }),
  refreshSidebar: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),
}));
