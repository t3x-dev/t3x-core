import { beforeEach, describe, expect, it } from 'vitest';
import { Observer } from '../observer.js';

const PROJECT_ID = 'project-a';

describe('Observer', () => {
  let obs: Observer;

  beforeEach(() => {
    obs = new Observer();
  });

  // =========================================================================
  // registerAgent / getAgent
  // =========================================================================
  describe('registerAgent / getAgent', () => {
    it('registers and retrieves agent', () => {
      obs.registerAgent(PROJECT_ID, {
        id: 'agent1',
        name: 'Test Agent',
        endpoint: 'http://localhost:9000',
        type: 'http',
      });
      const agent = obs.getAgent(PROJECT_ID, 'agent1');
      expect(agent).toBeDefined();
      expect(agent!.id).toBe('agent1');
      expect(agent!.name).toBe('Test Agent');
    });

    it('returns undefined for unknown agent', () => {
      expect(obs.getAgent(PROJECT_ID, 'unknown')).toBeUndefined();
    });

    it('isolates agents with the same id between projects', () => {
      obs.registerAgent('project-a', {
        id: 'shared',
        name: 'Project A agent',
        endpoint: 'http://localhost:9000',
        type: 'http',
      });
      obs.registerAgent('project-b', {
        id: 'shared',
        name: 'Project B agent',
        endpoint: 'http://localhost:9001',
        type: 'http',
      });

      expect(obs.getAgent('project-a', 'shared')?.name).toBe('Project A agent');
      expect(obs.getAgent('project-b', 'shared')?.name).toBe('Project B agent');
    });
  });

  // =========================================================================
  // startRun
  // =========================================================================
  describe('startRun', () => {
    it('returns run_ prefixed ID', () => {
      obs.registerAgent(PROJECT_ID, {
        id: 'a1',
        name: 'A',
        endpoint: 'http://localhost:9000',
        type: 'http',
      });
      const runId = obs.startRun(PROJECT_ID, 'a1', { agent_id: 'a1', input: { query: 'hello' } });
      expect(runId).toMatch(
        /^run_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    });

    it('initializes RunRecord correctly', () => {
      obs.registerAgent(PROJECT_ID, {
        id: 'a1',
        name: 'A',
        endpoint: 'http://localhost:9000',
        type: 'http',
      });
      const runId = obs.startRun(PROJECT_ID, 'a1', { agent_id: 'a1', input: { query: 'hello' } });
      const record = obs.getRun(PROJECT_ID, runId);
      expect(record).toBeDefined();
      expect(record!.status).toBe('running');
      expect(record!.steps).toHaveLength(0);
      expect(record!.timing.started_at).toBeTruthy();
      expect(record!.source?.system).toBe('custom');
    });

    it('normalizes non-object input', () => {
      obs.registerAgent(PROJECT_ID, {
        id: 'a1',
        name: 'A',
        endpoint: 'http://localhost:9000',
        type: 'http',
      });
      const runId = obs.startRun(PROJECT_ID, 'a1', {
        agent_id: 'a1',
        input: 'plain string' as unknown as Record<string, unknown>,
      });
      const record = obs.getRun(PROJECT_ID, runId);
      expect(record!.inputs).toEqual({ input: 'plain string' });
    });

    it('passes object input directly', () => {
      obs.registerAgent(PROJECT_ID, {
        id: 'a1',
        name: 'A',
        endpoint: 'http://localhost:9000',
        type: 'http',
      });
      const runId = obs.startRun(PROJECT_ID, 'a1', { agent_id: 'a1', input: { key: 'value' } });
      const record = obs.getRun(PROJECT_ID, runId);
      expect(record!.inputs).toEqual({ key: 'value' });
    });
  });

  // =========================================================================
  // recordLLMCall
  // =========================================================================
  describe('recordLLMCall', () => {
    it('adds LLM step with correct fields', () => {
      obs.registerAgent(PROJECT_ID, {
        id: 'a1',
        name: 'A',
        endpoint: 'http://localhost:9000',
        type: 'http',
      });
      const runId = obs.startRun(PROJECT_ID, 'a1', { agent_id: 'a1', input: { q: 'hi' } });

      obs.recordLLMCall(PROJECT_ID, runId, 'prompt', 'response', 'gpt-4', 500, {
        prompt: 100,
        completion: 50,
      });

      const record = obs.getRun(PROJECT_ID, runId)!;
      expect(record.steps).toHaveLength(1);
      const step = record.steps[0];
      expect(step.span_kind).toBe('llm');
      expect(step.type).toBe('llm_call');
      expect(step.llm?.model).toBe('gpt-4');
      expect(step.llm?.tokens.total).toBe(150);
      expect(step.latency_ms).toBe(500);
      expect(step.step_index).toBe(0);
    });

    it('calculates total tokens from prompt + completion', () => {
      obs.registerAgent(PROJECT_ID, {
        id: 'a1',
        name: 'A',
        endpoint: 'http://localhost:9000',
        type: 'http',
      });
      const runId = obs.startRun(PROJECT_ID, 'a1', { agent_id: 'a1', input: {} });
      obs.recordLLMCall(PROJECT_ID, runId, 'p', 'r', 'claude', 100, {
        prompt: 200,
        completion: 300,
      });
      const step = obs.getRun(PROJECT_ID, runId)!.steps[0];
      expect(step.llm?.tokens.total).toBe(500);
    });

    it('defaults model to unknown', () => {
      obs.registerAgent(PROJECT_ID, {
        id: 'a1',
        name: 'A',
        endpoint: 'http://localhost:9000',
        type: 'http',
      });
      const runId = obs.startRun(PROJECT_ID, 'a1', { agent_id: 'a1', input: {} });
      obs.recordLLMCall(PROJECT_ID, runId, 'p', 'r');
      expect(obs.getRun(PROJECT_ID, runId)!.steps[0].llm?.model).toBe('unknown');
    });

    it('throws for missing run', () => {
      expect(() => obs.recordLLMCall(PROJECT_ID, 'run_nonexistent', 'p', 'r')).toThrow(
        'Run not found'
      );
    });
  });

  // =========================================================================
  // recordToolCall
  // =========================================================================
  describe('recordToolCall', () => {
    it('creates step with span_kind tool', () => {
      obs.registerAgent(PROJECT_ID, {
        id: 'a1',
        name: 'A',
        endpoint: 'http://localhost:9000',
        type: 'http',
      });
      const runId = obs.startRun(PROJECT_ID, 'a1', { agent_id: 'a1', input: {} });

      obs.recordToolCall(PROJECT_ID, runId, 'search', { query: 'test' }, { results: [] }, 200);

      const step = obs.getRun(PROJECT_ID, runId)!.steps[0];
      expect(step.span_kind).toBe('tool');
      expect(step.tool?.tool_name).toBe('search');
      expect(step.tool?.tool_input).toEqual({ query: 'test' });
      expect(step.latency_ms).toBe(200);
    });

    it('increments step index', () => {
      obs.registerAgent(PROJECT_ID, {
        id: 'a1',
        name: 'A',
        endpoint: 'http://localhost:9000',
        type: 'http',
      });
      const runId = obs.startRun(PROJECT_ID, 'a1', { agent_id: 'a1', input: {} });

      obs.recordToolCall(PROJECT_ID, runId, 'tool1', {}, {});
      obs.recordToolCall(PROJECT_ID, runId, 'tool2', {}, {});

      const steps = obs.getRun(PROJECT_ID, runId)!.steps;
      expect(steps[0].step_index).toBe(0);
      expect(steps[1].step_index).toBe(1);
    });

    it('throws for missing run', () => {
      expect(() => obs.recordToolCall(PROJECT_ID, 'run_nonexistent', 'tool', {}, {})).toThrow(
        'Run not found'
      );
    });
  });

  // =========================================================================
  // recordError
  // =========================================================================
  describe('recordError', () => {
    it('sets run-level error', () => {
      obs.registerAgent(PROJECT_ID, {
        id: 'a1',
        name: 'A',
        endpoint: 'http://localhost:9000',
        type: 'http',
      });
      const runId = obs.startRun(PROJECT_ID, 'a1', { agent_id: 'a1', input: {} });

      obs.recordError(PROJECT_ID, runId, 'Something went wrong');

      const record = obs.getRun(PROJECT_ID, runId)!;
      expect(record.error?.code).toBe('RUNTIME_ERROR');
      expect(record.error?.message).toBe('Something went wrong');
    });

    it('marks step as error when stepId provided', () => {
      obs.registerAgent(PROJECT_ID, {
        id: 'a1',
        name: 'A',
        endpoint: 'http://localhost:9000',
        type: 'http',
      });
      const runId = obs.startRun(PROJECT_ID, 'a1', { agent_id: 'a1', input: {} });
      obs.recordToolCall(PROJECT_ID, runId, 'search', {}, {});

      const stepId = obs.getRun(PROJECT_ID, runId)!.steps[0].step_id;
      obs.recordError(PROJECT_ID, runId, 'Tool failed', stepId);

      const step = obs.getRun(PROJECT_ID, runId)!.steps[0];
      expect(step.status).toBe('error');
      expect(step.error).toBe('Tool failed');
      expect(obs.getRun(PROJECT_ID, runId)!.error?.step_id).toBe(stepId);
    });

    it('throws for missing run', () => {
      expect(() => obs.recordError(PROJECT_ID, 'run_nonexistent', 'error')).toThrow(
        'Run not found'
      );
    });
  });

  // =========================================================================
  // completeRun
  // =========================================================================
  describe('completeRun', () => {
    it('sets status and output', () => {
      obs.registerAgent(PROJECT_ID, {
        id: 'a1',
        name: 'A',
        endpoint: 'http://localhost:9000',
        type: 'http',
      });
      const runId = obs.startRun(PROJECT_ID, 'a1', { agent_id: 'a1', input: {} });
      const record = obs.completeRun(PROJECT_ID, runId, { result: 'done' }, 'completed');

      expect(record.status).toBe('completed');
      expect(record.output).toEqual({ result: 'done' });
      expect(record.timing.ended_at).toBeTruthy();
      expect(record.timing.total_ms).toBeGreaterThanOrEqual(0);
    });

    it('timeout → status failed with TIMEOUT error', () => {
      obs.registerAgent(PROJECT_ID, {
        id: 'a1',
        name: 'A',
        endpoint: 'http://localhost:9000',
        type: 'http',
      });
      const runId = obs.startRun(PROJECT_ID, 'a1', { agent_id: 'a1', input: {} });
      const record = obs.completeRun(PROJECT_ID, runId, null, 'timeout');

      expect(record.status).toBe('failed');
      expect(record.error?.code).toBe('TIMEOUT');
    });

    it('defaults to completed status', () => {
      obs.registerAgent(PROJECT_ID, {
        id: 'a1',
        name: 'A',
        endpoint: 'http://localhost:9000',
        type: 'http',
      });
      const runId = obs.startRun(PROJECT_ID, 'a1', { agent_id: 'a1', input: {} });
      const record = obs.completeRun(PROJECT_ID, runId, 'output');

      expect(record.status).toBe('completed');
    });

    it('throws for missing run', () => {
      expect(() => obs.completeRun(PROJECT_ID, 'run_nonexistent', null)).toThrow('Run not found');
    });
  });

  // =========================================================================
  // getRun / listRuns
  // =========================================================================
  describe('getRun / listRuns', () => {
    it('retrieves run by id', () => {
      obs.registerAgent(PROJECT_ID, {
        id: 'a1',
        name: 'A',
        endpoint: 'http://localhost:9000',
        type: 'http',
      });
      const runId = obs.startRun(PROJECT_ID, 'a1', { agent_id: 'a1', input: {} });
      expect(obs.getRun(PROJECT_ID, runId)).toBeDefined();
    });

    it('returns undefined for unknown id', () => {
      expect(obs.getRun(PROJECT_ID, 'run_unknown')).toBeUndefined();
    });

    it('lists all runs', () => {
      obs.registerAgent(PROJECT_ID, {
        id: 'a1',
        name: 'A',
        endpoint: 'http://localhost:9000',
        type: 'http',
      });
      obs.startRun(PROJECT_ID, 'a1', { agent_id: 'a1', input: {} });
      obs.startRun(PROJECT_ID, 'a1', { agent_id: 'a1', input: {} });

      expect(obs.listRuns(PROJECT_ID)).toHaveLength(2);
    });

    it('filters by system', () => {
      obs.registerAgent(PROJECT_ID, {
        id: 'a1',
        name: 'A',
        endpoint: 'http://localhost:9000',
        type: 'http',
      });
      obs.startRun(PROJECT_ID, 'a1', { agent_id: 'a1', input: {} });

      expect(obs.listRuns(PROJECT_ID, 'custom')).toHaveLength(1);
      expect(obs.listRuns(PROJECT_ID, 'n8n')).toHaveLength(0);
    });

    it('returns empty array when no runs', () => {
      expect(obs.listRuns(PROJECT_ID)).toHaveLength(0);
    });

    it('does not expose or mutate a run across projects', () => {
      obs.registerAgent('project-a', {
        id: 'a1',
        name: 'A',
        endpoint: 'http://localhost:9000',
        type: 'http',
      });
      const runId = obs.startRun('project-a', 'a1', { agent_id: 'a1', input: {} });

      expect(obs.getRun('project-b', runId)).toBeUndefined();
      expect(obs.listRuns('project-b')).toHaveLength(0);
      expect(() => obs.recordError('project-b', runId, 'cross-project write')).toThrow(
        'Run not found'
      );
      expect(obs.getRun('project-a', runId)?.error).toBeUndefined();
    });
  });

  // =========================================================================
  // clearOldRuns
  // =========================================================================
  describe('clearOldRuns', () => {
    it('removes old runs', () => {
      obs.registerAgent(PROJECT_ID, {
        id: 'a1',
        name: 'A',
        endpoint: 'http://localhost:9000',
        type: 'http',
      });
      const runId = obs.startRun(PROJECT_ID, 'a1', { agent_id: 'a1', input: {} });
      // Manually set old timestamp
      const record = obs.getRun(PROJECT_ID, runId)!;
      record.timing.started_at = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

      const cleared = obs.clearOldRuns();
      expect(cleared).toBe(1);
      expect(obs.listRuns(PROJECT_ID)).toHaveLength(0);
    });

    it('keeps recent runs', () => {
      obs.registerAgent(PROJECT_ID, {
        id: 'a1',
        name: 'A',
        endpoint: 'http://localhost:9000',
        type: 'http',
      });
      obs.startRun(PROJECT_ID, 'a1', { agent_id: 'a1', input: {} });

      const cleared = obs.clearOldRuns();
      expect(cleared).toBe(0);
      expect(obs.listRuns(PROJECT_ID)).toHaveLength(1);
    });

    it('returns count of cleared runs', () => {
      obs.registerAgent(PROJECT_ID, {
        id: 'a1',
        name: 'A',
        endpoint: 'http://localhost:9000',
        type: 'http',
      });
      const r1 = obs.startRun(PROJECT_ID, 'a1', { agent_id: 'a1', input: {} });
      const r2 = obs.startRun(PROJECT_ID, 'a1', { agent_id: 'a1', input: {} });

      obs.getRun(PROJECT_ID, r1)!.timing.started_at = new Date(
        Date.now() - 48 * 60 * 60 * 1000
      ).toISOString();
      obs.getRun(PROJECT_ID, r2)!.timing.started_at = new Date(
        Date.now() - 48 * 60 * 60 * 1000
      ).toISOString();

      expect(obs.clearOldRuns()).toBe(2);
    });
  });
});
