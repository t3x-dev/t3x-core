// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runExtractionMock = vi.fn();
const callExtractionLLMMock = vi.fn();
const hydrateConversationToStoreMock = vi.fn();
const toastMessageMock = vi.fn();
const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastDismissMock = vi.fn();

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
    success: (...args: unknown[]) => toastSuccessMock(...args),
    dismiss: (...args: unknown[]) => toastDismissMock(...args),
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

import { EXTRACTION_TOAST_ID, useExtraction } from '@/hooks/drafts/useExtraction';
import { selectPanelExpanded, useWorkspaceStore } from '@/store/workspaceStore';

describe('useExtraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatStoreState = {
      activeProjectId: 'proj_123',
      activeConversationId: 'conv_123',
    };
    useWorkspaceStore.getState().reset();
    // Wipe per-project preference + active project so every test starts from
    // the same blank slate (otherwise persist would leak panelExpanded
    // between cases).
    useWorkspaceStore.setState({ panelExpandedByProject: {}, activeProjectId: null });
    useWorkspaceStore.getState().setTurns([{ turn_hash: 'sha256:t1', content: 'hello' }]);
    runExtractionMock.mockImplementation(
      async ({ llm }: { llm: (input: unknown) => Promise<unknown> }) => {
        await llm({
          turns: [{ turn_hash: 'sha256:t1', content: 'hello' }],
          failingOps: undefined,
        });
        // Propose-only model: worker returns validated ops; hook writes them
        // into the workspace as a draft and waits for user Apply.
        return {
          ops: [
            {
              set: { path: 'trip/budget', value: 'ten thousand dollars' },
              source: {
                type: 'llm',
                model: 'gpt-4o-mini',
                at: '2026-04-26T00:00:00Z',
                turn_ref: { turn_hash: 'sha256:t1', quote: 'ten thousand dollars' },
              },
            },
          ],
          committed: false,
        };
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
      'Loading conversation context — try Extract again in a moment.',
      { id: EXTRACTION_TOAST_ID }
    );
    expect(runExtractionMock).not.toHaveBeenCalled();
    expect(callExtractionLLMMock).not.toHaveBeenCalled();
  });

  it('dismisses any prior extraction toast at the start of a new attempt', async () => {
    // The bug this guards against: a prior failed Extract leaves a red
    // sonner toast on screen; a later successful Extract rehydrates the
    // tree but the stale red toast remains, making the user think the
    // second extraction also failed. Dismissing the stable slot at the
    // start guarantees the next emit (success/error/info) is the only
    // toast the user sees for this attempt.
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

    expect(toastDismissMock).toHaveBeenCalledWith(EXTRACTION_TOAST_ID);
    // dismiss must run before any new emit on the same slot.
    const dismissCallOrder = toastDismissMock.mock.invocationCallOrder[0];
    const successCallOrder = toastSuccessMock.mock.invocationCallOrder[0];
    expect(dismissCallOrder).toBeLessThan(successCallOrder);
  });

  it('stages a draft locally without hydrating or committing on success', async () => {
    // Propose-only model: a successful Extract writes a draft to the
    // workspace store (ops + scriptText + dry-run preview tree) but does
    // NOT hit the server's hydrate path because nothing has been
    // committed yet. The user reviews and clicks Apply to persist.
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

    // No hydrate — server state is unchanged on the propose-only path.
    expect(hydrateConversationToStoreMock).not.toHaveBeenCalled();

    const state = useWorkspaceStore.getState();
    expect(state.hasDraft).toBe(true);
    expect(state.draftOps).toHaveLength(1);
    expect(state.draftTree).not.toBeNull();
    // Script editor is populated with the proposal so the user can edit
    // before Apply.
    expect(state.scriptText.length).toBeGreaterThan(0);
    // The script is the canonical proposal, not a user edit — Apply gates
    // on `scriptDirty || hasDraft`, so we keep dirty=false here.
    expect(state.scriptDirty).toBe(false);

    expect(toastSuccessMock).toHaveBeenCalledWith(
      expect.stringContaining('Extracted 1 op'),
      expect.objectContaining({ id: EXTRACTION_TOAST_ID })
    );
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('passes commit:false to runExtraction so the worker never writes yops_log', async () => {
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

    expect(runExtractionMock).toHaveBeenCalledWith(expect.objectContaining({ commit: false }));
  });

  it('expands the workspace even if workspaceStore.activeProjectId has not synced yet', async () => {
    // Regression: ConversationPage mirrors chatStore.activeProjectId into
    // workspaceStore via useEffect. There is a render where chatStore is
    // ready (Extract is enabled) but workspaceStore.activeProjectId is
    // still null — setPanelExpanded would no-op against the unsynced map
    // and the user's explicit Extract click would silently leave the
    // panel folded. handleExtract pre-syncs activeProjectId for this
    // exact reason.
    expect(useWorkspaceStore.getState().activeProjectId).toBeNull();

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

    const state = useWorkspaceStore.getState();
    expect(state.activeProjectId).toBe('proj_123');
    expect(selectPanelExpanded(state)).toBe(true);
    expect(state.panelExpandedByProject.proj_123).toBe(true);
  });

  it('blocks Extract when scriptDirty is true and the user declines the overwrite confirm', async () => {
    // P2 regression: in the propose-only model the script editor is the
    // review surface, so re-extracting on top of dirty manual edits would
    // silently destroy the user's YAML. handleExtract must surface a
    // confirm and bail when the user declines.
    const dirtyEdit = `yops:\n  - set:\n      path: trip/budget\n      value: ten thousand dollars  # my edit\n`;
    useWorkspaceStore.getState().setScriptText(dirtyEdit);
    useWorkspaceStore.getState().setScriptDirty(true);
    const confirmOverwrite = vi.fn().mockReturnValue(false);

    const { result } = renderHook(() =>
      useExtraction({
        resolvedConversationId: 'conv_123',
        selectedProvider: 'openai',
        selectedModel: 'gpt-4o-mini',
        confirmOverwrite,
      })
    );

    await act(async () => {
      await result.current.handleExtract();
    });

    expect(confirmOverwrite).toHaveBeenCalled();
    // Worker not invoked, dirty edit preserved verbatim.
    expect(runExtractionMock).not.toHaveBeenCalled();
    const state = useWorkspaceStore.getState();
    expect(state.scriptText).toBe(dirtyEdit);
    expect(state.scriptDirty).toBe(true);
    expect(state.hasDraft).toBe(false);
  });

  it('proceeds (and overwrites) when the user accepts the overwrite confirm', async () => {
    useWorkspaceStore.getState().setScriptText('user dirty edit');
    useWorkspaceStore.getState().setScriptDirty(true);
    const confirmOverwrite = vi.fn().mockReturnValue(true);

    const { result } = renderHook(() =>
      useExtraction({
        resolvedConversationId: 'conv_123',
        selectedProvider: 'openai',
        selectedModel: 'gpt-4o-mini',
        confirmOverwrite,
      })
    );

    await act(async () => {
      await result.current.handleExtract();
    });

    expect(confirmOverwrite).toHaveBeenCalled();
    expect(runExtractionMock).toHaveBeenCalled();
    const state = useWorkspaceStore.getState();
    expect(state.scriptText).not.toBe('user dirty edit');
    // Re-extract clears scriptDirty since the canonical proposal replaces
    // the user's edit.
    expect(state.scriptDirty).toBe(false);
    expect(state.hasDraft).toBe(true);
  });

  it('does not prompt when scriptDirty is false (replacing a previous draft is fine)', async () => {
    // Replacing a previous LLM proposal with a fresh one is the natural
    // retry flow — no confirm needed. Only dirty manual edits trigger
    // the prompt.
    useWorkspaceStore.getState().setDraft({
      ops: [
        {
          set: { path: 'old', value: 'proposal' },
          source: {
            type: 'llm' as const,
            model: 'gpt-4o-mini',
            at: '2026-04-26T00:00:00Z',
            turn_ref: { turn_hash: 'sha256:t1', quote: 'old' },
          },
        },
      ] as never,
      tree: { trees: [], relations: [] },
    });
    useWorkspaceStore.getState().setScriptDirty(false);
    const confirmOverwrite = vi.fn().mockReturnValue(false);

    const { result } = renderHook(() =>
      useExtraction({
        resolvedConversationId: 'conv_123',
        selectedProvider: 'openai',
        selectedModel: 'gpt-4o-mini',
        confirmOverwrite,
      })
    );

    await act(async () => {
      await result.current.handleExtract();
    });

    expect(confirmOverwrite).not.toHaveBeenCalled();
    expect(runExtractionMock).toHaveBeenCalled();
  });
});
