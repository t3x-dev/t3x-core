// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createSourceTextRevision: vi.fn(),
  updateSourceTextRevision: vi.fn(),
  callExtractionLLM: vi.fn(),
}));

vi.mock('@/infrastructure/sourceTextRevisions', () => ({
  createSourceTextRevision: (...args: unknown[]) => mocks.createSourceTextRevision(...args),
  updateSourceTextRevision: (...args: unknown[]) => mocks.updateSourceTextRevision(...args),
}));

vi.mock('@/commands/yops/llmAdapter', () => ({
  callExtractionLLM: (...args: unknown[]) => mocks.callExtractionLLM(...args),
}));

import { useSourceTextDraft } from '@/hooks/shared/useSourceTextDraft';
import { useChatStore } from '@/store/chatStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

describe('useSourceTextDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callExtractionLLM.mockResolvedValue({ ops: [] });
    mocks.updateSourceTextRevision.mockResolvedValue({});
    mocks.createSourceTextRevision.mockImplementation((input) =>
      Promise.resolve({
        revision_id: 'str_test',
        status: 'saved',
        base_content_hash: 'sha256:test',
        content: input.content,
        spans: input.spans,
      })
    );
    useChatStore.setState({ activeProjectId: 'proj_1', activeConversationId: 'conv_1' });
    useWorkspaceStore.getState().reset();
    useWorkspaceStore.getState().setConversation('conv_1');
    useWorkspaceStore.getState().setTurns([
      {
        turn_hash: 'turn_1',
        role: 'assistant',
        content: 'Soccer taps into psychology.',
      },
    ]);
  });

  it('persists the source draft without staging YOps when no patch is generated', async () => {
    const { result } = renderHook(() => useSourceTextDraft());

    await act(async () => {
      await result.current.applySourceTextEdit({
        action: 'edit',
        turnHash: 'turn_1',
        turnRole: 'assistant',
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
    expect(mocks.createSourceTextRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj_1',
        conversationId: 'conv_1',
        content: 'Soccer taps into group identity.',
      })
    );
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
    expect(useWorkspaceStore.getState().sourceTextDrafts.turn_1.turnRole).toBe('assistant');
  });

  it('rejects edits to user questions', async () => {
    useWorkspaceStore.getState().setTurns([
      {
        turn_hash: 'turn_user',
        role: 'user',
        content: 'Can I edit this question?',
      },
    ]);
    const { result } = renderHook(() => useSourceTextDraft());

    let error: unknown;
    await act(async () => {
      try {
        await result.current.applySourceTextEdit({
          action: 'edit',
          turnHash: 'turn_user',
          turnRole: 'user',
          text: 'question',
          start: 16,
          end: 24,
          replacementText: 'prompt',
        });
      } catch (err) {
        error = err;
      }
    });

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('user questions are not editable');
    expect(mocks.createSourceTextRevision).not.toHaveBeenCalled();
  });
});
