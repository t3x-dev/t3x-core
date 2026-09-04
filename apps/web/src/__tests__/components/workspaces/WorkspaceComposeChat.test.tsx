// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
