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
    useWorkspaceStore.setState({
      panelExpandedByProject: {},
      activeProjectId: null,
      draftsByConversation: {},
    });
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
      // Default workspace store preset is 'balanced'. The hook always
      // forwards it now — pre-wiring, the field was missing entirely.
      preset: 'balanced',
    });
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
    expect(after.scriptText).toBe(persistedBefore.scriptText);
    expect(after.draftTree).not.toBeNull();
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

  it('preserves the prior draft and writes retainedDraftFailure when re-extract fails', async () => {
    // PR-B contract (supersedes the PR #903 "clear stale draft" test):
    //   The original behaviour pre-emptively cleared the staged draft
    //   before the LLM call so a stale draft could never sit under a
    //   fresh error. After #906 turned server failures into hard
    //   terminal results, that pre-emptive clear meant every failed
    //   re-extract silently destroyed the user's previous successful
    //   proposal — concrete data loss in the visible refactor path
    //   (real conv_51205437: Google succeeds → switch to GPT mini /
    //   Concise → unverifiable_quote → previous Google draft gone).
    //
    //   PR-B inverts the policy: the previous draft survives, and a
    //   structured `retainedDraftFailure` marker drives AfterPanel's
    //   "Previous draft retained" header + persistent error row so the
    //   Apply button is unambiguous.
    const stagedOps = [
      {
        set: { path: 'old/proposal', value: 'stale' },
        source: {
          type: 'llm' as const,
          model: 'gpt-4o-mini',
          at: '2026-04-26T00:00:00Z',
          turn_ref: { turn_hash: 'sha256:t1', quote: 'stale' },
        },
      },
    ];
    const stagedScript = 'yops:\n  - set:\n      path: old/proposal\n      value: stale\n';
    const stagedTree = { trees: [], relations: [] };
    useWorkspaceStore.getState().setDraft({ ops: stagedOps as never, tree: stagedTree });
    useWorkspaceStore.getState().setScriptText(stagedScript);
    useWorkspaceStore.getState().setScriptDirty(false);
    useWorkspaceStore.getState().setExtractionPreset('concise');

    runExtractionMock.mockRejectedValueOnce(
      new ExtractionFailedError(
        [
          {
            opIndex: 0,
            reason: 'quote_not_found',
            turnHash: 'sha256:t1',
            quote: 'not in conversation',
          },
        ],
        2,
        'unverifiable_quote'
      )
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
    // Draft survives — same ops, same preview tree, same script.
    expect(state.hasDraft).toBe(true);
    expect(state.draftOps).toEqual(stagedOps);
    expect(state.scriptText).toBe(stagedScript);
    expect(state.draftsByConversation.conv_123).toBeDefined();

    // The two error channels are intentionally non-overlapping. Setting
    // both would render the same string in two surfaces.
    expect(state.lastError).toBeNull();
    expect(state.retainedDraftFailure).not.toBeNull();
    expect(state.retainedDraftFailure?.message).toContain('Extraction could not verify 1 slot');
    // Provider / model / preset captured at attempt time so the panel
    // header can read "Last extract failed (openai · gpt-5.4-mini ·
    // Concise)" instead of an opaque "extraction failed".
    expect(state.retainedDraftFailure?.provider).toBe('openai');
    expect(state.retainedDraftFailure?.model).toBe('gpt-5.4-mini');
    expect(state.retainedDraftFailure?.preset).toBe('concise');
    expect(typeof state.retainedDraftFailure?.at).toBe('string');
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

  it('forwards typed reason + failureCode into retainedDraftFailure', async () => {
    // P2 from the #915 review: the structured diagnostic fields on
    // ExtractionFailedError must reach retainedDraftFailure so future
    // UI / telemetry can branch on the *kind* of failure without
    // regex-parsing the rendered message.
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

    runExtractionMock.mockRejectedValueOnce(
      new ExtractionFailedError([], 2, 'unverifiable_quote', 'msg', 'unverifiable_quote')
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

    const failure = useWorkspaceStore.getState().retainedDraftFailure;
    expect(failure?.reason).toBe('unverifiable_quote');
    expect(failure?.failureCode).toBe('unverifiable_quote');
  });

  it('a confirm-accepted dirty edit does not survive an extraction failure with a retained draft', async () => {
    // P1 from the #915 review: pre-flight `setScriptDirty(false)` used
    // to run while `scriptText` still held the user's dirty YAML.
    // Confirm-accepted + Extract-failure left the editor showing OLD
    // user text with `scriptDirty=false`, so:
    //   - Apply (gated on scriptDirty || hasDraft) ignored the visible
    //     edits even though they were on screen, and
    //   - if a prior draft was retained, Apply parsed user YAML that
    //     no longer matched the panel's "Previous draft" rendering.
    //
    // Fix: when the user accepts the overwrite, the editor is reset
    // pre-flight to the canonical mirror of whatever the panel will
    // continue to show — prior draft YAML if a draft is staged. The
    // success branch then overwrites with the new proposal; the
    // failure branch leaves the canonical mirror in place. Either way
    // scriptText agrees with what AfterPanel renders.
    const stagedOps = [
      {
        define: { path: 'tradeoffs/storage' },
        source: {
          type: 'llm' as const,
          model: 'gpt-4o-mini',
          at: '2026-04-26T00:00:00Z',
          turn_ref: { turn_hash: 'sha256:t1', quote: 'storage' },
        },
      },
    ];
    useWorkspaceStore
      .getState()
      .setDraft({ ops: stagedOps as never, tree: { trees: [], relations: [] } });
    useWorkspaceStore.getState().setScriptText('user-edited dirty YAML');
    useWorkspaceStore.getState().setScriptDirty(true);

    runExtractionMock.mockRejectedValueOnce(
      new ExtractionFailedError([], 2, 'llm_error', 'transient error')
    );

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
    // Confirm was honoured: the dirty user text is gone and the flag
    // is clean. No half-cleared "text still here, dirty falsely false".
    expect(state.scriptText).not.toBe('user-edited dirty YAML');
    expect(state.scriptDirty).toBe(false);
    // The retained-draft path stays coherent: the editor mirrors the
    // prior draft serialization, which is exactly what the panel's
    // "Previous draft" rendering shows. Apply parses this — same
    // semantics as the panel.
    expect(state.scriptText).toContain('tradeoffs/storage');
    expect(state.hasDraft).toBe(true);
    expect(state.retainedDraftFailure).not.toBeNull();
  });

  it('a confirm-accepted dirty edit clears the editor when no prior draft is staged', async () => {
    // Companion to the previous case: same consent, no prior draft.
    // The editor must reset to empty (not stay on the dirty text)
    // and scriptDirty must be false. With no draft to apply and
    // scriptText empty, Apply stays disabled — coherent failure.
    useWorkspaceStore.getState().setScriptText('user-edited dirty YAML');
    useWorkspaceStore.getState().setScriptDirty(true);

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
    expect(state.scriptText).toBe('');
    expect(state.scriptDirty).toBe(false);
    expect(state.hasDraft).toBe(false);
    // No prior draft → falls through to the lastError channel, not
    // retainedDraftFailure.
    expect(state.lastError).toContain('fail');
    expect(state.retainedDraftFailure).toBeNull();
  });
});
