// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { syncSavedTurnIntoWorkspace } from '@/hooks/conversations/syncSavedTurnIntoWorkspace';
import { useWorkspaceStore } from '@/store/workspaceStore';

describe('syncSavedTurnIntoWorkspace', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().reset();
  });

  it('appends a new turn when the workspace tracks the same conversation', () => {
    const ws = useWorkspaceStore.getState();
    ws.setConversation('conv_1');
    ws.setTurns([{ turn_hash: 'sha256:t0', role: 'user', content: 'existing' }]);

    syncSavedTurnIntoWorkspace('conv_1', {
      turn_hash: 'sha256:t1',
      role: 'user',
      content: 'fresh user msg',
    });

    expect(useWorkspaceStore.getState().turns).toEqual([
      { turn_hash: 'sha256:t0', role: 'user', content: 'existing' },
      { turn_hash: 'sha256:t1', role: 'user', content: 'fresh user msg' },
    ]);
  });

  it('is a no-op when the workspace is tracking a different conversation', () => {
    // A stale save from a conversation the user has navigated away from
    // must not contaminate the workspace of the conv they are viewing.
    const ws = useWorkspaceStore.getState();
    ws.setConversation('conv_current');
    ws.setTurns([{ turn_hash: 'sha256:current', role: 'assistant', content: 'current' }]);

    syncSavedTurnIntoWorkspace('conv_other', {
      turn_hash: 'sha256:t1',
      role: 'user',
      content: 'leaked',
    });

    expect(useWorkspaceStore.getState().turns).toEqual([
      { turn_hash: 'sha256:current', role: 'assistant', content: 'current' },
    ]);
  });

  it('de-dupes by turn_hash so a retried save is idempotent', () => {
    const ws = useWorkspaceStore.getState();
    ws.setConversation('conv_1');
    ws.setTurns([{ turn_hash: 'sha256:t1', role: 'user', content: 'first' }]);

    syncSavedTurnIntoWorkspace('conv_1', {
      turn_hash: 'sha256:t1',
      role: 'user',
      content: 'first',
    });

    expect(useWorkspaceStore.getState().turns).toEqual([
      { turn_hash: 'sha256:t1', role: 'user', content: 'first' },
    ]);
  });
});
