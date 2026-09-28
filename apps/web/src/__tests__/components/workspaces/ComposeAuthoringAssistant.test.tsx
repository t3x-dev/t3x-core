// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ComposeAuthoringAssistant } from '@/components/workspaces/ComposeAuthoringAssistant';

const mocks = vi.hoisted(() => ({ send: vi.fn(), generation: vi.fn() }));
vi.mock('@/hooks/shared/useChatModelSelection', () => ({
  useChatModelSelection: () => ({
    loading: false,
    isSelectionReady: true,
    selectedProvider: 'openai',
    selectedModel: 'gpt-5.4',
  }),
}));
vi.mock('@/hooks/sourceThreads/useSourceThreadGeneration', () => ({
  useSourceThreadGeneration: (options: unknown) => {
    mocks.generation(options);
    return {
      messages: [],
      streamingContent: '',
      input: '天气为晴天',
      setInput: vi.fn(),
      sendMessage: mocks.send,
      isLoading: false,
    };
  },
}));
vi.mock('@/components/generation/GenerationModelSelector', () => ({
  GenerationModelSelector: () => null,
}));
vi.mock('@/components/workspaces/WorkspaceComposeChat', () => ({
  WorkspaceComposeChat: () => null,
}));

describe('ComposeAuthoringAssistant first message', () => {
  it('allows sending without a prior conversation and uses the Workspace conversation factory', () => {
    const create = vi.fn(async () => 'conversation-1');
    render(
      <ComposeAuthoringAssistant
        projectId="project-1"
        context={{ workspaceId: 'workspace-1', workspaceRevision: 1, sourceMaterialIds: [] }}
        onCreateConversation={create}
        onPublishCandidate={vi.fn()}
      />
    );
    expect(screen.queryByText('Start workspace conversation')).not.toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
    expect(mocks.generation).toHaveBeenLastCalledWith(
      expect.objectContaining({ createConversation: create })
    );
    const send = screen.getByRole('button', { name: 'Send message' });
    expect(send).toBeEnabled();
    fireEvent.click(send);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });
});
