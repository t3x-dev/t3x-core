import { describe, expect, it, vi } from 'vitest';
import { eventBus, type RealtimeEvent } from '../lib/event-bus';

describe('eventBus', () => {
  it('broadcasts to the conversation room', () => {
    const handler = vi.fn();
    eventBus.on('room:conv_test_a', handler);

    const event: RealtimeEvent = {
      type: 'extraction.done',
      conversationId: 'conv_test_a',
      projectId: 'proj_test_a',
      timestamp: Date.now(),
    };
    eventBus.broadcast(event);

    expect(handler).toHaveBeenCalledWith(event);
    eventBus.off('room:conv_test_a', handler);
  });

  it('also broadcasts to the project room when projectId is present', () => {
    const projectHandler = vi.fn();
    eventBus.on('room:project:proj_test_b', projectHandler);

    const event: RealtimeEvent = {
      type: 'yops.applied',
      conversationId: 'conv_test_b',
      projectId: 'proj_test_b',
      timestamp: Date.now(),
    };
    eventBus.broadcast(event);

    expect(projectHandler).toHaveBeenCalledWith(event);
    eventBus.off('room:project:proj_test_b', projectHandler);
  });

  it('accepts conversation.renamed as an event type', () => {
    const handler = vi.fn();
    eventBus.on('room:project:proj_test_c', handler);

    const event: RealtimeEvent = {
      type: 'conversation.renamed',
      conversationId: 'conv_test_c',
      projectId: 'proj_test_c',
      payload: { alias: 'new_alias', previous_alias: null },
      timestamp: Date.now(),
    };
    eventBus.broadcast(event);

    expect(handler).toHaveBeenCalledWith(event);
    eventBus.off('room:project:proj_test_c', handler);
  });
});
