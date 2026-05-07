// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatWorkspace } from '@/components/chat/ChatWorkspace';
import { usePinsStore } from '@/store/pinsStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

const mocks = vi.hoisted(() => ({
  ensureProject: vi.fn(),
  fetchPins: vi.fn(),
  handleExtract: vi.fn(),
  handleModelChange: vi.fn(),
  sendMessage: vi.fn(),
  stopGenerating: vi.fn(),
  toastMessage: vi.fn(),
  textSelection: {
    current: null as null | {
      selection: {
        text: string;
        turnHash: string;
        turnRole: string;
        turnText: string;
        startChar: number;
        endChar: number;
        rect: DOMRect;
      };
      clearSelection: () => void;
    },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    message: (...args: unknown[]) => mocks.toastMessage(...args),
  },
}));

vi.mock('@/domain/sourceMap', () => ({
  buildSourceMap: () => new Map(),
}));

vi.mock('@/hooks/commits/useCommittedHighlights', () => ({
  useCommittedHighlights: () => new Map(),
}));

vi.mock('@/hooks/conversations/useChatInit', () => ({
  useChatInit: () => ({ parentConversationId: null }),
}));

vi.mock('@/hooks/conversations/useConversationChat', () => ({
  useConversationChat: () => ({
    messages: [{ id: 'sha256:t1', role: 'user', content: 'hello' }],
    isLoading: false,
    isStreaming: false,
    streamingContent: '',
    error: null,
    warning: null,
    sendMessage: mocks.sendMessage,
    stopGenerating: mocks.stopGenerating,
    searchQuery: null,
    citations: [],
    thinkingContent: '',
    isThinking: false,
  }),
}));

vi.mock('@/hooks/drafts/useExtraction', () => ({
  useExtraction: () => ({
    handleExtract: mocks.handleExtract,
    isExtracting: false,
  }),
}));

vi.mock('@/hooks/pins/usePinEnrichment', () => ({
  usePinEnrichment: () => new Map(),
}));

vi.mock('@/hooks/pins/usePinsCrud', () => ({
  usePinsCrud: () => ({ fetch: mocks.fetchPins }),
}));

vi.mock('@/hooks/projects/useAutoProject', () => ({
  useAutoProject: () => ({ ensureProject: mocks.ensureProject }),
}));

vi.mock('@/hooks/shared/useChatModelSelection', () => ({
  useChatModelSelection: () => ({
    loading: false,
    hasConfiguredGenerationProvider: true,
    availabilityError: null,
    selectedProvider: 'anthropic',
    selectedModel: 'claude-sonnet',
    handleModelChange: mocks.handleModelChange,
    isSelectionReady: true,
  }),
}));

vi.mock('@/hooks/shared/useRealtimeSync', () => ({
  useRealtimeSync: () => undefined,
}));

vi.mock('@/hooks/shared/useTextSelection', () => ({
  useTextSelection: () =>
    mocks.textSelection.current ?? { selection: null, clearSelection: vi.fn() },
}));

vi.mock('@/hooks/shared/useUndo', () => ({
  useUndo: () => undefined,
  useUndoTracker: () => ({ trackAction: vi.fn() }),
}));

vi.mock('@/components/chat/ChatMessage', () => ({
  ChatMessage: () => null,
}));

vi.mock('@/components/chat/ChatSpanActions', () => ({
  ChatSpanActions: () => <div data-testid="chat-span-actions" />,
}));

describe('ChatWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.scrollTo = vi.fn();
    mocks.textSelection.current = null;
    useWorkspaceStore.getState().reset();
    usePinsStore.setState({
      pins: [],
      loading: false,
      error: null,
      initialized: true,
      currentProjectId: 'proj_123',
    });
  });

  it('does not start extraction when Choose sources is requested without pinned sources', () => {
    render(<ChatWorkspace conversationId="conv_123" projectId="proj_123" />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('t3x:extract-requested', {
          detail: { chooseSources: true },
        })
      );
    });

    expect(mocks.handleExtract).not.toHaveBeenCalled();
    expect(mocks.toastMessage.mock.calls[0]?.[0]).toBe('No pinned sources yet');
  });

  it('shows source text actions for a valid selection even before executed mode', () => {
    mocks.textSelection.current = {
      selection: {
        text: 'understand',
        turnHash: 'sha256:t1',
        turnRole: 'assistant',
        turnText: 'hello',
        startChar: 10,
        endChar: 20,
        rect: new DOMRect(),
      },
      clearSelection: vi.fn(),
    };
    useWorkspaceStore.getState().setMode('idle');

    render(<ChatWorkspace conversationId="conv_123" projectId="proj_123" />);

    expect(screen.getByTestId('chat-span-actions')).not.toBeNull();
  });
});
