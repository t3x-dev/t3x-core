// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const commitOpsMock = vi.fn();
const hydrateMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock('@/commands/yops/yopsService', () => ({
  commitOps: (...args: unknown[]) => commitOpsMock(...args),
}));

vi.mock('@/hooks/conversations/hydrateConversationToStore', () => ({
  hydrateConversationToStore: (...args: unknown[]) => hydrateMock(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

const chatStoreState = { activeProjectId: 'proj_abc' as string | null };
vi.mock('@/store/chatStore', () => ({
  useChatStore: Object.assign(() => undefined, {
    getState: () => chatStoreState,
  }),
}));

import { useScriptExecution } from '@/hooks/drafts/useScriptExecution';
import { useWorkspaceStore } from '@/store/workspaceStore';

describe('useScriptExecution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.getState().reset();
    useWorkspaceStore.setState({
      panelExpandedByProject: {},
      activeProjectId: null,
      draftsByConversation: {},
    });
    useWorkspaceStore.getState().setConversation('conv_xyz');
    chatStoreState.activeProjectId = 'proj_abc';
    commitOpsMock.mockResolvedValue({ id: 'yl_1' });
    hydrateMock.mockResolvedValue(undefined);
  });

  it('disables Apply when there is no draft and no manual edit', () => {
    // Idle state: nothing un-applied, script mirrors committed yops_log.
    useWorkspaceStore.getState().setScriptDirty(false);
    expect(useWorkspaceStore.getState().hasDraft).toBe(false);
    const { result } = renderHook(() => useScriptExecution());
    expect(result.current.canRun).toBe(false);
    expect(result.current.disabledReason).toBe('No script edits to apply');
  });

  it('enables Apply after a manual edit flips scriptDirty', () => {
    useWorkspaceStore.getState().setScriptText('yops:\n  - {set: {path: foo, value: bar}}');
    useWorkspaceStore.getState().setScriptDirty(true);
    const { result } = renderHook(() => useScriptExecution());
    expect(result.current.canRun).toBe(true);
    expect(result.current.disabledReason).toBeNull();
  });

  describe('committed-mirror gate (PR-D: blank-dirty-script coherence)', () => {
    // The mirror effect writes `serializeOpsToYaml(opsLog) → scriptText`
    // when no draft is staged. The pre-PR-D gate skipped any time
    // `scriptDirty` was true, even when the dirty content was empty.
    // That allowed an in-session state where:
    //   hasDraft=false, opsLog.length>0, scriptDirty=true, scriptText=''
    // left the editor blank while AfterPanel rendered the committed
    // result — a UI coherence violation, fixable without compromising
    // protection of real manual edits.
    const sampleOps = [
      {
        set: { path: 'trip/dest', value: 'HZ' },
        source: {
          type: 'llm' as const,
          model: 'gpt-4o-mini',
          at: '2026-04-26T00:00:00Z',
          turn_ref: { turn_hash: 'sha256:t1', quote: 'HZ' },
        },
      },
    ];

    function seedCommitted(ops: typeof sampleOps): void {
      useWorkspaceStore.getState().setDerived({
        tree: { trees: [], relations: [] },
        sourceIndex: new Map(),
        opsLog: ops as never,
      });
    }

    it('repopulates Script from committed ops when scriptDirty is set but scriptText is blank', () => {
      // The exact incoherent state the PR is targeting. Mirror should
      // run, write the YAML, AND clear the stale scriptDirty flag (an
      // empty dirty marker isn't meaningful manual content to preserve).
      seedCommitted(sampleOps);
      useWorkspaceStore.getState().setScriptText('');
      useWorkspaceStore.getState().setScriptDirty(true);

      renderHook(() => useScriptExecution());

      const s = useWorkspaceStore.getState();
      expect(s.scriptText).toContain('trip/dest');
      expect(s.scriptText).toContain('HZ');
      expect(s.scriptDirty).toBe(false);
    });

    it('repopulates Script when scriptDirty is set with whitespace-only text', () => {
      // `trim() === ''` matches whitespace too — a stray newline or
      // space character isn't a meaningful edit either.
      seedCommitted(sampleOps);
      useWorkspaceStore.getState().setScriptText('   \n\n  ');
      useWorkspaceStore.getState().setScriptDirty(true);

      renderHook(() => useScriptExecution());

      const s = useWorkspaceStore.getState();
      expect(s.scriptText).toContain('trip/dest');
      expect(s.scriptDirty).toBe(false);
    });

    it('does NOT overwrite a non-empty dirty script (real manual edit protected)', () => {
      // The load-bearing inverse: if the user has actually typed
      // something, the mirror MUST stay out of the way. This is what
      // the original gate was protecting and is not changing.
      seedCommitted(sampleOps);
      useWorkspaceStore
        .getState()
        .setScriptText('yops:\n  - set:\n      path: user/edit\n      value: keep\n');
      useWorkspaceStore.getState().setScriptDirty(true);

      renderHook(() => useScriptExecution());

      const s = useWorkspaceStore.getState();
      expect(s.scriptText).toContain('user/edit');
      expect(s.scriptText).not.toContain('trip/dest');
      expect(s.scriptDirty).toBe(true);
    });

    it('mirrors when scriptDirty is false and scriptText is empty (existing path)', () => {
      // Preserves the steady-state mirror: clean script, committed ops
      // present → write the YAML.
      seedCommitted(sampleOps);
      useWorkspaceStore.getState().setScriptText('');
      useWorkspaceStore.getState().setScriptDirty(false);

      renderHook(() => useScriptExecution());

      const s = useWorkspaceStore.getState();
      expect(s.scriptText).toContain('trip/dest');
      expect(s.scriptDirty).toBe(false);
    });

    it('skips when hasDraft is true regardless of dirty/empty state', () => {
      // Draft owns the script via useExtraction's setDraft path; the
      // mirror must never step on it. Even if the script is somehow
      // empty (a bug elsewhere), we don't reach in here — the failure
      // surfaces through the dedicated retained-draft / Apply path
      // instead.
      useWorkspaceStore.getState().setDraft({
        ops: sampleOps as never,
        tree: { trees: [], relations: [] },
      });
      // setDraft populates the per-conversation snapshot, but does NOT
      // write scriptText — useExtraction does that on success. Force
      // the empty-script state directly.
      useWorkspaceStore.getState().setScriptText('');
      useWorkspaceStore.getState().setScriptDirty(true);
      // Seed committed ops in addition to the draft to make the test
      // distinguish from "no committed history" cases.
      useWorkspaceStore.getState().setDerived({
        tree: { trees: [], relations: [] },
        sourceIndex: new Map(),
        opsLog: sampleOps as never,
      });

      renderHook(() => useScriptExecution());

      const s = useWorkspaceStore.getState();
      expect(s.scriptText).toBe('');
      expect(s.scriptDirty).toBe(true);
    });

    it('is a no-op when committed opsLog is empty (nothing to mirror)', () => {
      // No committed history to mirror means there's no canonical
      // YAML to write — leave whatever state the editor is in alone.
      useWorkspaceStore.getState().setScriptText('');
      useWorkspaceStore.getState().setScriptDirty(true);

      renderHook(() => useScriptExecution());

      const s = useWorkspaceStore.getState();
      expect(s.scriptText).toBe('');
      expect(s.scriptDirty).toBe(true);
    });
  });

  it('enables Apply when Extract has staged a draft (scriptDirty stays false)', () => {
    // Propose-only Extract: useExtraction calls setDraft({ ops, tree })
    // and leaves scriptDirty=false because the script is the canonical
    // proposal, not a user edit. Apply must still be enabled — that's the
    // whole point of the two-step flow.
    useWorkspaceStore.getState().setDraft({
      ops: [
        {
          set: { path: 'trip/dest', value: 'HZ' },
          source: {
            type: 'llm',
            model: 'gpt-4o-mini',
            at: '2026-04-26T00:00:00Z',
            turn_ref: { turn_hash: 'sha256:t1', quote: 'HZ' },
          },
        },
      ] as never,
      tree: { trees: [], relations: [] },
    });
    useWorkspaceStore
      .getState()
      .setScriptText(`yops:\n  - set:\n      path: trip/dest\n      value: HZ\n`);
    useWorkspaceStore.getState().setScriptDirty(false);

    const { result } = renderHook(() => useScriptExecution());
    expect(result.current.canRun).toBe(true);
    expect(result.current.disabledReason).toBeNull();
  });

  it('execute unwraps the `yops:` envelope before parsing', async () => {
    // serializeOpsToYaml writes `{yops: [...]}`. parseYOpsYaml from the
    // package only accepts a top-level array. The hook must unwrap so the
    // editor's canonical wire format round-trips.
    useWorkspaceStore
      .getState()
      .setScriptText(`yops:\n  - set:\n      path: trip/dest\n      value: HZ\n`);
    useWorkspaceStore.getState().setScriptDirty(true);

    const { result } = renderHook(() => useScriptExecution());
    await act(async () => {
      await result.current.execute();
    });

    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(commitOpsMock).toHaveBeenCalledTimes(1);
    const [convId, ops] = commitOpsMock.mock.calls[0];
    expect(convId).toBe('conv_xyz');
    expect(Array.isArray(ops)).toBe(true);
    expect(ops).toHaveLength(1);
    expect((ops[0] as { source?: { type?: string } }).source?.type).toBe('human');
  });

  it('execute accepts a top-level array (manual edit without envelope)', async () => {
    useWorkspaceStore.getState().setScriptText(`- set:\n    path: trip/dest\n    value: HZ\n`);
    useWorkspaceStore.getState().setScriptDirty(true);

    const { result } = renderHook(() => useScriptExecution());
    await act(async () => {
      await result.current.execute();
    });

    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(commitOpsMock).toHaveBeenCalledTimes(1);
  });

  it('passes replaceActiveLLMDraft: true to commitOps when applying a staged Extract draft', async () => {
    // Root-cause fix for the "re-extract piles up duplicate suggestions"
    // symptom: backend already supports replace_active_llm_draft to
    // supersede prior active LLM drafts atomically, but web's commitOps
    // call chain was dropping the flag. Apply on a staged draft must
    // tell the API to replace the prior LLM suggestion.
    useWorkspaceStore.getState().setDraft({
      ops: [
        {
          set: { path: 'trip/dest', value: 'HZ' },
          source: {
            type: 'llm',
            model: 'gpt-4o-mini',
            at: '2026-04-26T00:00:00Z',
            turn_ref: { turn_hash: 'sha256:t1', quote: 'HZ' },
          },
        },
      ] as never,
      tree: { trees: [{ key: 'trip', slots: { dest: 'HZ' }, children: [] }], relations: [] },
    });
    useWorkspaceStore
      .getState()
      .setScriptText(`yops:\n  - set:\n      path: trip/dest\n      value: HZ\n`);
    // scriptDirty stays false — the script is the canonical proposal,
    // not a user edit. hasDraft alone enables Apply.
    useWorkspaceStore.getState().setScriptDirty(false);

    const { result } = renderHook(() => useScriptExecution());
    await act(async () => {
      await result.current.execute();
    });

    expect(commitOpsMock).toHaveBeenCalledTimes(1);
    const [, , options] = commitOpsMock.mock.calls[0];
    expect(options).toEqual({ replaceActiveLLMDraft: true });
  });

  it('passes replaceActiveLLMDraft: false on a manual-edit Apply (no staged draft)', async () => {
    // Hand-written script edits shouldn't supersede a separate LLM
    // suggestion the user might still want — manual edits append, LLM
    // re-extract replaces. The flag is exclusively driven by hasDraft.
    useWorkspaceStore.getState().setScriptText(`- set:\n    path: trip/dest\n    value: HZ\n`);
    useWorkspaceStore.getState().setScriptDirty(true);
    expect(useWorkspaceStore.getState().hasDraft).toBe(false);

    const { result } = renderHook(() => useScriptExecution());
    await act(async () => {
      await result.current.execute();
    });

    expect(commitOpsMock).toHaveBeenCalledTimes(1);
    const [, , options] = commitOpsMock.mock.calls[0];
    expect(options).toEqual({ replaceActiveLLMDraft: false });
  });

  it('execute() refuses to commit when there is no draft and no manual edit', async () => {
    // Defense in depth: the Apply button is disabled in this state, but
    // execute() may be reached via hotkeys, tests, or programmatic calls.
    // Without `hasDraft || scriptDirty`, the script is just a mirror of
    // committed state — re-applying would duplicate the ops in yops_log.
    useWorkspaceStore
      .getState()
      .setScriptText(`yops:\n  - set:\n      path: trip/dest\n      value: HZ\n`);
    useWorkspaceStore.getState().setScriptDirty(false);
    expect(useWorkspaceStore.getState().hasDraft).toBe(false);

    const { result } = renderHook(() => useScriptExecution());
    await act(async () => {
      await result.current.execute();
    });

    expect(commitOpsMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('execute() refuses to commit while extraction is streaming', async () => {
    // Same defense for the in-flight states. canRun gates the button on
    // `mode !== streaming && mode !== committing`; mirror it inside
    // execute() so a fast double-trigger can't slip through.
    useWorkspaceStore
      .getState()
      .setScriptText(`yops:\n  - set:\n      path: trip/dest\n      value: HZ\n`);
    useWorkspaceStore.getState().setScriptDirty(true);
    useWorkspaceStore.getState().setMode('streaming');

    const { result } = renderHook(() => useScriptExecution());
    await act(async () => {
      await result.current.execute();
    });

    expect(commitOpsMock).not.toHaveBeenCalled();
  });

  it('clears the draft + persisted map even when hydrate fails after a successful commit', async () => {
    // P2 split-failure regression: commitOps writes to yops_log, then
    // hydrate refreshes server state. With persistence, if commit
    // succeeds but hydrate fails, the OLD code left the draft staged
    // (hasDraft=true, persisted entry intact) — an F5 then restored an
    // already-applied draft and Apply would duplicate the same ops.
    //
    // The fix clears local + persisted draft state immediately after
    // commitOps resolves, BEFORE hydrate is awaited. This test pins
    // that boundary.
    useWorkspaceStore.getState().setDraft({
      ops: [
        {
          set: { path: 'trip/dest', value: 'HZ' },
          source: {
            type: 'llm',
            model: 'gpt-4o-mini',
            at: '2026-04-26T00:00:00Z',
            turn_ref: { turn_hash: 'sha256:t1', quote: 'HZ' },
          },
        },
      ] as never,
      tree: { trees: [{ key: 'trip', slots: { dest: 'HZ' }, children: [] }], relations: [] },
    });
    useWorkspaceStore
      .getState()
      .setScriptText('yops:\n  - set:\n      path: trip/dest\n      value: HZ\n');
    useWorkspaceStore.getState().setScriptDirty(false);
    expect(useWorkspaceStore.getState().draftsByConversation.conv_xyz).toBeDefined();

    // Commit succeeds, hydrate explodes.
    commitOpsMock.mockResolvedValueOnce({ id: 'yl_2' });
    hydrateMock.mockRejectedValueOnce(new Error('replay timeout'));

    const { result } = renderHook(() => useScriptExecution());
    await act(async () => {
      await result.current.execute();
    });

    expect(commitOpsMock).toHaveBeenCalledTimes(1);
    expect(hydrateMock).toHaveBeenCalledTimes(1);

    const after = useWorkspaceStore.getState();
    // Draft state cleared even though hydrate failed — the ops are
    // already in yops_log, so leaving them staged would let an F5
    // duplicate-apply.
    expect(after.hasDraft).toBe(false);
    expect(after.draftOps).toEqual([]);
    expect(after.draftTree).toBeNull();
    expect(after.scriptDirty).toBe(false);
    expect(after.draftsByConversation.conv_xyz).toBeUndefined();
    // Hydrate failure surfaces as a distinct error, NOT a commit-failure
    // error. Mode lands at idle (not 'executed') so the UI knows the
    // workspace is stale.
    expect(after.mode).toBe('idle');
    expect(after.lastError).toMatch(/refresh failed/i);
    expect(toastErrorMock).toHaveBeenCalledWith(expect.stringMatching(/refresh failed/i));
  });

  it('preserves the draft when commitOps itself fails (retry path)', async () => {
    // Inverse of the split-failure case: when commitOps rejects,
    // nothing landed in yops_log. The draft must stay staged so the
    // user can retry — clearing it would silently lose the LLM
    // proposal they were about to apply.
    useWorkspaceStore.getState().setDraft({
      ops: [
        {
          set: { path: 'trip/dest', value: 'HZ' },
          source: {
            type: 'llm',
            model: 'gpt-4o-mini',
            at: '2026-04-26T00:00:00Z',
            turn_ref: { turn_hash: 'sha256:t1', quote: 'HZ' },
          },
        },
      ] as never,
      tree: { trees: [{ key: 'trip', slots: { dest: 'HZ' }, children: [] }], relations: [] },
    });
    useWorkspaceStore
      .getState()
      .setScriptText('yops:\n  - set:\n      path: trip/dest\n      value: HZ\n');
    useWorkspaceStore.getState().setScriptDirty(false);

    commitOpsMock.mockRejectedValueOnce(new Error('persist conflict'));

    const { result } = renderHook(() => useScriptExecution());
    await act(async () => {
      await result.current.execute();
    });

    expect(commitOpsMock).toHaveBeenCalledTimes(1);
    // Hydrate must NOT be called when commit fails — there's nothing
    // new on the server to refresh.
    expect(hydrateMock).not.toHaveBeenCalled();

    const after = useWorkspaceStore.getState();
    expect(after.hasDraft).toBe(true);
    expect(after.draftOps).toHaveLength(1);
    expect(after.draftsByConversation.conv_xyz).toBeDefined();
    expect(after.mode).toBe('idle');
    expect(after.lastError).toBe('persist conflict');
  });

  it('execute clears scriptDirty + draft state + persisted map after a successful commit', async () => {
    // Setup: simulate the propose-only flow's pre-Apply state by
    // staging a draft AND priming the persisted map (since setConversation
    // was called in beforeEach with conv_xyz, the map will get an entry
    // automatically).
    useWorkspaceStore.getState().setDraft({
      ops: [
        {
          set: { path: 'trip/dest', value: 'HZ' },
          source: {
            type: 'llm',
            model: 'gpt-4o-mini',
            at: '2026-04-26T00:00:00Z',
            turn_ref: { turn_hash: 'sha256:t1', quote: 'HZ' },
          },
        },
      ] as never,
      tree: { trees: [{ key: 'trip', slots: { dest: 'HZ' }, children: [] }], relations: [] },
    });
    expect(useWorkspaceStore.getState().draftsByConversation.conv_xyz).toBeDefined();
    useWorkspaceStore
      .getState()
      .setScriptText(`yops:\n  - set:\n      path: trip/dest\n      value: HZ\n`);
    useWorkspaceStore.getState().setScriptDirty(false);

    const { result } = renderHook(() => useScriptExecution());
    await act(async () => {
      await result.current.execute();
    });

    // After Apply + hydrate, the draft is now part of yops_log. scriptDirty
    // resets to false (the script is once again a mirror), the local
    // draft state is cleared so a second click is a no-op, AND the
    // persisted map entry is removed so an F5 right after Apply doesn't
    // restore a draft that's already been applied.
    const after = useWorkspaceStore.getState();
    expect(after.scriptDirty).toBe(false);
    expect(after.hasDraft).toBe(false);
    expect(after.draftOps).toEqual([]);
    expect(after.draftTree).toBeNull();
    expect(after.draftsByConversation.conv_xyz).toBeUndefined();
  });
});
