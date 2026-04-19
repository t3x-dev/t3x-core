import { create } from 'zustand';

export const SETTINGS_MODAL_TABS = ['profile', 'preferences', 'providers'] as const;

export type SettingsModalTab = (typeof SETTINGS_MODAL_TABS)[number];

interface SettingsModalState {
  isOpen: boolean;
  selectedTab: SettingsModalTab;
  open: (tab?: SettingsModalTab) => void;
  close: () => void;
  setSelectedTab: (tab: SettingsModalTab) => void;
}

export const useSettingsModalStore = create<SettingsModalState>()((set) => ({
  isOpen: false,
  selectedTab: 'profile',
  open: (tab = 'profile') => set({ isOpen: true, selectedTab: tab }),
  close: () => set({ isOpen: false }),
  setSelectedTab: (tab) => set({ selectedTab: tab }),
}));
