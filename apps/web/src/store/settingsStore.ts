import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  developerMode: boolean;
  setDeveloperMode: (enabled: boolean) => void;
  toggleDeveloperMode: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      developerMode: false,
      setDeveloperMode: (enabled) => set({ developerMode: enabled }),
      toggleDeveloperMode: () =>
        set((state) => ({
          developerMode: !state.developerMode,
        })),
    }),
    {
      name: 't3x-settings',
      partialize: (state) => ({ developerMode: state.developerMode }),
    }
  )
);
