import { create } from 'zustand';

type PanelState = 'collapsed' | 'default' | 'preview';

interface SessionState {
  setLastSession: (projectId: string, conversationId: string) => void;
  getLastSession: () => { projectId: string | null; conversationId: string | null };
  setPanelState: (state: PanelState) => void;
  getPanelState: () => PanelState;
  clearSession: () => void;
  /** Remove legacy onboarding localStorage keys from the old onboarding system */
  cleanupLegacyKeys: () => void;
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
  cleanupLegacyKeys: () => {
    localStorage.removeItem('t3x-onboarding-seen');
    localStorage.removeItem('t3x-onboarding-experience-set');
    localStorage.removeItem('t3x-tour-completed');
    localStorage.removeItem('t3x-quickstart-dismissed');
    localStorage.removeItem('t3x-quickstart-progress');
  },
}));
