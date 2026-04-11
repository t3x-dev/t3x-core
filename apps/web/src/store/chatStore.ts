import { create } from 'zustand';

interface ChatState {
  activeConversationId: string | null;
  activeProjectId: string | null;
  activeBranch: string;
  conversationTitle: string | null;
  sidebarCollapsed: boolean;
  expandedProjectIds: Set<string>;
  /** Incremented to signal sidebar should refresh */
  refreshKey: number;

  setActiveConversation: (conversationId: string | null, projectId: string | null) => void;
  setActiveBranch: (branch: string) => void;
  setConversationTitle: (title: string | null) => void;
  toggleSidebar: () => void;
  toggleProjectExpanded: (projectId: string) => void;
  refreshSidebar: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  activeConversationId: null,
  activeProjectId: null,
  activeBranch: 'main',
  conversationTitle: null,
  sidebarCollapsed: false,
  expandedProjectIds: new Set<string>(),
  refreshKey: 0,

  setActiveConversation: (conversationId, projectId) =>
    set({ activeConversationId: conversationId, activeProjectId: projectId }),
  setActiveBranch: (branch) => set({ activeBranch: branch }),
  setConversationTitle: (title) => set({ conversationTitle: title }),
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
