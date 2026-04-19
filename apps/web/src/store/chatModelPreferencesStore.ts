import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ChatModelPreferencesState {
  selectedProvider: string | null;
  selectedModel: string | null;
  hydrated: boolean;
  setSelection: (provider: string | null, model: string | null) => void;
  clearSelection: () => void;
  setHydrated: (hydrated: boolean) => void;
}

export const useChatModelPreferencesStore = create<ChatModelPreferencesState>()(
  persist(
    (set) => ({
      selectedProvider: null,
      selectedModel: null,
      hydrated: false,
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
    }),
    {
      name: 't3x-chat-model-preferences',
      partialize: (state) => ({
        selectedProvider: state.selectedProvider,
        selectedModel: state.selectedModel,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);
