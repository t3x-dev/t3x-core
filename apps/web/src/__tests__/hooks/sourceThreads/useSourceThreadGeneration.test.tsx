// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSourceThreadGeneration } from '@/hooks/sourceThreads/useSourceThreadGeneration';
import type { WorkspaceAssistantEvent } from '@/infrastructure/workspaceAssistant';

const mocks = vi.hoisted(() => ({
  listTurns: vi.fn(),
  appendTurn: vi.fn(),
  stream: vi.fn(),
  recover: vi.fn(),
}));
vi.mock('@/infrastructure/sourceThreads', () => ({
  sourceThreadApi: { listTurns: mocks.listTurns, appendTurn: mocks.appendTurn },
  isSourceThreadRequestAborted: () => false,
}));
vi.mock('@/infrastructure/workspaceAssistant', () => ({
  streamWorkspaceAssistant: mocks.stream,
  recoverWorkspaceAssistantOperation: mocks.recover,
}));
vi.mock('@/hooks/conversations/syncSavedTurnIntoWorkspace', () => ({
  syncSavedTurnIntoWorkspace: vi.fn(),
}));

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

let sequence = 0;
function options() {
  return {
    projectId: 'project',
    conversationId: `conversation-${++sequence}`,
    title: 'Draft discussion',
    workspaceAssistant: {
      workspaceId: `workspace-${sequence}`,
      workspaceRevision: 7,
      sourceMaterialIds: [],
      onCandidate: vi.fn(),
    },
  };
}

function streamRun() {
  const text = deferred();
  const finish = deferred();
  let signal: AbortSignal;
  mocks.stream.mockImplementation(async function* (
    _project: string,
    _context: unknown,
    _turn: unknown,
    request: { signal: AbortSignal }
  ): AsyncGenerator<WorkspaceAssistantEvent> {
    signal = request.signal;
    yield { type: 'context' };
    yield {
      type: 'operation',
      operationId: 'operation',
      name: 'requestProposal',
      status: 'started',
    };
    await text.promise;
    yield { type: 'text', content: 'Updating the selected field' };
    await finish.promise;
    yield {
      type: 'operation',
      operationId: 'operation',
      name: 'requestProposal',
      status: 'completed',
      result: { transitionId: 'candidate' },
    };
    yield { type: 'done', turnHash: 'assistant-turn', content: 'Updating the selected field' };
  });
  return { text, finish, signal: () => signal };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listTurns.mockResolvedValue({ turns: [] });
  mocks.appendTurn.mockResolvedValue({ turn_hash: 'user-turn' });
  mocks.recover.mockResolvedValue({ status: 'unknown' });
});
afterEach(cleanup);

describe('Workspace assistant route lifetime', () => {
  it('reattaches to generation and publishes once using the current view callback', async () => {
    const run = streamRun();
    const initial = options();
    const first = renderHook(() => useSourceThreadGeneration(initial));
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    let request: unknown;
    act(() => {
      request = first.result.current.sendMessage('Change the number');
    });
    await waitFor(() => expect(first.result.current.workspaceActivity?.phase).toBe('generating'));
    first.unmount();

    const onCandidate = vi.fn();
    const restored = renderHook(() =>
      useSourceThreadGeneration({
        ...initial,
        workspaceAssistant: { ...initial.workspaceAssistant, onCandidate },
      })
    );
    expect(restored.result.current.isStreaming).toBe(true);
    expect(restored.result.current.workspaceActivity?.operations[0]?.status).toBe('started');
    expect(restored.result.current.messages).toEqual([
      expect.objectContaining({ id: 'user-turn' }),
    ]);
    expect(mocks.listTurns).toHaveBeenCalledTimes(1);
    act(() => {
      restored.result.current.sendMessage('Do not start a duplicate');
    });
    expect(mocks.appendTurn).toHaveBeenCalledTimes(1);

    act(() => run.text.resolve());
    await waitFor(() =>
      expect(restored.result.current.streamingContent).toBe('Updating the selected field')
    );
    await act(async () => {
      run.finish.resolve();
      await request;
    });
    expect(restored.result.current.isStreaming).toBe(false);
    expect(restored.result.current.messages).toHaveLength(2);
    expect(restored.result.current.messages[1]?.id).toBe('assistant-turn');
    expect(onCandidate).toHaveBeenCalledTimes(1);
    expect(initial.workspaceAssistant.onCandidate).not.toHaveBeenCalled();
    expect(mocks.stream).toHaveBeenCalledTimes(1);
  });

  it('keeps text updates and completion while the view is absent', async () => {
    const run = streamRun();
    const initial = options();
    const first = renderHook(() => useSourceThreadGeneration(initial));
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    let request: unknown;
    act(() => {
      request = first.result.current.sendMessage('Change the number');
    });
    await waitFor(() => expect(first.result.current.workspaceActivity?.phase).toBe('generating'));
    first.unmount();
    await act(async () => {
      run.text.resolve();
      run.finish.resolve();
      await request;
    });
    // A failed history refresh must not erase the response received offscreen.
    mocks.listTurns.mockRejectedValueOnce(new Error('Offline'));
    const restored = renderHook(() => useSourceThreadGeneration(initial));
    await waitFor(() => expect(restored.result.current.isLoading).toBe(false));
    expect(restored.result.current.workspaceActivity?.phase).toBe('complete');
    expect(restored.result.current.messages[1]?.content).toBe('Updating the selected field');
    expect(restored.result.current.isStreaming).toBe(false);
    expect(initial.workspaceAssistant.onCandidate).toHaveBeenCalledTimes(1);
  });

  it('isolates Workspaces and projects, and reconnects the stop button to the original request', async () => {
    const run = streamRun();
    const initial = options();
    const view = renderHook((props) => useSourceThreadGeneration(props), { initialProps: initial });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    let request: unknown;
    act(() => {
      request = view.result.current.sendMessage('Change the number');
    });
    await waitFor(() => expect(view.result.current.workspaceActivity?.phase).toBe('generating'));
    view.rerender({
      ...initial,
      workspaceAssistant: { ...initial.workspaceAssistant, workspaceId: 'other' },
    });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.isStreaming).toBe(false);
    expect(view.result.current.workspaceActivity).toBeNull();
    expect(view.result.current.messages).toEqual([]);
    view.rerender({ ...initial, projectId: 'other-project' });
    expect(view.result.current.isStreaming).toBe(false);
    view.rerender(initial);
    expect(view.result.current.isStreaming).toBe(true);
    act(() => view.result.current.stopGenerating());
    expect(run.signal().aborted).toBe(true);
    await act(async () => {
      run.text.reject(new DOMException('Stopped', 'AbortError'));
      await request;
    });
    expect(view.result.current.isStreaming).toBe(false);
    expect(view.result.current.workspaceActivity?.phase).toBe('error');
    expect(initial.workspaceAssistant.onCandidate).not.toHaveBeenCalled();
  });

  it('shows an error received while the route was unmounted', async () => {
    const run = streamRun();
    const initial = options();
    const first = renderHook(() => useSourceThreadGeneration(initial));
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    let request: unknown;
    act(() => {
      request = first.result.current.sendMessage('Change the number');
    });
    await waitFor(() => expect(first.result.current.workspaceActivity?.phase).toBe('generating'));
    first.unmount();
    await act(async () => {
      run.text.reject(new Error('Connection lost'));
      await request;
    });
    const restored = renderHook(() => useSourceThreadGeneration(initial));
    await waitFor(() => expect(restored.result.current.isLoading).toBe(false));
    expect(restored.result.current.error).toContain('Connection lost');
    expect(restored.result.current.workspaceActivity?.phase).toBe('error');
    expect(restored.result.current.isStreaming).toBe(false);
  });

  it('can stop after remounting while the user turn is still being saved', async () => {
    const saved = deferred<{ turn_hash: string }>();
    mocks.appendTurn.mockReturnValueOnce(saved.promise);
    const initial = options();
    const first = renderHook(() => useSourceThreadGeneration(initial));
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    let request: unknown;
    act(() => {
      request = first.result.current.sendMessage('Change the number');
    });
    expect(first.result.current.workspaceActivity?.phase).toBe('saving');
    first.unmount();
    const restored = renderHook(() => useSourceThreadGeneration(initial));
    act(() => restored.result.current.stopGenerating());
    await act(async () => {
      saved.resolve({ turn_hash: 'user-turn' });
      await request;
    });
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(restored.result.current.isStreaming).toBe(false);
    expect(restored.result.current.workspaceActivity?.phase).toBe('error');
  });
});

it('preserves unsent Workspace input across a settings round trip without sending', async () => {
  const initial = options();
  const first = renderHook(() => useSourceThreadGeneration(initial));
  await waitFor(() => expect(first.result.current.isLoading).toBe(false));
  act(() => first.result.current.setInput('Keep this unsent instruction'));
  first.unmount();
  const returned = renderHook(() => useSourceThreadGeneration(initial));
  await waitFor(() => expect(returned.result.current.input).toBe('Keep this unsent instruction'));
  expect(mocks.appendTurn).not.toHaveBeenCalled();
  expect(mocks.stream).not.toHaveBeenCalled();
});
