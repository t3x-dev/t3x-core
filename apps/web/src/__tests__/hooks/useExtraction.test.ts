// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExtractionFailedError } from '@/commands/yops/errors';

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

import { applySourceTextDraftEdit } from '@/domain/sourceTextDrafts';
import { EXTRACTION_TOAST_ID, useExtraction } from '@/hooks/drafts/useExtraction';
import {
  selectPanelExpanded,
  selectScriptDirty,
  selectScriptText,
  useWorkspaceStore,
} from '@/store/workspaceStore';

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
    useWorkspaceStore.setState({
      panelExpandedByProject: {},
      activeProjectId: null,
      draftsByConversation: {},
    });
    useWorkspaceStore
      .getState()
      .setTurns([{ turn_hash: 'sha256:t1', role: 'user', content: 'hello' }]);
    runExtractionMock.mockImplementation(
      async ({ llm }: { llm: (input: unknown) => Promise<unknown> }) => {
        await llm({
          turns: [{ turn_hash: 'sha256:t1', role: 'user', content: 'hello' }],
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
      turns: [{ turn_hash: 'sha256:t1', role: 'user', content: 'hello' }],
      failingOps: undefined,
      provider: 'openai',
      model: 'gpt-4o-mini',
      // Default workspace store preset is 'balanced'. The hook always
      // forwards it now — pre-wiring, the field was missing entirely.
      preset: 'balanced',
    });
  });

  it('extracts from source-text drafts and marks overlapping ops as human inline', async () => {
    const sourceDraft = applySourceTextDraftEdit({
      baseContent: 'hello',
      input: {
        turnHash: 'sha256:t1',
        action: 'edit',
        start: 0,
        end: 5,
        selectedText: 'hello',
        replacementText: 'hello world',
      },
      now: '2026-05-07T00:00:00.000Z',
    });
    useWorkspaceStore.getState().setSourceTextDraft('sha256:t1', sourceDraft);
    runExtractionMock.mockResolvedValueOnce({
      ops: [
        {
          set: { path: 'trip/greeting', value: 'hello world' },
          source: {
            type: 'llm',
            model: 'gpt-4o-mini',
            at: '2026-04-26T00:00:00Z',
            turn_ref: {
              turn_hash: 'sha256:t1',
              quote: 'hello world',
              start_char: 0,
              end_char: 11,
            },
          },
        },
      ],
      committed: false,
    });

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

    const runArgs = runExtractionMock.mock.calls[0]?.[0] as
      | { turns?: Array<{ content: string }> }
      | undefined;
    expect(runArgs?.turns?.[0]?.content).toBe('hello world');
    expect(useWorkspaceStore.getState().draftOps[0].source).toMatchObject({
      type: 'human',
      surface: 'inline',
      author: 'Local user',
    });
  });

  it('extracts from source-text drafts even before workspace turns hydrate', async () => {
    useWorkspaceStore.getState().setTurns([]);
    const sourceDraft = applySourceTextDraftEdit({
      baseContent: 'Soccer taps into psychology.',
      input: {
        turnHash: 'sha256:t1',
        turnRole: 'assistant',
        action: 'edit',
        start: 17,
        end: 27,
        selectedText: 'psychology',
        replacementText: 'group identity',
      },
      now: '2026-05-07T00:00:00.000Z',
    });
    useWorkspaceStore.getState().setSourceTextDraft('sha256:t1', sourceDraft);
    runExtractionMock.mockResolvedValueOnce({ ops: [], committed: false });

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

    const runArgs = runExtractionMock.mock.calls[0]?.[0] as
      | { turns?: Array<{ turn_hash: string; role: string; content: string }> }
      | undefined;
    expect(runArgs?.turns).toEqual([
      {
        turn_hash: 'sha256:t1',
        role: 'assistant',
        content: 'Soccer taps into group identity.',
      },
    ]);
  });

  it('forwards the workspace store extractionPreset (concise) to callExtractionLLM', async () => {
    // The dropdown lives in ChatHeader and writes to
    // workspaceStore.extractionPreset. Before this PR, the hook never
    // read it — every Extract used the same prompt regardless of
    // Concise/Balanced/Detailed. This test pins the wire-through.
    useWorkspaceStore.getState().setExtractionPreset('concise');
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

    const callArgs = callExtractionLLMMock.mock.calls[0]?.[0] as { preset?: string } | undefined;
    expect(callArgs?.preset).toBe('concise');
  });

  it('forwards extractionPreset=detailed when the user picks detailed', async () => {
    useWorkspaceStore.getState().setExtractionPreset('detailed');
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

    const callArgs = callExtractionLLMMock.mock.calls[0]?.[0] as { preset?: string } | undefined;
    expect(callArgs?.preset).toBe('detailed');
  });

  it('forwards source pin ids to callExtractionLLM as selectedPinIds', async () => {
    const { result } = renderHook(() =>
      useExtraction({
        resolvedConversationId: 'conv_123',
        selectedProvider: 'openai',
        selectedModel: 'gpt-4o-mini',
      })
    );

    await act(async () => {
      await result.current.handleExtract(['pin_1']);
    });

    expect(callExtractionLLMMock).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedPinIds: ['pin_1'],
      })
    );
  });

  it('validates extraction against the latest workspace tree after hydration changes', async () => {
    const { result } = renderHook(() =>
      useExtraction({
        resolvedConversationId: 'conv_123',
        selectedProvider: 'openai',
        selectedModel: 'gpt-4o-mini',
      })
    );

    const hydratedTree = {
      trees: [{ key: 'trip', slots: { destination: 'Beijing' }, children: [] }],
      relations: [],
    };
    act(() => {
      useWorkspaceStore.getState().setDerived({
        tree: hydratedTree,
        sourceIndex: new Map(),
        opsLog: [
          {
            define: { path: 'trip' },
            source: {
              type: 'human',
              author: 'test',
              at: '2026-01-01T00:00:00.000Z',
              surface: 'tree',
            },
          },
        ],
      });
    });

    await act(async () => {
      await result.current.handleExtract();
    });

    const runArgs = runExtractionMock.mock.calls[0]?.[0] as
      | { baseTree?: typeof hydratedTree }
      | undefined;
    expect(runArgs?.baseTree).toBe(hydratedTree);
  });

  it('refreshes the active workspace before extraction and uses the hydrated tree as base', async () => {
    const hydratedTree = {
      trees: [{ key: 'trip', slots: { destination: 'Dali' }, children: [] }],
      relations: [],
    };
    hydrateConversationToStoreMock.mockImplementationOnce(async () => {
      useWorkspaceStore.getState().setDerived({
        tree: hydratedTree,
        sourceIndex: new Map(),
        opsLog: [
          {
            define: { path: 'trip' },
            source: {
              type: 'human',
              author: 'test',
              at: '2026-01-01T00:00:00.000Z',
              surface: 'tree',
            },
          },
        ],
      });
    });

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

    expect(hydrateConversationToStoreMock).toHaveBeenCalledWith('proj_123', 'conv_123');
    const runArgs = runExtractionMock.mock.calls[0]?.[0] as
      | { baseTree?: typeof hydratedTree }
      | undefined;
    expect(runArgs?.baseTree).toBe(hydratedTree);
  });

  it('hydrates before deciding whether there are saved turns to extract', async () => {
    useWorkspaceStore.getState().setTurns([]);
    hydrateConversationToStoreMock.mockImplementationOnce(async () => {
      useWorkspaceStore
        .getState()
        .setTurns([{ turn_hash: 'sha256:t1', role: 'user', content: 'hello after hydrate' }]);
    });

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

    expect(hydrateConversationToStoreMock).toHaveBeenCalledWith('proj_123', 'conv_123');
    expect(runExtractionMock).toHaveBeenCalled();
    const runArgs = runExtractionMock.mock.calls[0]?.[0] as
      | { turns?: Array<{ content: string }> }
      | undefined;
    expect(runArgs?.turns?.[0]?.content).toBe('hello after hydrate');
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

  it('skips extraction after the conversation is committed', async () => {
    useWorkspaceStore.getState().setCommitted(true);

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

    expect(toastMessageMock).toHaveBeenCalledWith('Committed conversations are read-only.', {
      id: EXTRACTION_TOAST_ID,
    });
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

  it('stages a draft locally without committing on success', async () => {
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

    // Preflight hydrate only refreshes the review base. The successful
    // propose-only path still does not persist anything until Apply.
    expect(hydrateConversationToStoreMock).toHaveBeenCalledWith('proj_123', 'conv_123');

    const state = useWorkspaceStore.getState();
    expect(state.hasDraft).toBe(true);
    expect(state.draftOps).toHaveLength(1);
    expect(state.draftTree).not.toBeNull();
    // Script editor is populated with the proposal so the user can edit
    // before Apply.
    expect(selectScriptText(state).length).toBeGreaterThan(0);
    // The script is the canonical proposal, not a user edit — Apply gates
    // on `scriptDirty || hasDraft`, so we keep dirty=false here.
    expect(selectScriptDirty(state)).toBe(false);

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
    useWorkspaceStore.getState().setEditorOverride(dirtyEdit);
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
    expect(selectScriptText(state)).toBe(dirtyEdit);
    expect(selectScriptDirty(state)).toBe(true);
    expect(state.hasDraft).toBe(false);
  });

  it('proceeds (and overwrites) when the user accepts the overwrite confirm', async () => {
    useWorkspaceStore.getState().setEditorOverride('user dirty edit');
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
    expect(selectScriptText(state)).not.toBe('user dirty edit');
    // Re-extract clears scriptDirty since the canonical proposal replaces
    // the user's edit.
    expect(selectScriptDirty(state)).toBe(false);
    expect(state.hasDraft).toBe(true);
  });

  it('staged draft survives a reset + hydrate cycle (F5 protection)', async () => {
    // End-to-end of the per-conversation persistence layer:
    //   1. Extract → setDraft writes to draftsByConversation[conv_123].
    //   2. reset() simulates the in-memory wipe a refresh causes (the
    //      persisted map survives via zustand persist).
    //   3. hydrateConversationToStore-equivalent rewrites tree +
    //      conversationId, then restoreDraftFor(conv_123) reapplies
    //      the staged draft on top.
    // We exercise the store-level contract here; the actual
    // hydrateConversationToStore call site has its own coverage.
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

    // Snapshot the persisted draft, then nuke in-memory state to mimic
    // the page reload.
    const persistedBefore = useWorkspaceStore.getState().draftsByConversation.conv_123;
    expect(persistedBefore).toBeDefined();
    expect(persistedBefore.ops.length).toBeGreaterThan(0);

    useWorkspaceStore.getState().reset();
    expect(useWorkspaceStore.getState().hasDraft).toBe(false);
    expect(useWorkspaceStore.getState().draftsByConversation.conv_123).toBeDefined();

    // Mimic hydrate: set conversation + tree, then restoreDraftFor.
    useWorkspaceStore.getState().setConversation('conv_123');
    const restored = useWorkspaceStore.getState().restoreDraftFor('conv_123');
    expect(restored).toBe(true);

    const after = useWorkspaceStore.getState();
    expect(after.hasDraft).toBe(true);
    expect(after.draftOps).toEqual(persistedBefore.ops);
    expect(after.editorOverride).toBe(persistedBefore.editorOverride);
    expect(after.draftTree).not.toBeNull();
  });

  it('blocks extraction while a draft is staged', async () => {
    const stagedOps = [
      {
        set: { path: 'old', value: 'proposal' },
        source: {
          type: 'llm' as const,
          model: 'gpt-4o-mini',
          at: '2026-04-26T00:00:00Z',
          turn_ref: { turn_hash: 'sha256:t1', quote: 'old' },
        },
      },
    ];
    useWorkspaceStore.getState().setDraft({
      ops: stagedOps as never,
      tree: { trees: [], relations: [] },
    });
    useWorkspaceStore.getState().clearEditorOverride();
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

    const state = useWorkspaceStore.getState();
    expect(confirmOverwrite).not.toHaveBeenCalled();
    expect(runExtractionMock).not.toHaveBeenCalled();
    expect(state.hasDraft).toBe(true);
    expect(state.draftOps).toEqual(stagedOps);
    expect(selectScriptText(state)).toContain('old');
    expect(toastMessageMock).toHaveBeenCalledWith(
      'Apply or discard the staged draft before extracting again.',
      { id: EXTRACTION_TOAST_ID }
    );
  });

  it('blocks a staged draft before prompting about dirty editor text', async () => {
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
    useWorkspaceStore.getState().setEditorOverride('user-edited dirty YAML');
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

    const state = useWorkspaceStore.getState();
    expect(confirmOverwrite).not.toHaveBeenCalled();
    expect(runExtractionMock).not.toHaveBeenCalled();
    expect(selectScriptText(state)).toBe('user-edited dirty YAML');
    expect(selectScriptDirty(state)).toBe(true);
    expect(state.hasDraft).toBe(true);
  });

  it('falls back to lastError (no retainedDraftFailure) when there is no prior draft', async () => {
    // Inverse case: a first-ever Extract that fails has no draft to
    // retain, so the historic surfaces (centered empty-state error,
    // ScriptEditor banner) still apply. This test exists to make sure
    // PR-B doesn't accidentally suppress those by routing every
    // failure through retainedDraftFailure.
    runExtractionMock.mockRejectedValueOnce(
      new ExtractionFailedError([], 1, 'llm_error', 'LLM call failed')
    );

    const { result } = renderHook(() =>
      useExtraction({
        resolvedConversationId: 'conv_123',
        selectedProvider: 'openai',
        selectedModel: 'gpt-5.4-mini',
      })
    );

    await act(async () => {
      await result.current.handleExtract();
    });

    const state = useWorkspaceStore.getState();
    expect(state.hasDraft).toBe(false);
    expect(state.lastError).toContain('LLM call failed');
    expect(state.retainedDraftFailure).toBeNull();
  });

  it('shows provider auth guidance when the selected provider rejects the key', async () => {
    runExtractionMock.mockRejectedValueOnce(
      new ExtractionFailedError([], 1, 'provider_auth', 'Provider authentication failed')
    );

    const { result } = renderHook(() =>
      useExtraction({
        resolvedConversationId: 'conv_123',
        selectedProvider: 'openai',
        selectedModel: 'gpt-5.4-mini',
      })
    );

    await act(async () => {
      await result.current.handleExtract();
    });

    const expected =
      'Provider key was rejected. Open Provider settings, update or remove the key, then test it again.';
    expect(useWorkspaceStore.getState().lastError).toBe(expected);
    expect(toastErrorMock).toHaveBeenCalledWith(expected, { id: EXTRACTION_TOAST_ID });
  });

  it('a confirm-accepted dirty edit clears the editor when no prior draft is staged', async () => {
    // Companion to the previous case: same consent, no prior draft.
    // The editor must reset to empty (not stay on the dirty text)
    // and scriptDirty must be false. With no draft to apply and
    // scriptText empty, Apply stays disabled — coherent failure.
    useWorkspaceStore.getState().setEditorOverride('user-edited dirty YAML');

    runExtractionMock.mockRejectedValueOnce(new ExtractionFailedError([], 1, 'llm_error', 'fail'));

    const confirmOverwrite = vi.fn().mockReturnValue(true);
    const { result } = renderHook(() =>
      useExtraction({
        resolvedConversationId: 'conv_123',
        selectedProvider: 'openai',
        selectedModel: 'gpt-5.4-mini',
        confirmOverwrite,
      })
    );

    await act(async () => {
      await result.current.handleExtract();
    });

    const state = useWorkspaceStore.getState();
    expect(selectScriptText(state)).toBe('');
    expect(selectScriptDirty(state)).toBe(false);
    expect(state.hasDraft).toBe(false);
    // No prior draft → falls through to the lastError channel, not
    // retainedDraftFailure.
    expect(state.lastError).toContain('fail');
    expect(state.retainedDraftFailure).toBeNull();
  });
});
