// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProviderSetupBanner } from '@/components/chat/ProviderSetupBanner';
import { useSettingsModalStore } from '@/store/settingsModalStore';

describe('ProviderSetupBanner', () => {
  beforeEach(() => {
    act(() => {
      useSettingsModalStore.setState(useSettingsModalStore.getInitialState());
    });
  });

  it('opens the providers tab in the settings modal', () => {
    render(<ProviderSetupBanner />);

    fireEvent.click(screen.getByRole('button', { name: 'Open provider settings' }));

    expect(useSettingsModalStore.getState().isOpen).toBe(true);
    expect(useSettingsModalStore.getState().activeTab).toBe('providers');
    expect(screen.getByText('Set up a generation provider')).toBeTruthy();
    expect(
      screen.getByText('Connect a provider in Settings to pick a model and start chatting.')
    ).toBeTruthy();
  });
});
