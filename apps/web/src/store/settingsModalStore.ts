import { create } from 'zustand';

export type SettingsModalTab = 'profile' | 'preferences' | 'providers';

interface SettingsModalState {
  isOpen: boolean;
  activeTab: SettingsModalTab;
  openSettingsModal: (tab?: SettingsModalTab) => void;
  closeSettingsModal: () => void;
  setActiveTab: (tab: SettingsModalTab) => void;
}

export const useSettingsModalStore = create<SettingsModalState>((set) => ({
  isOpen: false,
  activeTab: 'preferences',
  openSettingsModal: (tab = 'preferences') => set({ isOpen: true, activeTab: tab }),
  closeSettingsModal: () => set({ isOpen: false }),
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
