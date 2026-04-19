// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  SETTINGS_MODAL_TABS,
  useSettingsModalStore,
} from '@/store/settingsModalStore';

describe('settingsModalStore', () => {
  beforeEach(() => {
    useSettingsModalStore.setState({
      isOpen: false,
      selectedTab: 'profile',
    });
  });

  it('starts closed on the profile tab', () => {
    const state = useSettingsModalStore.getState();

    expect(state.isOpen).toBe(false);
    expect(state.selectedTab).toBe('profile');
    expect(SETTINGS_MODAL_TABS).toEqual(['profile', 'preferences', 'providers']);
  });

  it('opens on the requested tab', () => {
    useSettingsModalStore.getState().open('providers');

    const state = useSettingsModalStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.selectedTab).toBe('providers');
  });

  it('changes tabs without closing the modal', () => {
    const store = useSettingsModalStore.getState();

    store.open('profile');
    store.setSelectedTab('preferences');

    const state = useSettingsModalStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.selectedTab).toBe('preferences');
  });

  it('closes without resetting the selected tab', () => {
    const store = useSettingsModalStore.getState();

    store.open('providers');
    store.close();

    const state = useSettingsModalStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.selectedTab).toBe('providers');
  });
});
