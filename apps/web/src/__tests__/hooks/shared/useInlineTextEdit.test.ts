// @vitest-environment jsdom

import type { Source, SourcedYOp } from '@t3x-dev/core';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const addSpanAsYOpsMock = vi.fn();
const resolveHumanSourceMock = vi.fn();

vi.mock('@/commands/yops/addSpanCommand', () => ({
  addSpanAsYOps: (...args: unknown[]) => addSpanAsYOpsMock(...args),
}));

vi.mock('@/commands/yops/goldEditBuilder', () => ({
  resolveHumanSource: (...args: unknown[]) => resolveHumanSourceMock(...args),
}));

import { useInlineTextEdit } from '@/hooks/shared/useInlineTextEdit';
import { useWorkspaceStore } from '@/store/workspaceStore';

function llmSource(): Source {
  return {
    type: 'llm',
    model: 'test-model',
    at: '2026-05-06T00:00:00.000Z',
    turn_ref: {
      turn_hash: 'turn_1',
      quote: 'psychology',
      start_char: 10,
      end_char: 20,
    },
  };
}

function inlineSource(): Source {
  return {
    type: 'human',
    author: 'Local Workspace',
    at: '2026-05-06T00:00:00.000Z',
    surface: 'inline',
  };
}

function seedTree() {
  useWorkspaceStore.getState().setConversation('conv_1');
  useWorkspaceStore.getState().setTurns([
    {
      turn_hash: 'turn_1',
      role: 'assistant',
      content: 'Soccer taps into psychology.',
    },
  ]);
  useWorkspaceStore.getState().setDerived({
    tree: {
      trees: [
        {
          key: 'sports',
          slots: {},
          children: [
            {
              key: 'soccer',
              slots: {
                description: 'Soccer taps into psychology.',
              },
              children: [],
            },
          ],
        },
      ],
      relations: [],
    },
    sourceIndex: new Map([['sports/soccer/description', llmSource()]]),
    opsLog: [],
  });
}

describe('useInlineTextEdit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.getState().reset();
    resolveHumanSourceMock.mockResolvedValue(inlineSource());
    addSpanAsYOpsMock.mockResolvedValue([]);
    seedTree();
  });

  it('stages an inline edit as draft YOps without applying it', async () => {
    const { result } = renderHook(() => useInlineTextEdit());

    await act(async () => {
      await result.current.applyInlineEdit({
        action: 'edit',
        turnHash: 'turn_1',
        text: 'psychology',
        replacementText: 'group psychology',
        start: 10,
        end: 20,
      });
    });

    const state = useWorkspaceStore.getState();
    expect(state.hasDraft).toBe(true);
    expect(state.opsLog).toEqual([]);
    expect(state.draftOps[0]).toMatchObject({
      set: {
        path: 'sports/soccer/description',
        value: 'Soccer taps into group psychology.',
      },
      source: { type: 'human', surface: 'inline' },
    });
    expect(state.draftTree?.trees[0].children[0].slots.description).toBe(
      'Soccer taps into group psychology.'
    );
  });

  it('stages inline delete by removing only the selected text from a mapped slot', async () => {
    const { result } = renderHook(() => useInlineTextEdit());

    await act(async () => {
      await result.current.applyInlineEdit({
        action: 'delete',
        turnHash: 'turn_1',
        text: 'psychology',
        start: 10,
        end: 20,
      });
    });

    const state = useWorkspaceStore.getState();
    expect(state.hasDraft).toBe(true);
    expect(state.draftOps[0]).toMatchObject({
      set: {
        path: 'sports/soccer/description',
        value: 'Soccer taps into.',
      },
      source: { type: 'human', surface: 'inline' },
    });
  });

  it('stages selected-text add with inline human provenance', async () => {
    addSpanAsYOpsMock.mockResolvedValue([
      {
        set: { path: 'sports/soccer/emotion', value: 'Soccer creates emotion.' },
        source: llmSource(),
      } as SourcedYOp,
    ]);
    const { result } = renderHook(() => useInlineTextEdit());

    await act(async () => {
      await result.current.applyInlineEdit({
        action: 'add',
        turnHash: 'turn_1',
        text: 'emotion',
        replacementText: 'emotion',
        start: 30,
        end: 37,
      });
    });

    expect(addSpanAsYOpsMock).toHaveBeenCalledWith({
      conversationId: 'conv_1',
      turnHash: 'turn_1',
      text: 'emotion',
      start: 30,
      end: 37,
    });
    expect(useWorkspaceStore.getState().draftOps[0].source).toMatchObject({
      type: 'human',
      surface: 'inline',
    });
  });

  it('rejects inline text edits after commit', async () => {
    useWorkspaceStore.getState().setCommitted(true);
    const { result } = renderHook(() => useInlineTextEdit());

    expect(result.current.enabled).toBe(false);

    let error: unknown;
    await act(async () => {
      try {
        await result.current.applyInlineEdit({
          action: 'edit',
          turnHash: 'turn_1',
          text: 'psychology',
          replacementText: 'group psychology',
          start: 10,
          end: 20,
        });
      } catch (err) {
        error = err;
      }
    });

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Committed conversations are read-only.');
    expect(resolveHumanSourceMock).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().hasDraft).toBe(false);
  });
});
