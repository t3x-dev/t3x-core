// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSourceTextDraft } from '@/hooks/shared/useSourceTextDraft';
import { useWorkspaceStore } from '@/store/workspaceStore';

describe('useSourceTextDraft', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().reset();
    useWorkspaceStore.getState().setTurns([
      {
        turn_hash: 'turn_1',
        role: 'assistant',
        content: 'Soccer taps into psychology.',
      },
    ]);
  });

  it('updates the source draft without staging YOps', async () => {
    const { result } = renderHook(() => useSourceTextDraft());

    await act(async () => {
      await result.current.applySourceTextEdit({
        action: 'edit',
        turnHash: 'turn_1',
        text: 'psychology',
        start: 17,
        end: 27,
        replacementText: 'group identity',
      });
    });

    const state = useWorkspaceStore.getState();
    expect(state.sourceTextDrafts.turn_1.content).toBe('Soccer taps into group identity.');
    expect(state.hasDraft).toBe(false);
    expect(state.draftOps).toEqual([]);
  });

  it('can edit from selected turn text before workspace turns hydrate', async () => {
    useWorkspaceStore.getState().setTurns([]);
    const { result } = renderHook(() => useSourceTextDraft());

    await act(async () => {
      await result.current.applySourceTextEdit({
        action: 'edit',
        turnHash: 'turn_1',
        text: 'psychology',
        turnText: 'Soccer taps into psychology.',
        start: 17,
        end: 27,
        replacementText: 'group identity',
      });
    });

    expect(useWorkspaceStore.getState().sourceTextDrafts.turn_1.content).toBe(
      'Soccer taps into group identity.'
    );
  });
});
