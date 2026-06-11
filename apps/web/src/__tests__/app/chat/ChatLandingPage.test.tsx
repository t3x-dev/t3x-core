// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  if (
    typeof globalThis.localStorage !== 'object' ||
    typeof globalThis.localStorage.setItem === 'function'
  ) {
    return;
  }
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
      get length() {
        return store.size;
      },
      key: (index: number) => [...store.keys()][index] ?? null,
    },
  });
});

const push = vi.fn();
let searchParamsValue: URLSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
  }),
  useSearchParams: () => searchParamsValue,
}));

const modelSelectionFixture = vi.hoisted(() => ({
  value: {
    loading: false,
    hasConfiguredGenerationProvider: true,
    selectedProvider: 'anthropic',
    selectedModel: 'claude-sonnet-4-20250514',
    availabilityError: null as 'api_unavailable' | null,
  },
}));

const projectQueryMocks = vi.hoisted(() => ({
  fetchProjects: vi.fn(),
}));

const conversationQueryMocks = vi.hoisted(() => ({
  fetchConversations: vi.fn(),
}));

const projectCommandMocks = vi.hoisted(() => ({
  ensureDemoProject: vi.fn(),
}));

vi.mock('@/queries/projects', () => ({
  fetchProjects: projectQueryMocks.fetchProjects,
}));

vi.mock('@/queries/conversations', () => ({
  fetchConversations: conversationQueryMocks.fetchConversations,
}));

vi.mock('@/commands/projects', () => ({
  ensureDemoProject: projectCommandMocks.ensureDemoProject,
}));

vi.mock('@/hooks/shared/useChatModelSelection', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    useChatModelSelection: vi.fn(() => {
      const [selection, setSelection] = React.useState({
        provider: modelSelectionFixture.value.selectedProvider,
        model: modelSelectionFixture.value.selectedModel,
      });
      return {
        loading: modelSelectionFixture.value.loading,
        hasConfiguredGenerationProvider:
          modelSelectionFixture.value.hasConfiguredGenerationProvider,
        selectedProvider: selection.provider,
        selectedModel: selection.model,
        handleModelChange: (provider: string, model: string) => {
          modelSelectionFixture.value.selectedProvider = provider;
          modelSelectionFixture.value.selectedModel = model;
          setSelection({ provider, model });
        },
        availabilityError: modelSelectionFixture.value.availabilityError,
      };
    }),
  };
});

vi.mock('@/components/chat/ChatInput', () => ({
  ChatInput: ({
    disabled,
    placeholder,
    selectedModel,
    onSend,
    onModelChange,
    prefillText,
    sendIntroTarget,
  }: {
    disabled?: boolean;
    placeholder?: string;
    selectedModel?: string;
    onSend: (message: string) => void;
    onModelChange?: (provider: string, model: string) => void;
    prefillText?: string | null;
    sendIntroTarget?: string;
  }) => (
    <div>
      <div data-testid="chat-disabled">{String(Boolean(disabled))}</div>
      <div data-testid="chat-placeholder">{placeholder ?? ''}</div>
      <div data-testid="selected-model">{selectedModel ?? ''}</div>
      <div data-testid="chat-prefill">{prefillText ?? ''}</div>
      <button type="button" onClick={() => onModelChange?.('openai', 'gpt-4.1')}>
        select openai
      </button>
      <button
        type="button"
        data-intro-target={sendIntroTarget}
        onClick={() => onSend('hello world')}
      >
        send chat
      </button>
    </div>
  ),
}));

import ChatLandingPage from '@/app/chat/page';
import { FIRST_RUN_DEMO_SEEN_KEY } from '@/hooks/onboarding/useFirstRunDemo';
import { useChatStore } from '@/store/chatStore';

function setModelSelection(overrides: Partial<typeof modelSelectionFixture.value> = {}): void {
  modelSelectionFixture.value = {
    loading: false,
    hasConfiguredGenerationProvider: true,
    selectedProvider: 'anthropic',
    selectedModel: 'claude-sonnet-4-20250514',
    availabilityError: null,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.removeItem('t3x-chat-model-preferences');
  localStorage.setItem(FIRST_RUN_DEMO_SEEN_KEY, 'true');
  setModelSelection();
  conversationQueryMocks.fetchConversations.mockResolvedValue({
    conversations: [],
    limit: 20,
    offset: 0,
  });
  useChatStore.setState({ activeProjectId: null, activeConversationId: null });
  searchParamsValue = new URLSearchParams();
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.removeItem('t3x-chat-model-preferences');
  localStorage.removeItem(FIRST_RUN_DEMO_SEEN_KEY);
  setModelSelection();
  useChatStore.setState({ activeProjectId: null, activeConversationId: null });
  searchParamsValue = new URLSearchParams();
});

describe('ChatLandingPage', () => {
  it('opens the first-run demo when the user has not seen it yet', async () => {
    localStorage.removeItem(FIRST_RUN_DEMO_SEEN_KEY);

    await act(async () => {
      render(<ChatLandingPage />);
    });

    expect(await screen.findByRole('dialog', { name: /create the demo workspace/i })).toBeVisible();
    expect(screen.getAllByText('Project')[0]).toBeVisible();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start using t3x/i }));
    });

    expect(localStorage.getItem(FIRST_RUN_DEMO_SEEN_KEY)).toBe('true');
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the first-run demo from the dev-only introDemo query even after it was seen', async () => {
    searchParamsValue = new URLSearchParams({ introDemo: '1' });

    await act(async () => {
      render(<ChatLandingPage />);
    });

    expect(await screen.findByRole('dialog', { name: /create the demo workspace/i })).toBeVisible();
  });

  it('prefills the intro demo composer after project creation', async () => {
    searchParamsValue = new URLSearchParams({
      projectId: 'proj_demo',
      introDemo: '1',
      introDemoStage: 'compose',
    });

    await act(async () => {
      render(<ChatLandingPage />);
    });

    expect(await screen.findByRole('dialog', { name: /send the ready prompt/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /send chat/i })).toHaveAttribute(
      'data-intro-target',
      'landing-send-action'
    );
    expect(screen.getByTestId('chat-prefill')).toHaveTextContent('Support escalation review');
    expect(screen.getByTestId('selected-model')).toHaveTextContent('fixture-replay');
    expect(screen.getByTestId('chat-disabled')).toHaveTextContent('false');
  });

  it('reopens the forced intro demo when the dev walkthrough stage changes', async () => {
    searchParamsValue = new URLSearchParams({ introDemo: '1' });

    const view = render(<ChatLandingPage />);

    expect(await screen.findByRole('dialog', { name: /create the demo workspace/i })).toBeVisible();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^skip demo$/i }));
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    searchParamsValue = new URLSearchParams({
      projectId: 'proj_demo',
      introDemo: '1',
      introDemoStage: 'compose',
    });

    await act(async () => {
      view.rerender(<ChatLandingPage />);
    });

    expect(await screen.findByRole('dialog', { name: /send the ready prompt/i })).toBeVisible();
  });

  it('sends the intro demo message through the fixture replay path', async () => {
    searchParamsValue = new URLSearchParams({
      projectId: 'proj_demo',
      introDemo: '1',
      introDemoStage: 'compose',
    });

    await act(async () => {
      render(<ChatLandingPage />);
    });

    await screen.findByRole('dialog', { name: /send the ready prompt/i });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send chat/i }));
    });

    expect(push).toHaveBeenCalledTimes(1);
    const target = (push.mock.calls[0]?.[0] as string) ?? '';
    expect(target.startsWith('/chat/new?')).toBe(true);
    const params = new URLSearchParams(target.slice('/chat/new?'.length));
    expect(params.get('firstMessage')).toBe('hello world');
    expect(params.get('introDemo')).toBe('1');
    expect(params.get('fixtureReply')).toBe('1');
    expect(params.get('projectId')).toBe('proj_demo');
  });

  it('renders the guided landing copy and starter actions', async () => {
    await act(async () => {
      render(<ChatLandingPage />);
    });

    expect(screen.getByRole('heading', { name: 'What should T3X structure?' })).toBeVisible();
    expect(screen.getByText('Source')).toBeVisible();
    expect(screen.getByText('YOps')).toBeVisible();
    expect(screen.getByText('Commit')).toBeVisible();
    expect(screen.getByRole('button', { name: /compare prompt versions/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /extract decisions from notes/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /create reusable output/i })).toBeEnabled();
    expect(screen.getByTestId('chat-placeholder')).toHaveTextContent(
      'Paste a prompt, transcript, release note, or design discussion...'
    );
  });

  it('uses semantic tone tokens for starter card icons', async () => {
    await act(async () => {
      render(<ChatLandingPage />);
    });

    const captureIcon = screen
      .getByRole('button', { name: /compare prompt versions/i })
      .querySelector('span');
    const meaningIcon = screen
      .getByRole('button', { name: /extract decisions from notes/i })
      .querySelector('span');
    const checkpointIcon = screen
      .getByRole('button', { name: /create reusable output/i })
      .querySelector('span');

    expect(captureIcon).toHaveClass('text-[var(--source)]');
    expect(meaningIcon).toHaveClass('text-[var(--accent-extract)]');
    expect(checkpointIcon).toHaveClass('text-[var(--accent-leaf)]');
    expect(checkpointIcon).not.toHaveClass('text-[var(--accent-commit)]');
  });

  it('prefills the composer from each starter card without sending', async () => {
    await act(async () => {
      render(<ChatLandingPage />);
    });

    const starters = [
      {
        name: /compare prompt versions/i,
        prefill: 'Compare these prompt versions and extract the structured changes:',
      },
      {
        name: /extract decisions from notes/i,
        prefill: 'Extract the decisions, facts, risks, and tensions from these notes:',
      },
      {
        name: /create reusable output/i,
        prefill: 'Create a reusable output from this committed state:',
      },
    ];

    for (const starter of starters) {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: starter.name }));
      });

      expect(push).not.toHaveBeenCalled();
      expect(screen.getByTestId('chat-prefill')).toHaveTextContent(starter.prefill);
    }
  });

  it('preserves provider and model in the /chat/new navigation URL', async () => {
    await act(async () => {
      render(<ChatLandingPage />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('selected-model')).toHaveTextContent('claude-sonnet-4-20250514');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /select openai/i }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('selected-model')).toHaveTextContent('gpt-4.1');
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send chat/i }));
    });

    expect(push).toHaveBeenCalledWith(
      '/chat/new?firstMessage=hello+world&provider=openai&model=gpt-4.1'
    );
  });

  it('primes activeProjectId and propagates ?projectId= into /chat/new', async () => {
    // Mirrors the "+ New Project" sidebar action, which lands here with
    // ?projectId=<id>. Without propagation, ChatWorkspace.useAutoProject
    // would create a second project on first send.
    searchParamsValue = new URLSearchParams({ projectId: 'proj_from_url' });

    await act(async () => {
      render(<ChatLandingPage />);
    });

    await waitFor(() => {
      expect(useChatStore.getState().activeProjectId).toBe('proj_from_url');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send chat/i }));
    });

    expect(push).toHaveBeenCalledTimes(1);
    const target = (push.mock.calls[0]?.[0] as string) ?? '';
    expect(target.startsWith('/chat/new?')).toBe(true);
    const params = new URLSearchParams(target.slice('/chat/new?'.length));
    expect(params.get('firstMessage')).toBe('hello world');
    expect(params.get('projectId')).toBe('proj_from_url');
  });

  it('disables the start path when no generation provider is usable', async () => {
    setModelSelection({
      hasConfiguredGenerationProvider: false,
      selectedProvider: null,
      selectedModel: null,
      availabilityError: null,
    });

    await act(async () => {
      render(<ChatLandingPage />);
    });

    expect(screen.getByText('Set up a generation provider')).toBeInTheDocument();
    expect(screen.getByTestId('chat-disabled')).toHaveTextContent('true');
    expect(screen.getByRole('button', { name: /compare prompt versions/i })).toBeDisabled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send chat/i }));
    });
    expect(push).not.toHaveBeenCalled();
  });

  it('shows an API unavailable banner instead of provider setup when model loading fails', async () => {
    setModelSelection({
      hasConfiguredGenerationProvider: false,
      selectedProvider: null,
      selectedModel: null,
      availabilityError: 'api_unavailable',
    });

    await act(async () => {
      render(<ChatLandingPage />);
    });

    expect(screen.getByText('API server unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Set up a generation provider')).not.toBeInTheDocument();
    expect(screen.getByTestId('chat-disabled')).toHaveTextContent('true');
  });
});
