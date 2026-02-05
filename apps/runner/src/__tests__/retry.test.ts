import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('pino', () => {
  const noop = () => {};
  const logger = { debug: noop, info: noop, warn: noop, error: noop };
  return { default: () => logger };
});

const { retry, fetchWithRetry } = await import('../utils/retry.js');

describe('retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retry(fn, { maxRetries: 3 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and eventually succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const promise = retry(fn, { maxRetries: 3, initialDelayMs: 10, maxDelayMs: 100 });
    // Advance past the sleep timers
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after maxRetries exceeded', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fail'));

    const promise = retry(fn, { maxRetries: 2, initialDelayMs: 10, maxDelayMs: 100 });
    // Prevent unhandled rejection warning during timer advancement
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(500);

    await expect(promise).rejects.toThrow('always fail');
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('calls onRetry callback on each retry', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue('ok');

    const promise = retry(fn, { maxRetries: 2, initialDelayMs: 10, onRetry });
    await vi.advanceTimersByTimeAsync(100);
    await promise;

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), 10);
  });

  it('applies exponential backoff', async () => {
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('1'))
      .mockRejectedValueOnce(new Error('2'))
      .mockResolvedValue('ok');

    const promise = retry(fn, {
      maxRetries: 3,
      initialDelayMs: 100,
      backoffMultiplier: 2,
      maxDelayMs: 10000,
      onRetry,
    });
    await vi.advanceTimersByTimeAsync(1000);
    await promise;

    // First retry: 100ms, second retry: 200ms (100 * 2)
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Error), 100);
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Error), 200);
  });

  it('caps delay at maxDelayMs', async () => {
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('1'))
      .mockRejectedValueOnce(new Error('2'))
      .mockResolvedValue('ok');

    const promise = retry(fn, {
      maxRetries: 3,
      initialDelayMs: 100,
      backoffMultiplier: 100,
      maxDelayMs: 500,
      onRetry,
    });
    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    // Second retry should be capped at 500 (not 100 * 100 = 10000)
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Error), 500);
  });

  it('wraps non-Error exceptions', async () => {
    const fn = vi.fn().mockRejectedValue('string error');

    const promise = retry(fn, { maxRetries: 0, initialDelayMs: 10 });
    await expect(promise).rejects.toThrow('string error');
  });

  it('uses default options', async () => {
    const fn = vi.fn().mockResolvedValue(42);
    const result = await retry(fn);
    expect(result).toBe(42);
  });
});

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns response on success', async () => {
    const mockResponse = { status: 200, statusText: 'OK' };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

    const result = await fetchWithRetry('http://example.com', undefined, {
      maxRetries: 1,
      initialDelayMs: 10,
    });
    expect(result).toBe(mockResponse);
  });

  it('retries on 500 server error', async () => {
    const mock = globalThis.fetch as ReturnType<typeof vi.fn>;
    mock
      .mockResolvedValueOnce({ status: 500, statusText: 'Internal Server Error' })
      .mockResolvedValue({ status: 200, statusText: 'OK' });

    const promise = fetchWithRetry('http://example.com', undefined, {
      maxRetries: 2,
      initialDelayMs: 10,
    });
    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;

    expect(result.status).toBe(200);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('does not retry on 4xx client error', async () => {
    const mock = globalThis.fetch as ReturnType<typeof vi.fn>;
    mock.mockResolvedValue({ status: 404, statusText: 'Not Found' });

    const result = await fetchWithRetry('http://example.com', undefined, {
      maxRetries: 2,
      initialDelayMs: 10,
    });
    expect(result.status).toBe(404);
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
