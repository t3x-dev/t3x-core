/**
 * N8nClient Tests
 *
 * Tests the n8n execution API client with mocked fetch.
 */

vi.mock('pino', () => {
  const noop = () => {};
  const logger = { debug: noop, info: noop, warn: noop, error: noop, fatal: noop, trace: noop };
  return { default: () => logger };
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { N8nClient, N8nClientError } = await import('../trace/n8n-client.js');

// Helper: create a mock fetch response
function mockResponse(data: unknown, status = 200, ok = true) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data)),
  };
}

// Helper: create a finished execution
function finishedExecution(id = '123') {
  return {
    id,
    finished: true,
    status: 'success',
    data: {
      resultData: {
        runData: { NodeA: [{}], NodeB: [{}] },
      },
    },
  };
}

// Helper: create an unfinished execution
function runningExecution(id = '123') {
  return {
    id,
    finished: false,
    status: 'running',
    data: { resultData: { runData: {} } },
  };
}

describe('N8nClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  // =========================================================================
  // Constructor
  // =========================================================================
  describe('constructor', () => {
    it('uses default values when no config given', () => {
      const client = new N8nClient();
      // Just verify no error — defaults loaded from env/fallback
      expect(client).toBeDefined();
    });

    it('accepts custom config', () => {
      const client = new N8nClient({
        apiUrl: 'http://custom:5678',
        apiKey: 'my-key',
        timeout: 5000,
      });
      expect(client).toBeDefined();
    });
  });

  // =========================================================================
  // getExecution
  // =========================================================================
  describe('getExecution', () => {
    it('fetches execution by ID', async () => {
      const exec = finishedExecution('42');
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(exec));

      const client = new N8nClient({ apiUrl: 'http://n8n:5678', apiKey: 'key' });
      const result = await client.getExecution('42');

      expect(result.id).toBe('42');
      expect(result.finished).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/executions/42'),
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-N8N-API-KEY': 'key' }),
        })
      );
    });

    it('strips trailing /api/v1 from apiUrl to avoid duplication', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(finishedExecution()));

      const client = new N8nClient({ apiUrl: 'http://n8n:5678/api/v1', apiKey: 'key' });
      await client.getExecution('1');

      // biome-ignore lint/suspicious/noExplicitAny: test helper
      const url = (globalThis.fetch as any).mock.calls[0][0];
      expect(url).toBe('http://n8n:5678/api/v1/executions/1?includeData=true');
      // Should NOT be http://n8n:5678/api/v1/api/v1/executions/1
      expect(url).not.toContain('/api/v1/api/v1');
    });

    it('throws N8nClientError on HTTP error with parseable JSON', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve(JSON.stringify({ message: 'Not found' })),
      });

      const client = new N8nClient({ apiUrl: 'http://n8n:5678', apiKey: 'key' });
      await expect(client.getExecution('999')).rejects.toThrow(N8nClientError);

      try {
        await client.getExecution('999');
        // biome-ignore lint/suspicious/noExplicitAny: test helper
      } catch (e: any) {
        expect(e.statusCode).toBe(404);
        expect(e.apiError).toBeDefined();
      }
    });

    it('throws N8nClientError on HTTP error with non-JSON body', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('server crashed'),
      });

      const client = new N8nClient({ apiUrl: 'http://n8n:5678', apiKey: 'key' });
      await expect(client.getExecution('1')).rejects.toThrow(N8nClientError);
    });

    it('wraps network errors in N8nClientError', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

      const client = new N8nClient({ apiUrl: 'http://n8n:5678', apiKey: 'key' });
      await expect(client.getExecution('1')).rejects.toThrow(N8nClientError);
      await expect(client.getExecution('1')).rejects.toThrow('Failed to fetch n8n execution');
    });
  });

  // =========================================================================
  // getExecutionWithRetry
  // =========================================================================
  describe('getExecutionWithRetry', () => {
    it('returns immediately when execution is finished', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(finishedExecution()));

      const client = new N8nClient({ apiUrl: 'http://n8n:5678', apiKey: 'key' });
      const result = await client.getExecutionWithRetry('1', 3, 100);

      expect(result.finished).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('retries when execution not finished, then succeeds', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockResponse(runningExecution()))
        .mockResolvedValueOnce(mockResponse(finishedExecution()));

      globalThis.fetch = fetchMock;

      const client = new N8nClient({ apiUrl: 'http://n8n:5678', apiKey: 'key' });
      const promise = client.getExecutionWithRetry('1', 3, 100);

      // Advance time for the sleep(100) after first attempt
      await vi.advanceTimersByTimeAsync(200);
      const result = await promise;

      expect(result.finished).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('retries on fetch error, then succeeds', async () => {
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce(mockResponse(finishedExecution()));

      globalThis.fetch = fetchMock;

      const client = new N8nClient({ apiUrl: 'http://n8n:5678', apiKey: 'key' });
      const promise = client.getExecutionWithRetry('1', 3, 100);

      await vi.advanceTimersByTimeAsync(200);
      const result = await promise;

      expect(result.finished).toBe(true);
    });

    it('throws after max retries when not finished', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(runningExecution()));

      const client = new N8nClient({ apiUrl: 'http://n8n:5678', apiKey: 'key' });
      const promise = client.getExecutionWithRetry('1', 2, 50);
      promise.catch(() => {}); // prevent unhandled rejection

      // Advance enough time for all retries
      await vi.advanceTimersByTimeAsync(5000);

      await expect(promise).rejects.toThrow('not finished after');
    });
  });

  // =========================================================================
  // isExecutionComplete
  // =========================================================================
  describe('isExecutionComplete', () => {
    it('returns true for finished execution', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(finishedExecution()));

      const client = new N8nClient({ apiUrl: 'http://n8n:5678', apiKey: 'key' });
      const result = await client.isExecutionComplete('1');
      expect(result).toBe(true);
    });

    it('returns false for running execution', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(runningExecution()));

      const client = new N8nClient({ apiUrl: 'http://n8n:5678', apiKey: 'key' });
      const result = await client.isExecutionComplete('1');
      expect(result).toBe(false);
    });

    it('returns false on fetch error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('network'));

      const client = new N8nClient({ apiUrl: 'http://n8n:5678', apiKey: 'key' });
      const result = await client.isExecutionComplete('1');
      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // waitForExecution
  // =========================================================================
  describe('waitForExecution', () => {
    it('returns when execution completes', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockResponse(runningExecution()))
        .mockResolvedValueOnce(mockResponse(finishedExecution()));

      globalThis.fetch = fetchMock;

      const client = new N8nClient({ apiUrl: 'http://n8n:5678', apiKey: 'key' });
      const promise = client.waitForExecution('1', 10000, 100);

      await vi.advanceTimersByTimeAsync(200);
      const result = await promise;

      expect(result.finished).toBe(true);
    });

    it('throws after timeout', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(runningExecution()));

      const client = new N8nClient({ apiUrl: 'http://n8n:5678', apiKey: 'key' });
      const promise = client.waitForExecution('1', 500, 100);
      promise.catch(() => {}); // prevent unhandled rejection

      // Advance past the maxWaitMs
      await vi.advanceTimersByTimeAsync(1000);

      await expect(promise).rejects.toThrow('did not complete within');
    });
  });

  // =========================================================================
  // N8nClientError
  // =========================================================================
  describe('N8nClientError', () => {
    it('has correct properties', () => {
      const err = new N8nClientError('test error', 503, { message: 'Service unavailable' });
      expect(err.name).toBe('N8nClientError');
      expect(err.message).toBe('test error');
      expect(err.statusCode).toBe(503);
      expect(err.apiError).toEqual({ message: 'Service unavailable' });
    });

    it('works without optional params', () => {
      const err = new N8nClientError('basic error');
      expect(err.statusCode).toBeUndefined();
      expect(err.apiError).toBeUndefined();
    });
  });
});
