export const SSE_HEARTBEAT_INTERVAL_MS = 15_000;
export const SSE_HEARTBEAT_COMMENT = ': heartbeat\n\n';

const heartbeatBytes = new TextEncoder().encode(SSE_HEARTBEAT_COMMENT);

interface HeartbeatSseSource {
  start(controller: ReadableStreamDefaultController<Uint8Array>): void | PromiseLike<void>;
  cancel?(reason?: unknown): void | PromiseLike<void>;
}

/**
 * Run an SSE stream with an idle-safe comment heartbeat.
 *
 * SSE comments are ignored by EventSource clients, so the heartbeat keeps
 * proxies from considering the connection idle without becoming a product
 * event. The timer is released on normal completion, stream failure, or an
 * explicit client cancellation.
 */
export function createHeartbeatSseStream(
  source: HeartbeatSseSource,
  heartbeatIntervalMs = SSE_HEARTBEAT_INTERVAL_MS
): ReadableStream<Uint8Array> {
  let cancelled = false;
  let stopHeartbeat = () => {};

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let stopped = false;
      const timer = setInterval(() => {
        if (cancelled) return;
        try {
          controller.enqueue(heartbeatBytes);
        } catch {
          stopHeartbeat();
        }
      }, heartbeatIntervalMs);
      timer.unref?.();

      stopHeartbeat = () => {
        if (stopped) return;
        stopped = true;
        clearInterval(timer);
      };

      if (cancelled) stopHeartbeat();

      try {
        const started = source.start(controller);
        if (started === undefined) {
          stopHeartbeat();
          return;
        }
        void Promise.resolve(started).then(
          () => stopHeartbeat(),
          (error: unknown) => {
            stopHeartbeat();
            if (!cancelled) controller.error(error);
          }
        );
      } catch (error) {
        stopHeartbeat();
        if (!cancelled) controller.error(error);
      }
    },
    cancel(reason) {
      cancelled = true;
      stopHeartbeat();
      return source.cancel?.(reason);
    },
  });
}
