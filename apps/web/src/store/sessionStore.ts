import { create } from 'zustand';

type PanelState = 'collapsed' | 'default' | 'preview';

interface SessionState {
  setLastSession: (projectId: string, conversationId: string) => void;
  getLastSession: () => { projectId: string | null; conversationId: string | null };
  setPanelState: (state: PanelState) => void;
  getPanelState: () => PanelState;
  clearSession: () => void;
  /** Validate stored session IDs exist via API; clear if invalid */
  validateSession: () => Promise<{ projectId: string; conversationId: string } | null>;
}

export const useSessionStore = create<SessionState>(() => ({
  setLastSession: (projectId, conversationId) => {
    localStorage.setItem('t3x-session-project', projectId);
    localStorage.setItem('t3x-session-conversation', conversationId);
  },
  getLastSession: () => ({
    projectId: localStorage.getItem('t3x-session-project'),
    conversationId: localStorage.getItem('t3x-session-conversation'),
  }),
  setPanelState: (state) => {
    localStorage.setItem('t3x-session-panel-state', state);
  },
  getPanelState: () => {
    return (localStorage.getItem('t3x-session-panel-state') as PanelState) ?? 'default';
  },
  clearSession: () => {
    localStorage.removeItem('t3x-session-project');
    localStorage.removeItem('t3x-session-conversation');
    localStorage.removeItem('t3x-session-panel-state');
  },
  validateSession: async () => {
    const projectId = localStorage.getItem('t3x-session-project');
    const conversationId = localStorage.getItem('t3x-session-conversation');
    if (!projectId || !conversationId) return null;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/projects/${projectId}`);
      if (!res.ok) {
        useSessionStore.getState().clearSession();
        return null;
      }
      return { projectId, conversationId };
    } catch {
      useSessionStore.getState().clearSession();
      return null;
    }
  },
}));
