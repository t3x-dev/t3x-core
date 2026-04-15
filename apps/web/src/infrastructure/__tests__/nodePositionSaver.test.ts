import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as commitsClient from '@/infrastructure/commits';
import * as conversationsClient from '@/infrastructure/conversations';
import { cancelAllPositionSaves, saveNodePosition } from '../nodePositionSaver';

// Regression test for Bug 5 (deep-walk, 2026-04-15): saveNodePosition must
// not PATCH /v1/commits/{draft_*}/position — that route looks up a sha256
// hash in the commits table and returns 404 for draft_* ids.

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cancelAllPositionSaves();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('saveNodePosition', () => {
  it('routes conv_* node ids to updateConversation', () => {
    const convSpy = vi
      .spyOn(conversationsClient, 'updateConversation')
      .mockResolvedValue({} as never);
    const commitSpy = vi
      .spyOn(commitsClient, 'updateCommitPosition')
      .mockResolvedValue({} as never);

    saveNodePosition('conv_abc', 'unit', { x: 10, y: 20 });
    vi.runAllTimers();

    expect(convSpy).toHaveBeenCalledWith('conv_abc', { position_x: 10, position_y: 20 });
    expect(commitSpy).not.toHaveBeenCalled();
  });

  it('routes commit hash node ids to updateCommitPosition', () => {
    const convSpy = vi
      .spyOn(conversationsClient, 'updateConversation')
      .mockResolvedValue({} as never);
    const commitSpy = vi
      .spyOn(commitsClient, 'updateCommitPosition')
      .mockResolvedValue({} as never);

    const hash = 'sha256:deadbeef';
    saveNodePosition(hash, 'unit', { x: 30, y: 40 });
    vi.runAllTimers();

    expect(commitSpy).toHaveBeenCalledWith(hash, 30, 40);
    expect(convSpy).not.toHaveBeenCalled();
  });

  it('skips persistence for draft_* node ids (Bug 5 regression)', () => {
    const convSpy = vi
      .spyOn(conversationsClient, 'updateConversation')
      .mockResolvedValue({} as never);
    const commitSpy = vi
      .spyOn(commitsClient, 'updateCommitPosition')
      .mockResolvedValue({} as never);

    saveNodePosition('draft_abc123', 'unit', { x: 50, y: 60 });
    vi.runAllTimers();

    // The regression that caused 404: draft_* fell through to updateCommitPosition.
    expect(commitSpy).not.toHaveBeenCalled();
    expect(convSpy).not.toHaveBeenCalled();
  });

  it('never calls updateCommitPosition for a draft id (explicit 404 guard)', () => {
    const commitSpy = vi
      .spyOn(commitsClient, 'updateCommitPosition')
      .mockResolvedValue({} as never);

    saveNodePosition('draft_xyz', 'unit', { x: 1, y: 2 });
    vi.runAllTimers();

    const calledWithDraft = commitSpy.mock.calls.some(([id]) =>
      typeof id === 'string' && id.startsWith('draft_')
    );
    expect(calledWithDraft).toBe(false);
  });

  it('skips non-unit kinds entirely', () => {
    const convSpy = vi
      .spyOn(conversationsClient, 'updateConversation')
      .mockResolvedValue({} as never);
    const commitSpy = vi
      .spyOn(commitsClient, 'updateCommitPosition')
      .mockResolvedValue({} as never);

    saveNodePosition('conv_abc', 'leaf', { x: 1, y: 2 });
    vi.runAllTimers();

    expect(convSpy).not.toHaveBeenCalled();
    expect(commitSpy).not.toHaveBeenCalled();
  });
});
