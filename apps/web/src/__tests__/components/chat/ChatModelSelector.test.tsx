// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatModelSelector } from '@/components/chat/ChatModelSelector';
import { GenerationModelSelector } from '@/components/generation/GenerationModelSelector';
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

  it('uses the Cursor-style model pane with real configured options', async () => {
    const onModelChange = vi.fn();
    useAvailableModelsMock.mockReturnValue({
      defaultModel: 'gpt-5.4',
      defaultProvider: 'openai',
      providers: [
        {
          available: true,
          label: 'OpenAI',
          models: [
            {
              capabilities: ['thinking'],
              id: 'gpt-5.4',
              label: 'GPT 5.4',
              max_output_tokens: 8192,
            },
            {
              capabilities: [],
              id: 'gpt-5.4-mini',
              label: 'GPT 5.4 Mini',
              max_output_tokens: 4096,
            },
          ],
          name: 'openai',
        },
      ],
    });

    render(
      <ChatModelSelector
        conversationId={null}
        onModelChange={onModelChange}
        selectedModel="gpt-5.4"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Select model: GPT 5.4/i }));
    expect(await screen.findByRole('region', { name: 'Model preferences' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Models' })).toBeTruthy();
    expect(
      (screen.getByRole('switch', { name: 'Fast responses' }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(screen.getByRole('button', { name: 'Open provider settings' }).textContent).toContain(
      'Add Models'
    );

    fireEvent.click(screen.getByRole('menuitemradio', { name: 'GPT 5.4 Mini' }));
    expect(onModelChange).toHaveBeenCalledWith('openai', 'gpt-5.4-mini');
  });

  it('shows only the effort levels supported by the runtime', async () => {
    const onThinkingChange = vi.fn();
    useAvailableModelsMock.mockReturnValue({
      defaultModel: 'gpt-5.4',
      defaultProvider: 'openai',
      providers: [
        {
          available: true,
          label: 'OpenAI',
          models: [
            {
              capabilities: ['thinking'],
              id: 'gpt-5.4',
              label: 'GPT 5.4',
              max_output_tokens: 8192,
            },
          ],
          name: 'openai',
        },
      ],
    });

    render(
      <GenerationModelSelector
        onModelChange={vi.fn()}
        onThinkingChange={onThinkingChange}
        selectedModel="gpt-5.4"
        selectedProvider="openai"
        supportsThinking
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Select model: GPT 5.4/i }));
    fireEvent.click(screen.getByRole('button', { name: /EffortLow/i }));
    expect(await screen.findByRole('region', { name: 'Effort' })).toBeTruthy();
    expect(screen.getByRole('menuitemradio', { name: 'Low' }).getAttribute('aria-checked')).toBe(
      'true'
    );
    expect(screen.getByRole('menuitemradio', { name: 'High' })).toBeTruthy();

    fireEvent.click(screen.getByRole('menuitemradio', { name: 'High' }));
    expect(onThinkingChange).toHaveBeenCalledWith(true);
  });
});
