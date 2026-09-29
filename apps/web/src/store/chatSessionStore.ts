import { create } from 'zustand';

interface ChatSessionState {
  reasoningEffort: 'low' | 'medium' | 'high';
  contextMode: 'auto' | 'compact' | 'expanded';
  fastEnabled: boolean;
  setReasoningEffort: (effort: 'low' | 'medium' | 'high') => void;
  setContextMode: (mode: 'auto' | 'compact' | 'expanded') => void;
  setFast: (enabled: boolean) => void;
  webSearchEnabled: boolean;
  thinkingEnabled: boolean;
  toggleWebSearch: () => void;
  toggleThinking: () => void;
  setWebSearch: (enabled: boolean) => void;
  setThinking: (enabled: boolean) => void;
}

export const useChatSessionStore = create<ChatSessionState>((set) => ({
  reasoningEffort: 'medium',
  contextMode: 'auto',
  fastEnabled: false,
  setReasoningEffort: (reasoningEffort) =>
    set({ reasoningEffort, thinkingEnabled: reasoningEffort !== 'low', fastEnabled: false }),
  setContextMode: (contextMode) => set({ contextMode }),
  setFast: (fastEnabled) => set({ fastEnabled }),
  webSearchEnabled: false,
  thinkingEnabled: false,
  toggleWebSearch: () => set((s) => ({ webSearchEnabled: !s.webSearchEnabled })),
  toggleThinking: () => set((s) => ({ thinkingEnabled: !s.thinkingEnabled })),
  setWebSearch: (enabled) => set({ webSearchEnabled: enabled }),
  setThinking: (enabled) => set({ thinkingEnabled: enabled }),
}));
