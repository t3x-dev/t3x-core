import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchWithTimeoutMock = vi.fn();

vi.mock('@/infrastructure/core', () => ({
  API_BASE: '',
  API_V1: '/api/v1',
  ApiError: class ApiError extends Error {},
  buildQueryString: vi.fn(() => ''),
  fetchWithTimeout: (...args: unknown[]) => fetchWithTimeoutMock(...args),
  handleResponse: vi.fn(),
  safeJsonParse: vi.fn(),
}));

import { runAgent } from '@/infrastructure/runner';

const trace = {
  run_id: 'run_12345678-1234-4234-8234-123456789abc',
  project_id: 'project-a',
  status: 'completed',
  inputs: { prompt: 'hello' },
  output: { answer: 'ok' },
  steps: [],
  timing: { started_at: '2026-08-12T00:00:00.000Z' },
  source: { system: 'custom' },
};

describe('runner infrastructure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads a successful proxy RunRecord from data.trace', async () => {
    fetchWithTimeoutMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { run_id: trace.run_id, output: trace.output, trace },
      }),
    });

    const result = await runAgent('project-a', 'agent-a', { prompt: 'hello' });

    expect(result.trace).toEqual(trace);
    expect(result.run_id).toBe(trace.run_id);
  });

  it('preserves a failed proxy trace for diagnostics', async () => {
    const failedTrace = {
      ...trace,
      status: 'failed',
      error: { code: 'RUNTIME_ERROR', message: 'upstream failed' },
    };
    fetchWithTimeoutMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        success: false,
        error: { code: 'RUN_FAILED', message: 'upstream failed' },
        data: { run_id: trace.run_id, trace: failedTrace },
      }),
    });

    const result = await runAgent('project-a', 'agent-a', { prompt: 'hello' });

    expect(result.trace).toEqual(failedTrace);
    expect(result.error).toEqual({ code: 'RUN_FAILED', message: 'upstream failed' });
  });
});
