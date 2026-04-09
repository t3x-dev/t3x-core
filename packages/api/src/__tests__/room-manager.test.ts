import { describe, expect, it } from 'vitest';
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
});
