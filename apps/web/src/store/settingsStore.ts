import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UserExperience = 'general' | 'developer';
export type ViewMode = 'canvas' | 'timeline';
export type Density = 'compact' | 'comfortable';

interface SettingsState {
  developerMode: boolean;
  userExperience: UserExperience;
  defaultView: ViewMode;
  density: Density;

  setDeveloperMode: (enabled: boolean) => void;
  toggleDeveloperMode: () => void;
  setUserExperience: (experience: UserExperience) => void;
  setDefaultView: (view: ViewMode) => void;
  setDensity: (density: Density) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      developerMode: false,
      userExperience: 'general',
      defaultView: 'timeline',
      density: 'comfortable',

      setDeveloperMode: (enabled) => set({ developerMode: enabled }),
      toggleDeveloperMode: () =>
        set((state) => ({
          developerMode: !state.developerMode,
        })),
      setUserExperience: (experience) =>
        set({ userExperience: experience, developerMode: experience === 'developer' }),
      setDefaultView: (view) => set({ defaultView: view }),
      setDensity: (density) => set({ density }),
    }),
    {
      name: 't3x-settings',
      partialize: (state) => ({
        developerMode: state.developerMode,
        userExperience: state.userExperience,
        defaultView: state.defaultView,
        density: state.density,
      }),
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<SettingsState>) };
        // Fix desync: derive developerMode from userExperience
        if (merged.userExperience === 'developer' && !merged.developerMode) {
          merged.developerMode = true;
        }
        return merged;
      },
    }
  )
);
