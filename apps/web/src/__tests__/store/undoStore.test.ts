import type { SourcedYOp } from '@t3x-dev/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { UNDO_STACK_LIMIT, useUndoStore } from '@/store/undoStore';

function humanOp(path: string): SourcedYOp {
  return {
    set: { path, value: 'x' },
    source: { type: 'human', author: 'alice', at: '2026-04-24T00:00:00Z' },
  } as SourcedYOp;
}

describe('undoStore', () => {
  beforeEach(() => {
    useUndoStore.getState().clear();
  });

  it('push then pop returns the most-recent snapshot', () => {
    const ops1: SourcedYOp[] = [];
    const ops2: SourcedYOp[] = [humanOp('trip/destination')];
    useUndoStore.getState().push('first', ops1);
    useUndoStore.getState().push('second', ops2);

    const top = useUndoStore.getState().pop();
    expect(top?.label).toBe('second');
    expect(top?.opsLog).toBe(ops2);

    const next = useUndoStore.getState().pop();
    expect(next?.label).toBe('first');

    expect(useUndoStore.getState().pop()).toBeNull();
  });

  it('canUndo reflects stack emptiness', () => {
    expect(useUndoStore.getState().canUndo()).toBe(false);
    useUndoStore.getState().push('a', []);
    expect(useUndoStore.getState().canUndo()).toBe(true);
    useUndoStore.getState().pop();
    expect(useUndoStore.getState().canUndo()).toBe(false);
  });

  it('enforces UNDO_STACK_LIMIT by dropping oldest entries', () => {
    for (let i = 0; i < UNDO_STACK_LIMIT + 5; i++) {
      useUndoStore.getState().push(`e${i}`, []);
    }
    const state = useUndoStore.getState();
    expect(state.stack.length).toBe(UNDO_STACK_LIMIT);
    // Oldest surviving entry is e5 (the first 5 got dropped)
    expect(state.stack[0].label).toBe('e5');
    expect(state.stack[state.stack.length - 1].label).toBe(`e${UNDO_STACK_LIMIT + 4}`);
  });

  it('clear empties the stack', () => {
    useUndoStore.getState().push('a', []);
    useUndoStore.getState().push('b', []);
    useUndoStore.getState().clear();
    expect(useUndoStore.getState().stack).toEqual([]);
  });
});
