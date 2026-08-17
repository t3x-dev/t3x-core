import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as conversationsClient from '@/infrastructure/conversations';
import { cancelAllPositionSaves, saveNodePosition } from '../nodePositionSaver';

// Immutable Commit snapshots and ephemeral draft nodes have no position
// mutation route. Only mutable staging conversations persist positions.

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

    saveNodePosition('conv_abc', 'unit', { x: 10, y: 20 });
    vi.runAllTimers();

    expect(convSpy).toHaveBeenCalledWith('conv_abc', { position_x: 10, position_y: 20 });
  });

  it('does not persist immutable commit snapshot positions', () => {
    const convSpy = vi
      .spyOn(conversationsClient, 'updateConversation')
      .mockResolvedValue({} as never);

    const hash = 'sha256:deadbeef';
    saveNodePosition(hash, 'unit', { x: 30, y: 40 });
    vi.runAllTimers();

    expect(convSpy).not.toHaveBeenCalled();
  });

  it('skips persistence for draft_* node ids (Bug 5 regression)', () => {
    const convSpy = vi
      .spyOn(conversationsClient, 'updateConversation')
      .mockResolvedValue({} as never);

    saveNodePosition('draft_abc123', 'unit', { x: 50, y: 60 });
    vi.runAllTimers();

    expect(convSpy).not.toHaveBeenCalled();
  });

  it('skips non-unit kinds entirely', () => {
    const convSpy = vi
      .spyOn(conversationsClient, 'updateConversation')
      .mockResolvedValue({} as never);

    saveNodePosition('conv_abc', 'leaf', { x: 1, y: 2 });
    vi.runAllTimers();

    expect(convSpy).not.toHaveBeenCalled();
  });
});
