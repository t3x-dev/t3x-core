// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceComposeChat } from '@/components/workspaces/WorkspaceComposeChat';
import type { WorkspaceComposeReviewController } from '@/hooks/workspaces/useWorkspaceComposeReviewController';

type ComposeChatState = WorkspaceComposeReviewController['chat'];

function chatState(overrides: Partial<ComposeChatState> = {}): ComposeChatState {
  return {
    citations: [],
    error: null,
    input: '',
    isLoading: false,
    isThinking: false,
    isStreaming: false,
    messages: [],
    searchQuery: null,
    send: () => undefined,
    setInput: () => undefined,
    stop: () => undefined,
    thinkingContent: '',
    warning: null,
    ...overrides,
  } as ComposeChatState;
}

describe('WorkspaceComposeChat', () => {
  it('fills a starting prompt without sending or changing workspace data', () => {
    const setInput = vi.fn();
    const send = vi.fn();
    render(<WorkspaceComposeChat chat={chatState({ setInput, send })} />);
    fireEvent.click(screen.getByRole('button', { name: /Understand this workspace/ }));
    expect(setInput).toHaveBeenCalledWith(
      'Explain the current workspace and the changes it contains.'
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('reports a clipboard failure instead of showing a copied state', async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) },
    });
    try {
      render(
        <WorkspaceComposeChat
          chat={chatState({
            messages: [
              { author: 'Assistant', role: 'assistant', id: 'reply', content: 'A response.' },
            ],
          })}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not copy'));
      expect(screen.queryByRole('button', { name: 'Message copied' })).toBeNull();
    } finally {
      if (original) Object.defineProperty(navigator, 'clipboard', original);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('renders assistant markdown through the AI Elements response surface', async () => {
    render(
      <WorkspaceComposeChat
        chat={chatState({
          messages: [
            {
              author: 'Assistant',
              content: ['## Source draft', '', '- Keep the audit trail readable.'].join('\n'),
              id: 'turn-assistant-1',
              role: 'assistant',
            },
          ],
        })}
      />
    );

    expect(await screen.findByRole('heading', { name: 'Source draft' })).toBeInTheDocument();
    expect(screen.getByText('Keep the audit trail readable.')).toBeInTheDocument();
  });

  it('keeps streaming text in one assistant message and shows real stream metadata', async () => {
    render(
      <WorkspaceComposeChat
        chat={chatState({
          isStreaming: true,
          messages: [
            {
              author: 'Assistant',
              content: 'Preparing **structured** source material',
              id: 'conv_1:streaming',
              role: 'assistant',
            },
          ],
          searchQuery: 'workspace evidence',
        })}
      />
    );

    expect(await screen.findByText(/Preparing/)).toBeInTheDocument();
    expect(screen.getByText('structured')).toBeInTheDocument();
    expect(screen.getByText('Searching workspace evidence')).toBeInTheDocument();
  });
});
