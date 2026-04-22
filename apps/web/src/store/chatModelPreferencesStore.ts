import { create } from 'zustand';

interface ChatModelPreferencesState {
  selectedProvider: string | null;
  selectedModel: string | null;
  hydrated: boolean;
  setSelection: (provider: string | null, model: string | null) => void;
  clearSelection: () => void;
  setHydrated: (hydrated: boolean) => void;
}

export const useChatModelPreferencesStore = create<ChatModelPreferencesState>()((set) => ({
  selectedProvider: null,
  selectedModel: null,
  // Kept for compatibility with existing consumers/tests; this store is in-memory only.
  hydrated: true,
  setSelection: (provider, model) =>
    set({
      selectedProvider: provider,
      selectedModel: model,
    }),
  clearSelection: () =>
    set({
      selectedProvider: null,
      selectedModel: null,
    }),
  setHydrated: (hydrated) => set({ hydrated }),
}));
