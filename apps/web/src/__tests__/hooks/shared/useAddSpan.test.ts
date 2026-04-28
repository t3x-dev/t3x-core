// @vitest-environment jsdom

import type { SourcedYOp } from '@t3x-dev/core';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const addSpanAsYOpsMock = vi.fn();

vi.mock('@/commands/yops/addSpanCommand', () => ({
  addSpanAsYOps: (...args: unknown[]) => addSpanAsYOpsMock(...args),
}));

import { useAddSpan } from '@/hooks/shared/useAddSpan';
import { useUndoStore } from '@/store/undoStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

function makeOp(): SourcedYOp {
  return {
    set: { path: 'sights/value', value: 'Lingyin Temple' },
    source: {
      type: 'llm',
      model: 'test-model',
      at: '2026-04-23T00:00:00Z',
      turn_ref: {
        turn_hash: 'sha256:t1',
        quote: 'Lingyin Temple',
        start_char: 23,
        end_char: 37,
      },
    },
  } as SourcedYOp;
}

describe('useAddSpan', () => {
  beforeEach(() => {
    addSpanAsYOpsMock.mockReset();
    useWorkspaceStore.getState().reset();
    useWorkspaceStore.getState().setConversation('conv_1');
    useWorkspaceStore
      .getState()
      .setTurns([
        { turn_hash: 'sha256:t1', role: 'user', content: 'Stay near West Lake. Lingyin Temple.' },
      ]);
    useUndoStore.getState().clear();
  });

  it('delegates to addSpanAsYOps with the selection payload and current conversation id', async () => {
    addSpanAsYOpsMock.mockResolvedValue([]);
    const { result } = renderHook(() => useAddSpan());

    await act(async () => {
      await result.current.addSpan({
        turnHash: 'sha256:t1',
        text: 'Lingyin Temple',
        start: 23,
        end: 37,
      });
    });

    expect(addSpanAsYOpsMock).toHaveBeenCalledWith({
      conversationId: 'conv_1',
      turnHash: 'sha256:t1',
      text: 'Lingyin Temple',
      start: 23,
      end: 37,
    });
  });

  it('replays returned ops into the workspace store and returns the count', async () => {
    addSpanAsYOpsMock.mockResolvedValue([makeOp()]);
    const { result } = renderHook(() => useAddSpan());

    let count = 0;
    await act(async () => {
      count = await result.current.addSpan({
        turnHash: 'sha256:t1',
        text: 'Lingyin Temple',
        start: 23,
        end: 37,
      });
    });

    expect(count).toBe(1);
    expect(useWorkspaceStore.getState().opsLog.length).toBe(1);
  });

  it('returns 0 and leaves the store untouched when the LLM yields no ops', async () => {
    addSpanAsYOpsMock.mockResolvedValue([]);
    const { result } = renderHook(() => useAddSpan());

    let count = 1;
    await act(async () => {
      count = await result.current.addSpan({
        turnHash: 'sha256:t1',
        text: 'Lingyin Temple',
        start: 23,
        end: 37,
      });
    });

    expect(count).toBe(0);
    expect(useWorkspaceStore.getState().opsLog.length).toBe(0);
  });

  it('throws when no active conversation is set', async () => {
    useWorkspaceStore.getState().setConversation(null);
    const { result } = renderHook(() => useAddSpan());

    await expect(
      result.current.addSpan({
        turnHash: 'sha256:t1',
        text: 'Lingyin Temple',
        start: 23,
        end: 37,
      })
    ).rejects.toThrow('No active conversation');
  });

  it('pushes one undo snapshot per successful add, labeled with the selection preview', async () => {
    addSpanAsYOpsMock.mockResolvedValue([makeOp()]);
    const { result } = renderHook(() => useAddSpan());
    await act(async () => {
      await result.current.addSpan({
        turnHash: 'sha256:t1',
        text: 'Lingyin Temple',
        start: 23,
        end: 37,
      });
    });
    const stack = useUndoStore.getState().stack;
    expect(stack).toHaveLength(1);
    expect(stack[0].label).toBe('Add "Lingyin Temple"');
  });

  it('does not push an undo snapshot when the LLM yields no ops', async () => {
    addSpanAsYOpsMock.mockResolvedValue([]);
    const { result } = renderHook(() => useAddSpan());
    await act(async () => {
      await result.current.addSpan({
        turnHash: 'sha256:t1',
        text: 'Lingyin Temple',
        start: 23,
        end: 37,
      });
    });
    expect(useUndoStore.getState().stack).toHaveLength(0);
  });
});
