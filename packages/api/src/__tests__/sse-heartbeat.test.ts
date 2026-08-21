import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createHeartbeatSseStream,
  SSE_HEARTBEAT_COMMENT,
  SSE_HEARTBEAT_INTERVAL_MS,
} from '../lib/sse-heartbeat';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe('SSE heartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits an SSE comment while the business stream is idle', async () => {
    let finishBusinessWork: (() => void) | undefined;
    const stream = createHeartbeatSseStream({
      async start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"status"}\n\n'));
        await new Promise<void>((resolve) => {
          finishBusinessWork = resolve;
        });
        controller.close();
      },
    });
    const reader = stream.getReader();

    const first = await reader.read();
    expect(decoder.decode(first.value)).toBe('data: {"type":"status"}\n\n');

    const heartbeatRead = reader.read();
    await vi.advanceTimersByTimeAsync(SSE_HEARTBEAT_INTERVAL_MS);
    const heartbeat = await heartbeatRead;

    expect(decoder.decode(heartbeat.value)).toBe(SSE_HEARTBEAT_COMMENT);
    expect(decoder.decode(heartbeat.value).startsWith(':')).toBe(true);

    finishBusinessWork?.();
    await reader.read();
  });

  it('clears its timer as soon as the client cancels the stream', async () => {
    const stream = createHeartbeatSseStream({
      start: () =>
        new Promise<void>(() => {
          // Deliberately idle until the client disconnects.
        }),
    });
    const reader = stream.getReader();

    expect(vi.getTimerCount()).toBe(1);
    await reader.cancel();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its timer when the business stream finishes normally', async () => {
    const stream = createHeartbeatSseStream({
      start(controller) {
        controller.close();
      },
    });

    await stream.getReader().read();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its timer when stream setup fails synchronously', async () => {
    const stream = createHeartbeatSseStream({
      start() {
        throw new Error('stream setup failed');
      },
    });

    await expect(stream.getReader().read()).rejects.toThrow('stream setup failed');

    expect(vi.getTimerCount()).toBe(0);
  });
});
