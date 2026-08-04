// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCommitCreatedDetail,
  COMMIT_CREATED_EVENT,
  COMMITS_BROADCAST_CHANNEL,
  dispatchCommitCreated,
  isCommitCreatedForProject,
} from '@/hooks/commits/commitEvents';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('commitEvents', () => {
  it('dispatches same-window and cross-window commit created events', () => {
    const postedMessages: unknown[] = [];
    const channelNames: string[] = [];
    const close = vi.fn();
    class MockBroadcastChannel {
      constructor(public name: string) {
        channelNames.push(name);
      }

      postMessage(message: unknown) {
        postedMessages.push(message);
      }

      close() {
        close();
      }
    }
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);

    const listener = vi.fn();
    window.addEventListener(COMMIT_CREATED_EVENT, listener);

    dispatchCommitCreated({ projectId: 'proj_1', hash: 'sha256:new', branch: 'main' });

    expect(listener).toHaveBeenCalledOnce();
    const detail = (listener.mock.calls[0]?.[0] as CustomEvent).detail;
    expect(detail).toEqual({
      type: 'commit.created',
      projectId: 'proj_1',
      branch: 'main',
      payload: { hash: 'sha256:new', branch: 'main' },
    });
    expect(channelNames).toEqual([COMMITS_BROADCAST_CHANNEL]);
    expect(postedMessages).toEqual([detail]);
    expect(close).toHaveBeenCalledOnce();

    window.removeEventListener(COMMIT_CREATED_EVENT, listener);
  });

  it('builds conversation-aware payloads and filters by project', () => {
    const detail = buildCommitCreatedDetail({
      projectId: 'proj_1',
      hash: 'sha256:new',
      branch: 'feature/a',
      conversationId: 'conv_1',
      conversationIds: ['conv_1'],
    });

    expect(detail.conversationId).toBe('conv_1');
    expect(detail.conversationIds).toEqual(['conv_1']);
    expect(isCommitCreatedForProject(detail, 'proj_1')).toBe(true);
    expect(isCommitCreatedForProject(detail, 'proj_other')).toBe(false);
  });
});
