// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runExtractionMock = vi.fn();
const callExtractionLLMMock = vi.fn();
const hydrateConversationToStoreMock = vi.fn();
const toastMessageMock = vi.fn();
const toastErrorMock = vi.fn();

// Mutable chat-store state so tests can simulate the "project not yet
// loaded" race that motivated the readiness gate.
let chatStoreState: { activeProjectId: string | null; activeConversationId: string | null } = {
  activeProjectId: 'proj_123',
  activeConversationId: 'conv_123',
};

vi.mock('@/commands/yops/extractionWorker', () => ({
  runExtraction: (...args: unknown[]) => runExtractionMock(...args),
}));

vi.mock('@/commands/yops/llmAdapter', () => ({
  callExtractionLLM: (...args: unknown[]) => callExtractionLLMMock(...args),
}));

vi.mock('@/hooks/conversations/hydrateConversationToStore', () => ({
  hydrateConversationToStore: (...args: unknown[]) => hydrateConversationToStoreMock(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    message: (...args: unknown[]) => toastMessageMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

vi.mock('@/store/chatStore', () => ({
  useChatStore: Object.assign(
    (
      selector: (state: {
        activeProjectId: string | null;
        activeConversationId: string | null;
      }) => unknown
    ) => selector(chatStoreState),
    {
      getState: () => chatStoreState,
    }
  ),
}));

import { useExtraction } from '@/hooks/drafts/useExtraction';
import { useWorkspaceStore } from '@/store/workspaceStore';

describe('useExtraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatStoreState = {
      activeProjectId: 'proj_123',
      activeConversationId: 'conv_123',
    };
    useWorkspaceStore.getState().reset();
    useWorkspaceStore.getState().setTurns([{ turn_hash: 'sha256:t1', content: 'hello' }]);
    runExtractionMock.mockImplementation(
      async ({ llm }: { llm: (input: unknown) => Promise<unknown> }) => {
        await llm({
          turns: [{ turn_hash: 'sha256:t1', content: 'hello' }],
          failingOps: undefined,
        });
      }
    );
    callExtractionLLMMock.mockResolvedValue([]);
    hydrateConversationToStoreMock.mockResolvedValue(undefined);
  });

  it('passes the selected provider and model into the extraction LLM adapter', async () => {
    const { result } = renderHook(() =>
      useExtraction({
        resolvedConversationId: 'conv_123',
        selectedProvider: 'openai',
        selectedModel: 'gpt-4o-mini',
      })
    );

    await act(async () => {
      await result.current.handleExtract();
    });

    expect(callExtractionLLMMock).toHaveBeenCalledWith({
      conversationId: 'conv_123',
      turns: [{ turn_hash: 'sha256:t1', content: 'hello' }],
      failingOps: undefined,
      provider: 'openai',
      model: 'gpt-4o-mini',
    });
  });

  it('toasts and skips extraction when project context has not loaded yet', async () => {
    // Simulates the race where /chat/[convId] renders before
    // `useChatInit.fetchConversationMeta` backfills `activeProjectId`.
    // ChatHeader gates the button on this state, but a programmatic
    // event/hotkey could still fire — we want a visible failure mode,
    // not a silent no-op the user has to click through twice.
    chatStoreState = { activeProjectId: null, activeConversationId: 'conv_123' };

    const { result } = renderHook(() =>
      useExtraction({
        resolvedConversationId: 'conv_123',
        selectedProvider: 'openai',
        selectedModel: 'gpt-4o-mini',
      })
    );

    await act(async () => {
      await result.current.handleExtract();
    });

    expect(toastMessageMock).toHaveBeenCalledWith(
      'Loading conversation context — try Extract again in a moment.'
    );
    expect(runExtractionMock).not.toHaveBeenCalled();
    expect(callExtractionLLMMock).not.toHaveBeenCalled();
  });
});
