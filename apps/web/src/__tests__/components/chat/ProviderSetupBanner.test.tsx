// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProviderSetupBanner } from '@/components/chat/ProviderSetupBanner';
import { useSettingsModalStore } from '@/store/settingsModalStore';

describe('ProviderSetupBanner', () => {
  beforeEach(() => {
    useSettingsModalStore.setState({
      isOpen: false,
      selectedTab: 'profile',
    });
  });

  it('opens the global settings modal on the providers tab', () => {
    render(<ProviderSetupBanner />);

    fireEvent.click(screen.getByRole('button', { name: 'Open provider settings' }));

    expect(useSettingsModalStore.getState().isOpen).toBe(true);
    expect(useSettingsModalStore.getState().selectedTab).toBe('providers');
    expect(screen.getByText('Set up a generation provider')).not.toBeNull();
    expect(
      screen.getByText('Connect a provider in Settings to pick a model and start chatting.')
    ).not.toBeNull();
  });
});
