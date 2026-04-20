import { beforeEach, describe, expect, it } from 'vitest';
import { useSettingsModalStore } from '@/store/settingsModalStore';

beforeEach(() => {
  useSettingsModalStore.setState(useSettingsModalStore.getInitialState());
});

describe('settingsModalStore', () => {
  it('opens the modal with the default tab when no tab is requested', () => {
    useSettingsModalStore.getState().openSettingsModal();

    expect(useSettingsModalStore.getState().isOpen).toBe(true);
    expect(useSettingsModalStore.getState().activeTab).toBe('preferences');
  });

  it('opens the modal with a requested tab', () => {
    useSettingsModalStore.getState().openSettingsModal('providers');

    expect(useSettingsModalStore.getState().isOpen).toBe(true);
    expect(useSettingsModalStore.getState().activeTab).toBe('providers');
  });

  it("updates the active tab directly", () => {
    useSettingsModalStore.getState().setActiveTab('profile');

    expect(useSettingsModalStore.getState().activeTab).toBe('profile');
  });

  it('closes the modal without losing the last active tab', () => {
    useSettingsModalStore.getState().openSettingsModal('providers');
    useSettingsModalStore.getState().closeSettingsModal();

    expect(useSettingsModalStore.getState().isOpen).toBe(false);
    expect(useSettingsModalStore.getState().activeTab).toBe('providers');
  });
});
