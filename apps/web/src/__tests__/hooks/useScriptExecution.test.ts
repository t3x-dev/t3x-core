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

  it('execute clears scriptDirty + draft state after a successful commit', async () => {
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
    useWorkspaceStore.getState().setScriptDirty(false);

    const { result } = renderHook(() => useScriptExecution());
    await act(async () => {
      await result.current.execute();
    });

    // After Apply + hydrate, the draft is now part of yops_log. scriptDirty
    // resets to false (the script is once again a mirror), and the local
    // draft state is cleared so a second click is a no-op.
    const after = useWorkspaceStore.getState();
    expect(after.scriptDirty).toBe(false);
    expect(after.hasDraft).toBe(false);
    expect(after.draftOps).toEqual([]);
    expect(after.draftTree).toBeNull();
  });
});
