import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { sound } from '@/lib/sound';

interface SettingsState {
  developerMode: boolean;
  setDeveloperMode: (enabled: boolean) => void;
  toggleDeveloperMode: () => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
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
      soundEnabled: false,
      setSoundEnabled: (enabled) => {
        sound.enabled = enabled;
        set({ soundEnabled: enabled });
      },
    }),
    {
      name: 't3x-settings',
      partialize: (state) => ({
        developerMode: state.developerMode,
        soundEnabled: state.soundEnabled,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.soundEnabled) {
          sound.enabled = true;
        }
      },
    }
  )
);
