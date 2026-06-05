// @vitest-environment jsdom

import type { SourcedYOp } from '@t3x-dev/core';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectScriptText, useWorkspaceStore } from '@/store/workspaceStore';

const requestYOpsRevisionMock = vi.fn();
const toastWarningMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock('@/commands/yops/reviseAdapter', () => ({
  requestYOpsRevision: (...args: unknown[]) => requestYOpsRevisionMock(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    warning: (...args: unknown[]) => toastWarningMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

import { useYOpsRevision } from '@/hooks/drafts/useYOpsRevision';

function source(): SourcedYOp['source'] {
  return {
    type: 'llm',
    model: 'gpt-5.4',
    at: '2026-06-05T00:00:00.000Z',
    turn_ref: {
      turn_hash: 'sha256:t1',
      quote: 'Use Tokyo.',
      start_char: 0,
      end_char: 10,
    },
  };
}

describe('useYOpsRevision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.getState().reset();
    useWorkspaceStore.getState().setConversation('conv_1');
    useWorkspaceStore
      .getState()
      .setTurns([{ turn_hash: 'sha256:t1', role: 'user', content: 'Use Tokyo.' }]);
    useWorkspaceStore.getState().setDerived({
      tree: {
        trees: [{ key: 'trip', slots: { destination: 'Hangzhou' }, children: [] }],
        relations: [],
      },
      sourceIndex: new Map(),
      opsLog: [],
    });
    useWorkspaceStore.getState().setDraft({
      ops: [
        {
          set: { path: 'trip/destination', value: 'Hangzhou' },
          source: source(),
        } as SourcedYOp,
      ],
      tree: {
        trees: [{ key: 'trip', slots: { destination: 'Hangzhou' }, children: [] }],
        relations: [],
      },
    });
  });

  afterEach(() => {
    useWorkspaceStore.getState().reset();
  });

  it('requests a revision and stages successful revised ops without losing LLM provenance', async () => {
    requestYOpsRevisionMock.mockResolvedValueOnce({
      kind: 'ok',
      ops: [
        {
          set: { path: 'trip/destination', value: 'Tokyo' },
          source: source(),
        },
      ],
      reason: 'Updated destination.',
      dry_run: {
        ok: true,
        applied: 1,
        preview: {
          trees: [{ key: 'trip', slots: { destination: 'Tokyo' }, children: [] }],
          relations: [],
        },
      },
    });

    const { result } = renderHook(() =>
      useYOpsRevision({ selectedProvider: 'openai', selectedModel: 'gpt-5.4' })
    );

    await act(async () => {
      await result.current.revise('Use Tokyo instead.');
    });

    expect(requestYOpsRevisionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv_1',
        feedback: 'Use Tokyo instead.',
        provider: 'openai',
        model: 'gpt-5.4',
        trees: [{ key: 'trip', slots: { destination: 'Hangzhou' }, children: [] }],
        turns: [{ turn_hash: 'sha256:t1', role: 'user', content: 'Use Tokyo.' }],
      })
    );
    const after = useWorkspaceStore.getState();
    expect(selectScriptText(after)).toContain('Tokyo');
    expect(after.draftOps[0]).toMatchObject({
      set: { path: 'trip/destination', value: 'Tokyo' },
      source: { type: 'llm', model: 'gpt-5.4' },
    });
    expect(after.editorOverride).toBeNull();
    expect(result.current.result?.kind).toBe('ok');
    expect(toastSuccessMock).toHaveBeenCalledWith('Revised YOps are ready to review.');
  });

  it('warns and skips the API call for empty feedback', async () => {
    const { result } = renderHook(() =>
      useYOpsRevision({ selectedProvider: 'openai', selectedModel: 'gpt-5.4' })
    );

    await act(async () => {
      await result.current.revise('   ');
    });

    expect(requestYOpsRevisionMock).not.toHaveBeenCalled();
    expect(toastWarningMock).toHaveBeenCalledWith('Describe what should change first.');
  });
});
