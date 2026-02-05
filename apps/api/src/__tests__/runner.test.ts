/**
 * Runner Routes Tests
 */

import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// Use vi.hoisted to avoid hoisting issues
const { mockObserver, mockEvalEngine } = vi.hoisted(() => ({
  mockObserver: {
    registerAgent: vi.fn(),
    getAgent: vi.fn(),
    startRun: vi.fn().mockReturnValue('run_test_1'),
    recordLLMCall: vi.fn(),
    recordToolCall: vi.fn(),
    recordError: vi.fn(),
    completeRun: vi.fn().mockReturnValue({ run_id: 'run_test_1', status: 'completed', steps: [] }),
    getRun: vi.fn(),
    listRuns: vi.fn().mockReturnValue([]),
  },
  mockEvalEngine: {
    evaluate: vi.fn().mockReturnValue({
      run_id: 'run_test_1',
      passed: true,
      score: 1.0,
      checks: [],
      violations: [],
    }),
  },
}));

vi.mock('@t3x/runner', () => ({
  observer: mockObserver,
  evalEngine: mockEvalEngine,
  AgentConfigSchema: {
    parse: vi.fn((x: unknown) => x),
  },
  AgentInputSchema: {
    parse: vi.fn((x: unknown) => x),
  },
  RunRecordSchema: z.any(),
  EvalRulesSchema: z.any(),
  RuleSchema: {
    parse: vi.fn((x: unknown) => x),
  },
  DEFAULT_RULES: {
    version: '1.0',
    rules: [{ id: 'r1', target: 'output', check: 'exists', weight: 1 }],
    pass_threshold: 0.5,
  },
  parseRulesFromLeaf: vi.fn().mockReturnValue({
    version: '1.0',
    rules: [{ id: 'r1', target: 'output', check: 'exists', weight: 1 }],
    pass_threshold: 0.5,
  }),
}));

// Silence console
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

import { runnerRoutes } from '../routes/runner';

const app = new Hono();
app.route('/', runnerRoutes);

describe('Runner Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockObserver.listRuns.mockReturnValue([]);
  });

  describe('POST /runner/agents', () => {
    it('registers an agent', async () => {
      const res = await app.request('/runner/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'agent_1',
          name: 'Test Agent',
          endpoint: 'http://localhost:9000',
          type: 'http',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.agent_id).toBe('agent_1');
    });

    it('returns 400 for invalid body', async () => {
      const { AgentConfigSchema } = await import('@t3x/runner');
      (AgentConfigSchema.parse as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('Validation failed');
      });

      const res = await app.request('/runner/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /runner/agents/:id', () => {
    it('returns agent when found', async () => {
      mockObserver.getAgent.mockReturnValue({
        id: 'agent_1',
        name: 'Test',
        endpoint: 'http://localhost:9000',
      });

      const res = await app.request('/runner/agents/agent_1');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('returns 404 for unknown agent', async () => {
      mockObserver.getAgent.mockReturnValue(undefined);

      const res = await app.request('/runner/agents/unknown');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /runner/run/:id', () => {
    it('returns run when found', async () => {
      mockObserver.getRun.mockReturnValue({ run_id: 'run_1', status: 'completed' });

      const res = await app.request('/runner/run/run_1');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('returns 404 for unknown run', async () => {
      mockObserver.getRun.mockReturnValue(undefined);

      const res = await app.request('/runner/run/unknown');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /runner/runs', () => {
    it('returns list of runs', async () => {
      mockObserver.listRuns.mockReturnValue([{ run_id: 'run_1', status: 'completed' }]);

      const res = await app.request('/runner/runs');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.runs).toHaveLength(1);
    });
  });

  describe('POST /runner/run/:id/event', () => {
    it('records LLM call event', async () => {
      const res = await app.request('/runner/run/run_1/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'llm_call',
          data: {
            input: 'hello',
            output: 'hi',
            model: 'gpt-4',
            latency_ms: 500,
          },
        }),
      });

      expect(res.status).toBe(200);
      expect(mockObserver.recordLLMCall).toHaveBeenCalled();
    });

    it('records tool call event', async () => {
      const res = await app.request('/runner/run/run_1/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'tool_call',
          data: {
            tool_name: 'search',
            input: { query: 'test' },
            output: { results: [] },
            latency_ms: 100,
          },
        }),
      });

      expect(res.status).toBe(200);
      expect(mockObserver.recordToolCall).toHaveBeenCalled();
    });

    it('records error event', async () => {
      const res = await app.request('/runner/run/run_1/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'error',
          data: { error: 'Something went wrong' },
        }),
      });

      expect(res.status).toBe(200);
      expect(mockObserver.recordError).toHaveBeenCalled();
    });
  });

  describe('POST /runner/eval', () => {
    it('evaluates with run_record', async () => {
      const res = await app.request('/runner/eval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          run_record: {
            run_id: 'run_1',
            status: 'completed',
            inputs: {},
            steps: [],
            timing: { started_at: new Date().toISOString() },
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('returns 400 when neither run_id nor run_record provided', async () => {
      const res = await app.request('/runner/eval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    it('returns 404 for unknown run_id', async () => {
      mockObserver.getRun.mockReturnValue(undefined);

      const res = await app.request('/runner/eval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: 'run_missing' }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /runner/eval/validate', () => {
    it('validates rules array', async () => {
      const res = await app.request('/runner/eval/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rules: [{ id: 'r1', target: 'output', check: 'exists', weight: 1, severity: 'error' }],
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.rules[0].valid).toBe(true);
    });

    it('returns 400 for non-array rules', async () => {
      const res = await app.request('/runner/eval/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: 'not-array' }),
      });

      expect(res.status).toBe(400);
    });
  });
});
