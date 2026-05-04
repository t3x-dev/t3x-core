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

// useScriptExecution now stamps real session identity (replaces the
// hardcoded `'script-editor'` author). Default to a deterministic
// session so the source-build path doesn't throw; tests that exercise
// the no-session-user code path overwrite `sessionUserMock` per case.
const sessionUserMock = {
  current: { id: 'user_1', name: 'Alice', username: 'alice' } as {
    id: string;
    name: string | null;
    username: string | null;
  } | null,
};
vi.mock('@/infrastructure/session', () => ({
  getSessionUser: () => sessionUserMock.current,
}));

const chatStoreState = { activeProjectId: 'proj_abc' as string | null };
vi.mock('@/store/chatStore', () => ({
  useChatStore: Object.assign(() => undefined, {
    getState: () => chatStoreState,
  }),
}));

import { useScriptExecution } from '@/hooks/drafts/useScriptExecution';
import { selectScriptDirty, selectScriptText, useWorkspaceStore } from '@/store/workspaceStore';

describe('useScriptExecution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionUserMock.current = { id: 'user_1', name: 'Alice', username: 'alice' };
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
    useWorkspaceStore.getState().clearEditorOverride();
    expect(useWorkspaceStore.getState().hasDraft).toBe(false);
    const { result } = renderHook(() => useScriptExecution());
    expect(result.current.canRun).toBe(false);
    expect(result.current.disabledReason).toBe('No applied YOps');
  });

  it('enables Apply after a manual edit flips scriptDirty', () => {
    useWorkspaceStore.getState().setEditorOverride('yops:\n  - {set: {path: foo, value: bar}}');
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

    it('preserves an empty editor override verbatim (Ctrl-A delete must stick)', () => {
      // The reviewer-flagged regression: setEditorOverride('') used to
      // collapse to null and selectScriptText then fell back to opsLog,
      // re-mirroring the canonical YAML right back into the editor.
      // That made the editor un-clearable. Now '' is preserved, and
      // an empty editor reads as a real (dirty) override.
      seedCommitted(sampleOps);
      useWorkspaceStore.getState().setEditorOverride('');

      renderHook(() => useScriptExecution());

      const s = useWorkspaceStore.getState();
      expect(selectScriptText(s)).toBe('');
      expect(selectScriptDirty(s)).toBe(true);
    });

    it('preserves whitespace-only editor override (every keystroke counts)', () => {
      // Same logic as the empty-string case: the user typed something
      // (even if just whitespace); the in-memory state preserves it.
      // Restore-time normalization (`restoreDraftFor`) downgrades
      // whitespace-only to null so a meaningless persisted override
      // doesn't survive a refresh — but the live setter does NOT.
      seedCommitted(sampleOps);
      useWorkspaceStore.getState().setEditorOverride('   \n\n  ');

      renderHook(() => useScriptExecution());

      const s = useWorkspaceStore.getState();
      expect(selectScriptText(s)).toBe('   \n\n  ');
      expect(selectScriptDirty(s)).toBe(true);
    });

    it('does NOT overwrite a non-empty dirty script (real manual edit protected)', () => {
      // The load-bearing inverse: if the user has actually typed
      // something, the mirror MUST stay out of the way. This is what
      // the original gate was protecting and is not changing.
      seedCommitted(sampleOps);
      useWorkspaceStore
        .getState()
        .setEditorOverride('yops:\n  - set:\n      path: user/edit\n      value: keep\n');

      renderHook(() => useScriptExecution());

      const s = useWorkspaceStore.getState();
      expect(selectScriptText(s)).toContain('user/edit');
      expect(selectScriptText(s)).not.toContain('trip/dest');
      expect(selectScriptDirty(s)).toBe(true);
    });

    it('mirrors when scriptDirty is false and scriptText is empty (existing path)', () => {
      // Preserves the steady-state mirror: clean script, committed ops
      // present → write the YAML.
      seedCommitted(sampleOps);
      useWorkspaceStore.getState().setEditorOverride('');
      useWorkspaceStore.getState().clearEditorOverride();

      renderHook(() => useScriptExecution());

      const s = useWorkspaceStore.getState();
      expect(selectScriptText(s)).toContain('trip/dest');
      expect(selectScriptDirty(s)).toBe(false);
    });

    it('selectScriptText falls through draftOps → opsLog when no override is set', () => {
      // The selector resolution order: editorOverride → draftOps →
      // opsLog → ''. With no override and a staged draft, draftOps
      // wins; opsLog is the next fallback for the no-draft case.
      useWorkspaceStore.getState().setDraft({
        ops: sampleOps as never,
        tree: { trees: [], relations: [] },
      });
      useWorkspaceStore.getState().setDerived({
        tree: { trees: [], relations: [] },
        sourceIndex: new Map(),
        opsLog: sampleOps as never,
      });

      renderHook(() => useScriptExecution());

      const s = useWorkspaceStore.getState();
      // No override → draftOps wins.
      expect(selectScriptText(s)).toContain('trip/dest');
      expect(selectScriptDirty(s)).toBe(false);
    });

    it('selectScriptText returns empty string when there is nothing to show (no draft, no opsLog, no override)', () => {
      // Truly empty conversation. No setEditorOverride call — the
      // setter would now preserve '' and flip dirty to true. Idle
      // state means override is null; selector returns ''.
      renderHook(() => useScriptExecution());

      const s = useWorkspaceStore.getState();
      expect(selectScriptText(s)).toBe('');
      expect(selectScriptDirty(s)).toBe(false);
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
      .setEditorOverride(`yops:\n  - set:\n      path: trip/dest\n      value: HZ\n`);
    useWorkspaceStore.getState().clearEditorOverride();

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
      .setEditorOverride(`yops:\n  - set:\n      path: trip/dest\n      value: HZ\n`);

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
    const stamped = (ops[0] as { source: { type: string; author: string; surface: string } })
      .source;
    expect(stamped.type).toBe('human');
    // Identity is the real session user — NEVER 'script-editor' (the old
    // hardcoded surface label). `surface` carries the WHERE.
    expect(stamped.author).toBe('alice');
    expect(stamped.surface).toBe('script');
  });

  it('execute accepts a top-level array (manual edit without envelope)', async () => {
    useWorkspaceStore.getState().setEditorOverride(`- set:\n    path: trip/dest\n    value: HZ\n`);

    const { result } = renderHook(() => useScriptExecution());
    await act(async () => {
      await result.current.execute();
    });

    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(commitOpsMock).toHaveBeenCalledTimes(1);
  });

  it('passes replaceActiveLLMDraft: false to commitOps when applying a staged Extract draft', async () => {
    // Review-first model: a staged-extract Apply appends to the
    // applied YOps log, it does not supersede prior LLM rows.
    // Only an explicit Replace (active_dirty) or Repair
    // (replay_failed) flow may set replaceActiveLLMDraft: true.
    // Spec: docs/superpowers/specs/2026-05-04-yops-append-apply-mechanism-design.md
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
      .setEditorOverride(`yops:\n  - set:\n      path: trip/dest\n      value: HZ\n`);
    // scriptDirty stays false — the script is the canonical proposal,
    // not a user edit. hasDraft alone enables Apply.
    useWorkspaceStore.getState().clearEditorOverride();

    const { result } = renderHook(() => useScriptExecution());
    await act(async () => {
      await result.current.execute();
    });

    expect(commitOpsMock).toHaveBeenCalledTimes(1);
    const [, , options] = commitOpsMock.mock.calls[0];
    expect(options).toEqual({ replaceActiveLLMDraft: false });
  });

  it('passes replaceActiveLLMDraft: false on a manual-edit Apply (no staged draft)', async () => {
    // Hand-written script edits append, never opting into the LLM-draft
    // supersede branch. The staged-Extract Apply path also appends now
    // (post review-first flip), so both web Apply paths send `false`;
    // the explicit-supersede branch is reachable only by non-WebUI
    // callers, active_dirty Replace, or Repair.
    useWorkspaceStore.getState().setEditorOverride(`- set:\n    path: trip/dest\n    value: HZ\n`);
    expect(useWorkspaceStore.getState().hasDraft).toBe(false);

    const { result } = renderHook(() => useScriptExecution());
    await act(async () => {
      await result.current.execute();
    });

    expect(commitOpsMock).toHaveBeenCalledTimes(1);
    const [, , options] = commitOpsMock.mock.calls[0];
    expect(options).toEqual({ replaceActiveLLMDraft: false });
  });

  it('passes replaceActiveScript when editing the already-applied active script mirror', async () => {
    useWorkspaceStore.getState().setDerived({
      tree: { trees: [{ key: 'trip', slots: {}, children: [] }], relations: [] },
      sourceIndex: new Map(),
      opsLog: [
        {
          define: { path: 'trip' },
          source: {
            type: 'human',
            author: 'script-editor',
            at: '2026-04-28T00:00:00.000Z',
          },
        },
      ] as never,
      rowsById: {
        yl_active: {
          id: 'yl_active',
          source: 'manual',
          turnHash: null,
          createdAt: '2026-04-28T00:00:00.000Z',
          supersededAt: null,
          isCommitted: false,
          committedBy: [],
          opCount: 1,
        },
      },
      opOrigins: [{ rowId: 'yl_active', opIndexInRow: 0 }],
    });
    useWorkspaceStore
      .getState()
      .setEditorOverride(
        `yops:\n  - define:\n      path: trip\n  - populate:\n      path: trip\n      values:\n        destination: Beijing\n`
      );
    expect(useWorkspaceStore.getState().hasDraft).toBe(false);

    const { result } = renderHook(() => useScriptExecution());
    await act(async () => {
      await result.current.execute();
    });

    expect(commitOpsMock).toHaveBeenCalledTimes(1);
    const [, , options] = commitOpsMock.mock.calls[0];
    expect(options).toEqual({
      replaceActiveLLMDraft: false,
      replaceActiveScript: true,
    });
  });

  it('uses replaceActiveScript normalization when editing committed baseline rows', async () => {
    useWorkspaceStore.getState().setDerived({
      tree: { trees: [{ key: 'trip', slots: {}, children: [] }], relations: [] },
      sourceIndex: new Map(),
      opsLog: [
        {
          define: { path: 'trip' },
          source: {
            type: 'human',
            author: 'script-editor',
            at: '2026-04-28T00:00:00.000Z',
          },
        },
      ] as never,
      rowsById: {
        yl_committed: {
          id: 'yl_committed',
          source: 'manual',
          turnHash: null,
          createdAt: '2026-04-28T00:00:00.000Z',
          supersededAt: null,
          isCommitted: true,
          committedBy: ['sha256:commit'],
          opCount: 1,
        },
      },
      opOrigins: [{ rowId: 'yl_committed', opIndexInRow: 0 }],
    });
    useWorkspaceStore
      .getState()
      .setEditorOverride(
        `yops:\n  - define:\n      path: trip\n  - populate:\n      path: trip\n      values:\n        destination: Beijing\n`
      );

    const { result } = renderHook(() => useScriptExecution());
    await act(async () => {
      await result.current.execute();
    });

    expect(commitOpsMock).toHaveBeenCalledTimes(1);
    const [, , options] = commitOpsMock.mock.calls[0];
    expect(options).toEqual({
      replaceActiveLLMDraft: false,
      replaceActiveScript: true,
    });
  });

  it('falls back to replaceActiveScript when active ops have not been hydrated with row metadata yet', async () => {
    useWorkspaceStore.getState().setDerived({
      tree: { trees: [{ key: 'trip', slots: {}, children: [] }], relations: [] },
      sourceIndex: new Map(),
      opsLog: [
        {
          define: { path: 'trip' },
          source: {
            type: 'human',
            author: 'script-editor',
            at: '2026-04-28T00:00:00.000Z',
          },
        },
      ] as never,
    });
    useWorkspaceStore
      .getState()
      .setEditorOverride(
        `yops:\n  - define:\n      path: trip\n  - populate:\n      path: trip\n      values:\n        destination: Beijing\n`
      );

    const { result } = renderHook(() => useScriptExecution());
    await act(async () => {
      await result.current.execute();
    });

    expect(commitOpsMock).toHaveBeenCalledTimes(1);
    const [, , options] = commitOpsMock.mock.calls[0];
    expect(options).toEqual({
      replaceActiveLLMDraft: false,
      replaceActiveScript: true,
    });
  });

  it('passes repairYopsLogId when applying dirty script over a replay warning', async () => {
    useWorkspaceStore.getState().setReplayWarning({
      opIndex: 5,
      code: 'ALREADY_EXISTS',
      message: 'Path "food" already exists',
      rowId: 'yl_failing',
      opIndexInRow: 4,
      appliedCount: 5,
    });
    useWorkspaceStore
      .getState()
      .setEditorOverride(`- set:\n    path: food/description\n    value: fixed\n`);
    expect(useWorkspaceStore.getState().hasDraft).toBe(false);

    const { result } = renderHook(() => useScriptExecution());
    await act(async () => {
      await result.current.execute();
    });

    expect(commitOpsMock).toHaveBeenCalledTimes(1);
    const [, , options] = commitOpsMock.mock.calls[0];
    expect(options).toEqual({
      replaceActiveLLMDraft: false,
      repairYopsLogId: 'yl_failing',
    });
  });

  it('execute() refuses to commit when there is no draft and no manual edit', async () => {
    // Defense in depth: the Apply button is disabled in this state, but
    // execute() may be reached via hotkeys, tests, or programmatic calls.
    // Without `hasDraft || scriptDirty`, the script is just a mirror of
    // committed state — re-applying would duplicate the ops in yops_log.
    useWorkspaceStore
      .getState()
      .setEditorOverride(`yops:\n  - set:\n      path: trip/dest\n      value: HZ\n`);
    useWorkspaceStore.getState().clearEditorOverride();
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
      .setEditorOverride(`yops:\n  - set:\n      path: trip/dest\n      value: HZ\n`);
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
      .setEditorOverride('yops:\n  - set:\n      path: trip/dest\n      value: HZ\n');
    useWorkspaceStore.getState().clearEditorOverride();
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
    expect(selectScriptDirty(after)).toBe(false);
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
      .setEditorOverride('yops:\n  - set:\n      path: trip/dest\n      value: HZ\n');
    useWorkspaceStore.getState().clearEditorOverride();

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

  describe('preset live-swap → Apply (user-path regression for #951/#952)', () => {
    // The exact scenario PR #952's P1 surfaced: extract with preset
    // variants cached, switch the chip, click Apply. Before the
    // single-writer refactor this would commit the variant active at
    // EXTRACT time, not at APPLY time, because setExtractionPreset
    // swapped draftOps without updating scriptText. parseScript reads
    // scriptText, so Apply was committing stale YAML while AfterPanel
    // showed the swapped variant.
    //
    // This test fails against the pre-fix code and passes after.
    // It's the canary for the entire mirror-state drift class.

    const opForPath = (path: string, value: string) =>
      ({
        set: { path, value },
        source: {
          type: 'llm' as const,
          model: 'gpt-4o-mini',
          at: '2026-04-26T00:00:00Z',
          turn_ref: { turn_hash: 'sha256:t1', quote: value },
        },
      }) as never;

    const balancedOps = [opForPath('trip/dest', 'HZ'), opForPath('trip/budget', '5k')];
    const conciseOps = [opForPath('trip/dest', 'HZ')];
    const detailedOps = [
      opForPath('trip/dest', 'HZ'),
      opForPath('trip/budget', '5k'),
      opForPath('trip/duration', '7d'),
    ];

    it('Apply commits the variant currently displayed, not the one active at extract time', async () => {
      // Mimic what useExtraction does after a successful Extract with
      // preset variants: setDraft writes draftOps, scriptText, and
      // caches all three variants for chip swap.
      useWorkspaceStore.getState().setDraft({
        ops: balancedOps,
        tree: { trees: [], relations: [] },
        variants: { concise: conciseOps, balanced: balancedOps, detailed: detailedOps },
      });

      // User clicks the chip to switch to Concise.
      useWorkspaceStore.getState().setExtractionPreset('concise');

      // Sanity: AfterPanel would now render the concise ops.
      expect(useWorkspaceStore.getState().draftOps).toEqual(conciseOps);

      // Apply.
      const { result } = renderHook(() => useScriptExecution());
      await act(async () => {
        await result.current.execute();
      });

      // Apply commits the concise ops. Pre-fix this would have
      // committed the balanced ops (scriptText held the balanced YAML
      // because setExtractionPreset didn't rewrite it).
      expect(commitOpsMock).toHaveBeenCalledTimes(1);
      const [, committedOps] = commitOpsMock.mock.calls[0];
      expect(committedOps).toHaveLength(conciseOps.length);
      // Map by path so we don't depend on serializer ordering.
      const committedPaths = (committedOps as Array<{ set: { path: string } }>).map(
        (op) => op.set.path
      );
      expect(committedPaths).toEqual(['trip/dest']);
      expect(committedPaths).not.toContain('trip/budget');
    });

    it('Apply commits the variant after switching twice (Concise → Detailed)', async () => {
      useWorkspaceStore.getState().setDraft({
        ops: balancedOps,
        tree: { trees: [], relations: [] },
        variants: { concise: conciseOps, balanced: balancedOps, detailed: detailedOps },
      });
      useWorkspaceStore.getState().setExtractionPreset('concise');
      useWorkspaceStore.getState().setExtractionPreset('detailed');

      const { result } = renderHook(() => useScriptExecution());
      await act(async () => {
        await result.current.execute();
      });

      const [, committedOps] = commitOpsMock.mock.calls[0];
      const committedPaths = (committedOps as Array<{ set: { path: string } }>).map(
        (op) => op.set.path
      );
      expect(committedPaths).toEqual(['trip/dest', 'trip/budget', 'trip/duration']);
    });
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
      .setEditorOverride(`yops:\n  - set:\n      path: trip/dest\n      value: HZ\n`);
    useWorkspaceStore.getState().clearEditorOverride();

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
    expect(selectScriptDirty(after)).toBe(false);
    expect(after.hasDraft).toBe(false);
    expect(after.draftOps).toEqual([]);
    expect(after.draftTree).toBeNull();
    expect(after.draftsByConversation.conv_xyz).toBeUndefined();
  });

  describe('canonicalize multi-value scalars on manual apply (plan: canonicalize-proposed-yops)', () => {
    it('rewrites set.value comma-list scalar to a YAML sequence before commitOps', async () => {
      // User typed a comma-string in the editor. The script-apply path
      // bypasses the extractor pipeline, so the canonicalization gate
      // must also run here — otherwise human edits and LLM extractions
      // diverge in persisted shape.
      useWorkspaceStore
        .getState()
        .setEditorOverride(
          `- set:\n    path: cameras/sony/r5/primary_use_case\n    value: landscape, studio, fashion, commercial\n`
        );

      const { result } = renderHook(() => useScriptExecution());
      await act(async () => {
        await result.current.execute();
      });

      expect(toastErrorMock).not.toHaveBeenCalled();
      expect(commitOpsMock).toHaveBeenCalledTimes(1);
      const [, ops] = commitOpsMock.mock.calls[0];
      expect(Array.isArray(ops)).toBe(true);
      expect((ops[0] as { set: { value: unknown } }).set.value).toEqual([
        'landscape',
        'studio',
        'fashion',
        'commercial',
      ]);
    });

    it('rewrites populate.values per-key while leaving non-list scalars alone', async () => {
      useWorkspaceStore
        .getState()
        .setEditorOverride(
          `- populate:\n    path: cameras/sony/r5\n    values:\n      primary_use_case: landscape, studio, fashion\n      resolution: 61 megapixels\n`
        );

      const { result } = renderHook(() => useScriptExecution());
      await act(async () => {
        await result.current.execute();
      });

      expect(toastErrorMock).not.toHaveBeenCalled();
      expect(commitOpsMock).toHaveBeenCalledTimes(1);
      const [, ops] = commitOpsMock.mock.calls[0];
      const populated = (ops[0] as { populate: { values: Record<string, unknown> } }).populate;
      expect(populated.values.primary_use_case).toEqual(['landscape', 'studio', 'fashion']);
      expect(populated.values.resolution).toBe('61 megapixels');
    });

    it('leaves prose-with-comma scalar alone', async () => {
      useWorkspaceStore
        .getState()
        .setEditorOverride(
          `- set:\n    path: cameras/sony/r5/note\n    value: "Released in 2022, with improved thermal management"\n`
        );

      const { result } = renderHook(() => useScriptExecution());
      await act(async () => {
        await result.current.execute();
      });

      expect(commitOpsMock).toHaveBeenCalledTimes(1);
      const [, ops] = commitOpsMock.mock.calls[0];
      expect((ops[0] as { set: { value: unknown } }).set.value).toBe(
        'Released in 2022, with improved thermal management'
      );
    });
  });

  describe('Apply does not require a session user when every op already carries source', () => {
    // Reviewer-flagged P1: Apply must NOT preflight a HumanSource build.
    // When every parsed op already carries source, no human identity is
    // needed at all — auth-disabled / self-hosted / no-`t3x-user`
    // contexts must succeed in that case.

    it('applies pre-sourced ops with no session user (lazy HumanSource build)', async () => {
      sessionUserMock.current = null;

      // Editor YAML carries an explicit `source` block on every op.
      // The Apply path parses these into already-sourced ops, so the
      // missing-source branch never fires and the lazy HumanSource
      // build is skipped — Apply succeeds even with no session user.
      // (`serializeOpsToYaml` strips source from the canonical mirror,
      // so the test feeds source-bearing YAML directly via the editor
      // override to exercise the all-pre-sourced path.)
      useWorkspaceStore
        .getState()
        .setEditorOverride(
          [
            'yops:',
            '  - set:',
            '      path: trip/dest',
            '      value: HZ',
            '    source:',
            '      type: llm',
            '      model: gpt-4o-mini',
            "      at: '2026-04-26T00:00:00Z'",
            '      turn_ref:',
            "        turn_hash: 'sha256:t1'",
            '        quote: HZ',
            '',
          ].join('\n')
        );

      const { result } = renderHook(() => useScriptExecution());
      await act(async () => {
        await result.current.execute();
      });

      expect(toastErrorMock).not.toHaveBeenCalled();
      expect(commitOpsMock).toHaveBeenCalledTimes(1);
      // The committed op kept its LLM source verbatim — no human
      // identity was synthesized.
      const [, ops] = commitOpsMock.mock.calls[0];
      const stamped = (ops[0] as { source: { type: string; model?: string } }).source;
      expect(stamped.type).toBe('llm');
      expect(stamped.model).toBe('gpt-4o-mini');
    });

    it('errors out when an op is missing source AND there is no session user', async () => {
      sessionUserMock.current = null;
      // Top-level array with no `source` field — manual-edit path,
      // genuinely needs a human author. Lazy build fires on the first
      // missing-source op and surfaces a clear error.
      useWorkspaceStore
        .getState()
        .setEditorOverride('- set:\n    path: trip/dest\n    value: HZ\n');

      const { result } = renderHook(() => useScriptExecution());
      await act(async () => {
        await result.current.execute();
      });

      expect(commitOpsMock).not.toHaveBeenCalled();
      expect(toastErrorMock).toHaveBeenCalled();
      const errorMsg = String(toastErrorMock.mock.calls[0]?.[0] ?? '');
      expect(errorMsg.toLowerCase()).toContain('session user');
    });
  });
});
