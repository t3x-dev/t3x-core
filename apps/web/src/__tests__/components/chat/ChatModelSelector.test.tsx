// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatModelSelector } from '@/components/chat/ChatModelSelector';
import { useSettingsModalStore } from '@/store/settingsModalStore';

const useAvailableModelsMock = vi.fn();

vi.mock('@/hooks/shared/useAvailableModels', () => ({
  useAvailableModels: () => useAvailableModelsMock(),
}));

describe('ChatModelSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => {
      useSettingsModalStore.setState(useSettingsModalStore.getInitialState());
    });
    useAvailableModelsMock.mockReturnValue({ providers: [] });
  });

  it('opens provider settings in the modal when no models are configured', async () => {
    render(<ChatModelSelector conversationId={null} selectedModel="" onModelChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /No models configured/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open provider settings' }));

    expect(useSettingsModalStore.getState().isOpen).toBe(true);
    expect(useSettingsModalStore.getState().activeTab).toBe('providers');
  });
});
