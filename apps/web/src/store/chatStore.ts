import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const CHAT_SIDEBAR_COLLAPSED_WIDTH = 64;
export const CHAT_SIDEBAR_DEFAULT_WIDTH = 256;
export const CHAT_SIDEBAR_MIN_WIDTH = 208;
export const CHAT_SIDEBAR_MAX_WIDTH = 360;

export function clampChatSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return CHAT_SIDEBAR_DEFAULT_WIDTH;
  return Math.min(CHAT_SIDEBAR_MAX_WIDTH, Math.max(CHAT_SIDEBAR_MIN_WIDTH, Math.round(width)));
}

interface ChatState {
  activeConversationId: string | null;
  activeProjectId: string | null;
  activeBranch: string;
  conversationTitle: string | null;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  expandedProjectIds: Set<string>;
  /** Incremented to signal sidebar should refresh */
  refreshKey: number;

  setActiveConversation: (conversationId: string | null, projectId: string | null) => void;
  setActiveBranch: (branch: string) => void;
  setConversationTitle: (title: string | null) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  toggleProjectExpanded: (projectId: string) => void;
  refreshSidebar: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      activeConversationId: null,
      activeProjectId: null,
      activeBranch: 'main',
      conversationTitle: null,
      sidebarCollapsed: false,
      sidebarWidth: CHAT_SIDEBAR_DEFAULT_WIDTH,
      expandedProjectIds: new Set<string>(),
      refreshKey: 0,

      setActiveConversation: (conversationId, projectId) =>
        set({ activeConversationId: conversationId, activeProjectId: projectId }),
      setActiveBranch: (branch) => set({ activeBranch: branch }),
      setConversationTitle: (title) => set({ conversationTitle: title }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarWidth: (width) => set({ sidebarWidth: clampChatSidebarWidth(width) }),
      toggleProjectExpanded: (projectId) =>
        set((s) => {
          const next = new Set(s.expandedProjectIds);
          if (next.has(projectId)) next.delete(projectId);
          else next.add(projectId);
          return { expandedProjectIds: next };
        }),
      refreshSidebar: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),
    }),
    {
      name: 't3x-chat-ui',
      partialize: (state) => ({ sidebarWidth: state.sidebarWidth }),
      storage: createJSONStorage(() => {
        const ls =
          typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
        if (ls && typeof ls.setItem === 'function' && typeof ls.getItem === 'function') {
          return ls;
        }
        const memory = new Map<string, string>();
        return {
          getItem: (key) => memory.get(key) ?? null,
          setItem: (key, value) => {
            memory.set(key, value);
          },
          removeItem: (key) => {
            memory.delete(key);
          },
        };
      }),
    }
  )
);
