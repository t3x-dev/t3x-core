// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('ComposeAuthoringAssistant attachments', () => {
  it('sends pasted documents with the message and clears the chips', () => {
    mocks.send.mockClear();
    render(
      <ComposeAuthoringAssistant
        projectId="project-1"
        context={{ workspaceId: 'workspace-1', workspaceRevision: 1, sourceMaterialIds: [] }}
        onCreateConversation={vi.fn(async () => 'conversation-1')}
        onPublishCandidate={vi.fn()}
      />
    );
    const pdf = new File(['%PDF-1.7'], 'plan.pdf', { type: 'application/pdf' });
    const legacy = new File(['x'], 'old.doc', { type: 'application/msword' });
    fireEvent.paste(screen.getByRole('textbox'), {
      clipboardData: { items: [], files: [pdf, legacy], getData: () => '' },
    });

    expect(screen.getByText('plan.pdf')).toBeInTheDocument();
    expect(screen.queryByText('old.doc')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(mocks.send).toHaveBeenCalledWith('天气为晴天', { files: [pdf] });
    expect(screen.queryByText('plan.pdf')).not.toBeInTheDocument();
  });
});

describe('ComposeAuthoringAssistant proposal mode', () => {
  afterEach(() => {
    localStorage.clear();
  });

  function renderAssistant(workspaceId: string) {
    return render(
      <ComposeAuthoringAssistant
        projectId="project-1"
        context={{ workspaceId, workspaceRevision: 1, sourceMaterialIds: [] }}
        onCreateConversation={vi.fn(async () => 'conversation-1')}
        onPublishCandidate={vi.fn()}
      />
    );
  }

  it('defaults to guided and sends the selected mode with the assistant context', () => {
    renderAssistant('workspace-1');

    expect(screen.getByRole('combobox', { name: 'Proposal mode' })).toHaveValue('guided');
    expect(mocks.generation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        workspaceAssistant: expect.objectContaining({ posture: 'guided' }),
      })
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Proposal mode' }), {
      target: { value: 'source_only' },
    });

    expect(mocks.generation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        workspaceAssistant: expect.objectContaining({ posture: 'source_only' }),
      })
    );
  });

  it('remembers the mode per Workspace', async () => {
    const first = renderAssistant('workspace-1');
    fireEvent.change(screen.getByRole('combobox', { name: 'Proposal mode' }), {
      target: { value: 'recommend' },
    });
    first.unmount();

    const again = renderAssistant('workspace-1');
    expect(await screen.findByRole('combobox', { name: 'Proposal mode' })).toHaveValue('recommend');
    again.unmount();

    renderAssistant('workspace-2');
    expect(screen.getByRole('combobox', { name: 'Proposal mode' })).toHaveValue('guided');
  });
});
