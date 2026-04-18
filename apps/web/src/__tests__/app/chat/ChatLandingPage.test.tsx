// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
  }),
}));

vi.mock('@/hooks/shared/useAvailableModels', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/shared/useAvailableModels')>(
    '@/hooks/shared/useAvailableModels'
  );
  return {
    ...actual,
    useAvailableModels: vi.fn(),
  };
});

vi.mock('@/components/chat/ChatInput', () => ({
  ChatInput: ({
    disabled,
    selectedModel,
    onSend,
    onModelChange,
  }: {
    disabled?: boolean;
    selectedModel?: string;
    onSend: (message: string) => void;
    onModelChange?: (provider: string, model: string) => void;
  }) => (
    <div>
      <div data-testid="chat-disabled">{String(Boolean(disabled))}</div>
      <div data-testid="selected-model">{selectedModel ?? ''}</div>
      <button type="button" onClick={() => onModelChange?.('openai', 'gpt-4.1')}>
        select openai
      </button>
      <button type="button" onClick={() => onSend('hello world')}>
        send chat
      </button>
    </div>
  ),
}));

import ChatLandingPage from '@/app/chat/page';
import { useAvailableModels } from '@/hooks/shared/useAvailableModels';

afterEach(() => {
  vi.clearAllMocks();
});

describe('ChatLandingPage', () => {
  it('preserves provider and model in the /chat/new navigation URL', async () => {
    vi.mocked(useAvailableModels).mockReturnValue({
      providers: [
        {
          name: 'anthropic',
          label: 'Anthropic',
          available: true,
          models: [
            {
              id: 'claude-sonnet-4-20250514',
              label: 'Claude Sonnet 4',
              capabilities: [],
              max_output_tokens: 4096,
            },
          ],
        },
        {
          name: 'openai',
          label: 'OpenAI',
          available: true,
          models: [{ id: 'gpt-4.1', label: 'GPT-4.1', capabilities: [], max_output_tokens: 4096 }],
        },
      ],
      loading: false,
      hasConfiguredGenerationProvider: true,
      defaultProvider: 'anthropic',
      defaultModel: 'claude-sonnet-4-20250514',
      loadModels: vi.fn(),
    });

    render(<ChatLandingPage />);

    await waitFor(() => {
      expect(screen.getByTestId('selected-model')).toHaveTextContent('claude-sonnet-4-20250514');
    });

    fireEvent.click(screen.getByRole('button', { name: /select openai/i }));
    await waitFor(() => {
      expect(screen.getByTestId('selected-model')).toHaveTextContent('gpt-4.1');
    });
    fireEvent.click(screen.getByRole('button', { name: /send chat/i }));

    expect(push).toHaveBeenCalledWith(
      '/chat/new?firstMessage=hello+world&provider=openai&model=gpt-4.1'
    );
  });

  it('disables the start path when no generation provider is usable', async () => {
    vi.mocked(useAvailableModels).mockReturnValue({
      providers: [],
      loading: false,
      hasConfiguredGenerationProvider: false,
      defaultProvider: null,
      defaultModel: null,
      loadModels: vi.fn(),
    });

    render(<ChatLandingPage />);

    expect(screen.getByText('Set up a generation provider')).toBeInTheDocument();
    expect(screen.getByTestId('chat-disabled')).toHaveTextContent('true');
    expect(screen.getByRole('button', { name: /capture meeting notes/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /send chat/i }));
    expect(push).not.toHaveBeenCalled();
  });
});
