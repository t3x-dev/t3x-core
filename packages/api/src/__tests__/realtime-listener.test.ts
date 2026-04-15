import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventBus } from '../lib/event-bus';
import { startRealtimeListener, stopRealtimeListener } from '../lib/realtime-listener';

describe('realtime-listener', () => {
  beforeEach(async () => {
    await stopRealtimeListener();
  });

  it('forwards a fetched event row to eventBus.broadcast', async () => {
    const broadcastSpy = vi.spyOn(eventBus, 'broadcast');
    broadcastSpy.mockClear();
    let capturedHandler: ((payload: string) => void) | null = null;
    const mockPg = {
      listen: vi.fn(async (_channel: string, cb: (payload: string) => void) => {
        capturedHandler = cb;
        return { unlisten: async () => {} };
      }),
    };
    const mockFetch = vi.fn(async (id: bigint) => ({
      id,
      type: 'commit.created',
      projectId: 'proj_x',
      conversationId: null,
      payload: { hash: 'sha256:abc' },
      createdAt: new Date(2026, 3, 15, 12, 0, 0),
    }));

    await startRealtimeListener({
      pg: mockPg as unknown as Parameters<typeof startRealtimeListener>[0]['pg'],
      fetchEventById: mockFetch,
    });
    expect(mockPg.listen).toHaveBeenCalledWith('t3x_events', expect.any(Function));

    // Simulate a notification arriving
    capturedHandler!('42');
    await new Promise((r) => setTimeout(r, 10));

    expect(mockFetch).toHaveBeenCalledWith(42n);
    expect(broadcastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'commit.created',
        projectId: 'proj_x',
        payload: expect.objectContaining({ hash: 'sha256:abc', event_id: '42' }),
      })
    );
  });

  it('skips broadcast if event row not found', async () => {
    const broadcastSpy = vi.spyOn(eventBus, 'broadcast');
    broadcastSpy.mockClear();
    let capturedHandler: ((payload: string) => void) | null = null;
    const mockPg = {
      listen: vi.fn(async (_channel: string, cb: (payload: string) => void) => {
        capturedHandler = cb;
        return { unlisten: async () => {} };
      }),
    };
    const mockFetch = vi.fn(async () => null);

    await startRealtimeListener({
      pg: mockPg as unknown as Parameters<typeof startRealtimeListener>[0]['pg'],
      fetchEventById: mockFetch,
    });
    capturedHandler!('99');
    await new Promise((r) => setTimeout(r, 10));

    expect(mockFetch).toHaveBeenCalledWith(99n);
    expect(broadcastSpy).not.toHaveBeenCalled();
  });

  it('handler swallows errors without throwing', async () => {
    let capturedHandler: ((payload: string) => void) | null = null;
    const mockPg = {
      listen: vi.fn(async (_channel: string, cb: (payload: string) => void) => {
        capturedHandler = cb;
        return { unlisten: async () => {} };
      }),
    };
    const mockFetch = vi.fn(async () => {
      throw new Error('db down');
    });

    await startRealtimeListener({
      pg: mockPg as unknown as Parameters<typeof startRealtimeListener>[0]['pg'],
      fetchEventById: mockFetch,
    });
    // Calling the handler with a bad payload should not throw synchronously
    expect(() => capturedHandler!('not-a-number')).not.toThrow();
    capturedHandler!('1');
    await new Promise((r) => setTimeout(r, 10));
    // No assertion on broadcast — point is "doesn't throw"
  });

  it('startRealtimeListener is idempotent', async () => {
    const mockPg = {
      listen: vi.fn(async () => ({ unlisten: async () => {} })),
    };
    const mockFetch = vi.fn();
    await startRealtimeListener({
      pg: mockPg as unknown as Parameters<typeof startRealtimeListener>[0]['pg'],
      fetchEventById: mockFetch,
    });
    await startRealtimeListener({
      pg: mockPg as unknown as Parameters<typeof startRealtimeListener>[0]['pg'],
      fetchEventById: mockFetch,
    });
    expect(mockPg.listen).toHaveBeenCalledTimes(1);
  });

  it('preserves notification order across multiple events', async () => {
    const broadcastSpy = vi.spyOn(eventBus, 'broadcast');
    broadcastSpy.mockClear();
    let capturedHandler: ((payload: string) => void) | null = null;
    const mockPg = {
      listen: vi.fn(async (_channel: string, cb: (payload: string) => void) => {
        capturedHandler = cb;
        return { unlisten: async () => {} };
      }),
    };
    // fetchEventById returns event whose type encodes the input id, so we can check order
    const mockFetch = vi.fn(async (id: bigint) => ({
      id,
      type: 'commit.created',
      projectId: 'proj_x',
      conversationId: null,
      payload: { seq: id.toString() },
      createdAt: new Date(),
    }));

    await startRealtimeListener({
      pg: mockPg as unknown as Parameters<typeof startRealtimeListener>[0]['pg'],
      fetchEventById: mockFetch,
    });
    capturedHandler!('1');
    capturedHandler!('2');
    capturedHandler!('3');
    await new Promise((r) => setTimeout(r, 30));

    expect(broadcastSpy).toHaveBeenCalledTimes(3);
    // Extract seq from each broadcast call to verify order
    const seqs = broadcastSpy.mock.calls.map(
      (c) => (c[0] as { payload: { seq: string } }).payload.seq
    );
    expect(seqs).toEqual(['1', '2', '3']);
  });

  it('stopRealtimeListener is safe to call when not started or twice in a row', async () => {
    // Not started yet
    await expect(stopRealtimeListener()).resolves.toBeUndefined();

    // Start, stop, stop again
    const mockPg = {
      listen: vi.fn(async () => ({ unlisten: async () => {} })),
    };
    await startRealtimeListener({
      pg: mockPg as unknown as Parameters<typeof startRealtimeListener>[0]['pg'],
      fetchEventById: vi.fn(),
    });
    await stopRealtimeListener();
    await expect(stopRealtimeListener()).resolves.toBeUndefined();
  });
});
