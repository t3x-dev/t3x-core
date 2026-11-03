import { describe, expect, it, vi } from 'vitest';
import { eventBus, type RealtimeEvent } from '../lib/event-bus';
import { roomManager } from '../lib/room-manager';

function fakeWs() {
  const sent: string[] = [];
  return {
    sent,
    send: (data: string) => sent.push(data),
    close: () => {},
    readyState: 1,
  } as unknown as WebSocket;
}

function makeConnection(id: string) {
  return {
    id,
    ws: { send: vi.fn(), close: vi.fn(), readyState: 1 } as never,
    userId: id,
    joinedAt: Date.now(),
  };
}

describe('roomManager', () => {
  it('joins a conversation room and forwards broadcasts', () => {
    const ws = fakeWs();
    roomManager.join('conv:conv_rm_a', {
      id: 'c1',
      ws,
      userId: 'user1',
      joinedAt: Date.now(),
    });

    const event: RealtimeEvent = {
      type: 'extraction.done',
      conversationId: 'conv_rm_a',
      projectId: 'proj_rm_a',
      timestamp: Date.now(),
    };
    eventBus.broadcast(event);

    expect((ws as unknown as { sent: string[] }).sent.length).toBeGreaterThan(0);
    roomManager.leave('conv:conv_rm_a', 'c1');
  });

  it('joins a project room and receives broadcasts via project channel', () => {
    const ws = fakeWs();
    roomManager.join('project:proj_rm_b', {
      id: 'c2',
      ws,
      userId: 'user2',
      joinedAt: Date.now(),
    });

    const event: RealtimeEvent = {
      type: 'conversation.renamed',
      conversationId: 'conv_rm_b',
      projectId: 'proj_rm_b',
      payload: { alias: 'demo' },
      timestamp: Date.now(),
    };
    eventBus.broadcast(event);

    expect((ws as unknown as { sent: string[] }).sent.length).toBeGreaterThan(0);
    roomManager.leave('project:proj_rm_b', 'c2');
  });

  it('delivers principal-private Workspace events only to their owner', () => {
    const wsA = fakeWs();
    const wsB = fakeWs();
    roomManager.join('project:proj_private', {
      id: 'private-a',
      ws: wsA,
      userId: 'test-a',
      workspaceOwner: { kind: 'human', id: 'test-a' },
      joinedAt: Date.now(),
    });
    roomManager.join('project:proj_private', {
      id: 'private-b',
      ws: wsB,
      userId: 'test-b',
      workspaceOwner: { kind: 'human', id: 'test-b' },
      joinedAt: Date.now(),
    });
    const beforeA = (wsA as unknown as { sent: string[] }).sent.length;
    const beforeB = (wsB as unknown as { sent: string[] }).sent.length;

    eventBus.broadcast({
      type: 'draft.changed',
      conversationId: '',
      projectId: 'proj_private',
      payload: {
        workspace_id: 'workspace-a',
        owner_principal_kind: 'human',
        owner_principal_id: 'test-a',
        revision: 2,
      },
      timestamp: Date.now(),
    });

    expect((wsA as unknown as { sent: string[] }).sent).toHaveLength(beforeA + 1);
    expect((wsB as unknown as { sent: string[] }).sent).toHaveLength(beforeB);
    roomManager.leave('project:proj_private', 'private-a');
    roomManager.leave('project:proj_private', 'private-b');
  });

  it('keeps legacy unowned Workspace events inside AUTH_DISABLED sessions', () => {
    const authenticatedWs = fakeWs();
    const localWs = fakeWs();
    roomManager.join('project:proj_legacy', {
      id: 'legacy-authenticated',
      ws: authenticatedWs,
      userId: 'test-a',
      workspaceOwner: { kind: 'human', id: 'test-a' },
      joinedAt: Date.now(),
    });
    roomManager.join('project:proj_legacy', {
      id: 'legacy-local',
      ws: localWs,
      userId: 'local',
      authenticationDisabled: true,
      joinedAt: Date.now(),
    });
    const authenticatedBefore = (authenticatedWs as unknown as { sent: string[] }).sent.length;
    const localBefore = (localWs as unknown as { sent: string[] }).sent.length;

    eventBus.broadcast({
      type: 'draft.changed',
      conversationId: '',
      projectId: 'proj_legacy',
      payload: { workspace_id: 'legacy-workspace', revision: 2 },
      timestamp: Date.now(),
    });

    expect((authenticatedWs as unknown as { sent: string[] }).sent).toHaveLength(
      authenticatedBefore
    );
    expect((localWs as unknown as { sent: string[] }).sent).toHaveLength(localBefore + 1);
    roomManager.leave('project:proj_legacy', 'legacy-authenticated');
    roomManager.leave('project:proj_legacy', 'legacy-local');
  });

  it('leaving cleans up the room when no connections remain', () => {
    const ws = fakeWs();
    roomManager.join('conv:conv_rm_c', {
      id: 'c3',
      ws,
      userId: 'user3',
      joinedAt: Date.now(),
    });
    roomManager.leave('conv:conv_rm_c', 'c3');

    expect(roomManager.getRoomSize('conv:conv_rm_c')).toBe(0);
  });

  it('disconnects every socket authenticated by a revoked Session', () => {
    const first = makeConnection('session-first');
    const second = makeConnection('session-second');
    first.sessionId = 'sess_revoked';
    second.sessionId = 'sess_other';
    roomManager.join('project:session-project', first);
    roomManager.join('conv:session-conversation', first);
    roomManager.join('project:session-project', second);

    roomManager.disconnectSession('sess_revoked');

    expect(first.ws.close).toHaveBeenCalledWith(1008, 'Session revoked');
    expect(second.ws.close).not.toHaveBeenCalled();
    expect(roomManager.getRoomSize('project:session-project')).toBe(1);
    expect(roomManager.getRoomSize('conv:session-conversation')).toBe(0);
  });
});
