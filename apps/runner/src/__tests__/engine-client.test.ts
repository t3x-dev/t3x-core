/**
 * Engine Client Tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('pino', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return { default: vi.fn(() => mockLogger) };
});

const mockFetchWithRetry = vi.fn();
vi.mock('../utils/retry.js', () => ({
  fetchWithRetry: (...args: unknown[]) => mockFetchWithRetry(...args),
}));

import { getEngineCallbackUrl, getEngineUrl, getRunByRunnerRunId } from '../engine-client.js';

describe('engine-client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getEngineUrl', () => {
    it('returns default URL', () => {
      expect(getEngineUrl()).toContain('localhost');
    });
  });

  describe('getEngineCallbackUrl', () => {
    it('returns callback URL with ingest path', () => {
      const url = getEngineCallbackUrl();
      expect(url).toContain('/api/v1/runs/ingest');
    });
  });

  describe('getRunByRunnerRunId', () => {
    it('returns parsed run when found', async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              runId: 'run_123',
              projectId: 'proj_1',
              runnerRunId: 'runner_456',
              commitRef: 'sha256:abc',
              leafJson: JSON.stringify({ id: 'leaf_1', type: 'deploy' }),
              inputsJson: JSON.stringify({ query: 'hello' }),
              workflowJson: JSON.stringify({ type: 'n8n', webhook_id: 'wh_1' }),
              status: 'running',
              resultJson: null,
              traceSummaryJson: null,
              tracePolicy: 'always',
              fullTraceJson: null,
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
          }),
      });

      const result = await getRunByRunnerRunId('runner_456');

      expect(result).not.toBeNull();
      expect(result!.run_id).toBe('run_123');
      expect(result!.project_id).toBe('proj_1');
      expect(result!.runner_run_id).toBe('runner_456');
      expect(result!.leaf).toEqual({ id: 'leaf_1', type: 'deploy' });
      expect(result!.inputs).toEqual({ query: 'hello' });
      expect(result!.workflow).toEqual({ type: 'n8n', webhook_id: 'wh_1' });
    });

    it('returns null when 404', async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not found'),
      });

      const result = await getRunByRunnerRunId('runner_missing');
      expect(result).toBeNull();
    });

    it('throws on non-404 error', async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal error'),
      });

      await expect(getRunByRunnerRunId('runner_bad')).rejects.toThrow('Engine API error');
    });

    it('returns null when response has success=false', async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: false,
            error: { code: 'INVALID', message: 'Bad data' },
          }),
      });

      const result = await getRunByRunnerRunId('runner_invalid');
      expect(result).toBeNull();
    });

    it('handles null JSON fields', async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              runId: 'run_123',
              projectId: null,
              runnerRunId: null,
              commitRef: null,
              leafJson: null,
              inputsJson: null,
              workflowJson: null,
              status: 'pending',
              resultJson: null,
              traceSummaryJson: null,
              tracePolicy: null,
              fullTraceJson: null,
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
          }),
      });

      const result = await getRunByRunnerRunId('runner_empty');
      expect(result).not.toBeNull();
      expect(result!.leaf).toBeNull();
      expect(result!.inputs).toEqual({});
      expect(result!.workflow).toBeNull();
    });

    it('re-throws fetch errors', async () => {
      mockFetchWithRetry.mockRejectedValue(new Error('Network unreachable'));

      await expect(getRunByRunnerRunId('runner_net')).rejects.toThrow('Network unreachable');
    });

    it('passes correct fetch options', async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              runId: 'run_1',
              projectId: null,
              runnerRunId: 'runner_1',
              commitRef: null,
              leafJson: null,
              inputsJson: null,
              workflowJson: null,
              status: 'pending',
              resultJson: null,
              traceSummaryJson: null,
              tracePolicy: null,
              fullTraceJson: null,
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
          }),
      });

      await getRunByRunnerRunId('runner_1');

      expect(mockFetchWithRetry).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/runs/by-runner-id/runner_1'),
        expect.objectContaining({
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }),
        expect.objectContaining({ maxRetries: 3 })
      );
    });
  });
});
