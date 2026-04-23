// @vitest-environment jsdom

import type { Source } from '@t3x-dev/core';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const applyEditMock = vi.fn();

vi.mock('@/hooks/shared/useGoldEdit', () => ({
  useGoldEdit: () => ({ applyEdit: applyEditMock, enabled: true }),
}));

import { useSpanActions } from '@/hooks/shared/useSpanActions';
import { useWorkspaceStore } from '@/store/workspaceStore';

function llmSource(turnHash: string, start: number, end: number, quote: string): Source {
  return {
    type: 'llm',
    model: 'test-model',
    at: '2026-04-23T00:00:00Z',
    turn_ref: { turn_hash: turnHash, quote, start_char: start, end_char: end },
  };
}

describe('useSpanActions', () => {
  beforeEach(() => {
    applyEditMock.mockReset();
    applyEditMock.mockResolvedValue(undefined);
    useWorkspaceStore.getState().reset();
  });

  it('previewRemoveSpan reflects the current sourceIndex', () => {
    useWorkspaceStore.getState().setDerived({
      tree: { trees: [], relations: [] },
      sourceIndex: new Map<string, Source>([
        ['trip/destination', llmSource('t1', 0, 10, 'Hangzhou')],
        ['trip/month', llmSource('t1', 20, 30, 'late May')],
      ]),
      opsLog: [],
    });

    const { result } = renderHook(() => useSpanActions());
    const matches = result.current.previewRemoveSpan({ turnHash: 't1', start: 0, end: 15 });
    expect(matches.map((m) => m.path)).toEqual(['trip/destination']);
  });

  it('removeSpan emits one unset per overlapping slot and returns the count', async () => {
    useWorkspaceStore.getState().setDerived({
      tree: { trees: [], relations: [] },
      sourceIndex: new Map<string, Source>([
        ['trip/destination', llmSource('t1', 0, 10, 'Hangzhou')],
        ['trip/month', llmSource('t1', 20, 30, 'late May')],
        ['trip/travelers', llmSource('t1', 40, 50, 'not in span')],
      ]),
      opsLog: [],
    });

    const { result } = renderHook(() => useSpanActions());

    let removed = 0;
    await act(async () => {
      removed = await result.current.removeSpan({ turnHash: 't1', start: 0, end: 35 });
    });

    expect(removed).toBe(2);
    expect(applyEditMock).toHaveBeenCalledTimes(2);
    expect(applyEditMock).toHaveBeenNthCalledWith(1, { unset: { path: 'trip/destination' } });
    expect(applyEditMock).toHaveBeenNthCalledWith(2, { unset: { path: 'trip/month' } });
  });

  it('dispatches drop instead of unset for overlapping root-level nodes', async () => {
    useWorkspaceStore.getState().setDerived({
      tree: { trees: [], relations: [] },
      sourceIndex: new Map<string, Source>([['sights', llmSource('t2', 0, 6, 'sights')]]),
      opsLog: [],
    });

    const { result } = renderHook(() => useSpanActions());
    await act(async () => {
      await result.current.removeSpan({ turnHash: 't2', start: 0, end: 10 });
    });
    expect(applyEditMock).toHaveBeenCalledWith({ drop: { path: 'sights' } });
  });

  it('returns 0 and dispatches nothing when no mappings overlap the span', async () => {
    useWorkspaceStore.getState().setDerived({
      tree: { trees: [], relations: [] },
      sourceIndex: new Map<string, Source>([
        ['trip/destination', llmSource('t1', 0, 10, 'Hangzhou')],
      ]),
      opsLog: [],
    });

    const { result } = renderHook(() => useSpanActions());
    let removed = -1;
    await act(async () => {
      removed = await result.current.removeSpan({ turnHash: 't1', start: 40, end: 60 });
    });
    expect(removed).toBe(0);
    expect(applyEditMock).not.toHaveBeenCalled();
  });
});
