// @vitest-environment jsdom

import type { SourcedYOp } from '@t3x-dev/core';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useUndo, useUndoTracker } from '@/hooks/shared/useUndo';
import { useUndoStore } from '@/store/undoStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

function humanOp(path: string, value: string): SourcedYOp {
  return {
    set: { path, value },
    source: { type: 'human', author: 'alice', at: '2026-04-24T00:00:00Z' },
  } as SourcedYOp;
}

describe('useUndoTracker', () => {
  beforeEach(() => {
    useUndoStore.getState().clear();
    useWorkspaceStore.getState().reset();
    useWorkspaceStore.getState().setConversation('conv_1');
  });

  it('pushes the current opsLog onto the undo stack under the given label', () => {
    const seed: SourcedYOp[] = [humanOp('trip/destination', 'Hangzhou')];
    useWorkspaceStore.getState().setDerived({
      tree: { trees: [], relations: [] },
      sourceIndex: new Map(),
      opsLog: seed,
    });

    const { result } = renderHook(() => useUndoTracker());
    act(() => result.current.trackAction('Edit trip.destination'));

    const stack = useUndoStore.getState().stack;
    expect(stack).toHaveLength(1);
    expect(stack[0].label).toBe('Edit trip.destination');
    expect(stack[0].opsLog).toEqual(seed);
  });
});

describe('useUndo', () => {
  beforeEach(() => {
    useUndoStore.getState().clear();
    useWorkspaceStore.getState().reset();
    useWorkspaceStore.getState().setConversation('conv_1');
  });
  afterEach(() => {
    useUndoStore.getState().clear();
    useWorkspaceStore.getState().reset();
  });

  it('rolls the workspace back to the popped snapshot and returns true', () => {
    const pre: SourcedYOp[] = [humanOp('trip/destination', 'Hangzhou')];
    const post: SourcedYOp[] = [...pre, humanOp('trip/destination', 'Suzhou')];

    // Start with the "post" state, push a snapshot representing "pre"
    useWorkspaceStore.getState().setDerived({
      tree: { trees: [], relations: [] },
      sourceIndex: new Map(),
      opsLog: post,
    });
    useUndoStore.getState().push('Edit trip.destination', pre);

    const { result } = renderHook(() => useUndo());
    let didUndo = false;
    act(() => {
      didUndo = result.current.undo();
    });

    expect(didUndo).toBe(true);
    expect(useWorkspaceStore.getState().opsLog).toEqual(pre);
    expect(useUndoStore.getState().stack).toHaveLength(0);
  });

  it('returns false and leaves state untouched when the stack is empty', () => {
    const seed: SourcedYOp[] = [humanOp('trip/destination', 'Hangzhou')];
    useWorkspaceStore.getState().setDerived({
      tree: { trees: [], relations: [] },
      sourceIndex: new Map(),
      opsLog: seed,
    });

    const { result } = renderHook(() => useUndo());
    let didUndo = true;
    act(() => {
      didUndo = result.current.undo();
    });

    expect(didUndo).toBe(false);
    expect(useWorkspaceStore.getState().opsLog).toEqual(seed);
  });

  it('canUndo tracks the stack depth', () => {
    const { result, rerender } = renderHook(() => useUndo());
    expect(result.current.canUndo).toBe(false);

    act(() => {
      useUndoStore.getState().push('a', []);
    });
    rerender();
    expect(result.current.canUndo).toBe(true);
  });

  it('clears the stack when the active conversation changes', () => {
    useUndoStore.getState().push('stale', []);
    expect(useUndoStore.getState().stack).toHaveLength(1);

    renderHook(() => useUndo());
    // First render records the current conversationId; no clear yet.
    expect(useUndoStore.getState().stack).toHaveLength(1);

    act(() => {
      useWorkspaceStore.getState().setConversation('conv_2');
    });
    expect(useUndoStore.getState().stack).toHaveLength(0);
  });
});
