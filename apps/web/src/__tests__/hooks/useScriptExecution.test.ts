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
    useWorkspaceStore.setState({ panelExpandedByProject: {}, activeProjectId: null });
    useWorkspaceStore.getState().setConversation('conv_xyz');
    chatStoreState.activeProjectId = 'proj_abc';
    commitOpsMock.mockResolvedValue({ id: 'yl_1' });
    hydrateMock.mockResolvedValue(undefined);
  });

  it('disables Run when scriptDirty is false (post-extract mirror)', () => {
    // Post-extract state: opsLog populated, script mirrors it, but the
    // user has not edited. Re-running would duplicate-apply.
    useWorkspaceStore.getState().setScriptDirty(false);
    const { result } = renderHook(() => useScriptExecution());
    expect(result.current.canRun).toBe(false);
    expect(result.current.disabledReason).toBe('No script edits to run');
  });

  it('enables Run after a manual edit flips scriptDirty', () => {
    useWorkspaceStore.getState().setScriptText('yops:\n  - {set: {path: foo, value: bar}}');
    useWorkspaceStore.getState().setScriptDirty(true);
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

  it('execute clears scriptDirty after a successful commit', async () => {
    useWorkspaceStore
      .getState()
      .setScriptText(`yops:\n  - set:\n      path: trip/dest\n      value: HZ\n`);
    useWorkspaceStore.getState().setScriptDirty(true);

    const { result } = renderHook(() => useScriptExecution());
    await act(async () => {
      await result.current.execute();
    });

    // After commit + hydrate, the script is once again a mirror of yops_log.
    // scriptDirty must reset so Run goes back to disabled — otherwise the
    // next click would duplicate-apply.
    expect(useWorkspaceStore.getState().scriptDirty).toBe(false);
  });
});
