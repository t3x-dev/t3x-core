import { create } from 'zustand';

interface ChatSessionState {
  webSearchEnabled: boolean;
  thinkingEnabled: boolean;
  toggleWebSearch: () => void;
  toggleThinking: () => void;
  setWebSearch: (enabled: boolean) => void;
  setThinking: (enabled: boolean) => void;
}

export const useChatSessionStore = create<ChatSessionState>((set) => ({
  webSearchEnabled: false,
  thinkingEnabled: false,
  toggleWebSearch: () => set((s) => ({ webSearchEnabled: !s.webSearchEnabled })),
  toggleThinking: () => set((s) => ({ thinkingEnabled: !s.thinkingEnabled })),
  setWebSearch: (enabled) => set({ webSearchEnabled: enabled }),
  setThinking: (enabled) => set({ thinkingEnabled: enabled }),
}));
