import { describe, expect, it, vi } from 'vitest';

vi.mock('pino', () => {
  const noop = () => {};
  const logger = { debug: noop, info: noop, warn: noop, error: noop };
  return { default: () => logger };
});

const { mapN8nExecutionToRunRecord, mapN8nExecutionsToRunRecords } = await import(
  '../trace/n8n-mapper.js'
);

import type { N8nExecution, N8nNodeRun } from '../trace/types.js';

function makeExecution(overrides: Partial<N8nExecution> = {}): N8nExecution {
  return {
    id: 'exec_001',
    finished: true,
    mode: 'webhook',
    startedAt: '2026-01-01T00:00:00.000Z',
    stoppedAt: '2026-01-01T00:00:01.000Z',
    status: 'success',
    data: {
      resultData: {
        runData: {},
        lastNodeExecuted: undefined,
      },
    },
    ...overrides,
  };
}

function makeNodeRun(overrides: Partial<N8nNodeRun> = {}): N8nNodeRun {
  return {
    startTime: 1000,
    executionTime: 100,
    data: { main: [[{ json: { result: 'ok' } }]] },
    ...overrides,
  };
}

describe('n8n-mapper', () => {
  // =========================================================================
  // mapN8nExecutionToRunRecord - basic
  // =========================================================================
  describe('mapN8nExecutionToRunRecord', () => {
    it('maps basic successful execution', () => {
      const exec = makeExecution();
      const record = mapN8nExecutionToRunRecord(exec);

      expect(record.run_id).toBe('n8n_exec_001');
      expect(record.status).toBe('completed');
      expect(record.source?.system).toBe('n8n');
      expect(record.source?.execution_id).toBe('exec_001');
    });

    it('uses custom runId when provided', () => {
      const exec = makeExecution();
      const record = mapN8nExecutionToRunRecord(exec, { runId: 'custom_123' });
      expect(record.run_id).toBe('custom_123');
    });

    it('calculates timing correctly', () => {
      const exec = makeExecution({
        startedAt: '2026-01-01T00:00:00.000Z',
        stoppedAt: '2026-01-01T00:00:02.500Z',
      });
      const record = mapN8nExecutionToRunRecord(exec);

      expect(record.timing.started_at).toBe('2026-01-01T00:00:00.000Z');
      expect(record.timing.ended_at).toBe('2026-01-01T00:00:02.500Z');
      expect(record.timing.total_ms).toBe(2500);
    });

    it('handles missing stoppedAt', () => {
      const exec = makeExecution({ stoppedAt: undefined });
      const record = mapN8nExecutionToRunRecord(exec);
      expect(record.timing.ended_at).toBeUndefined();
      expect(record.timing.total_ms).toBeUndefined();
    });

    it('handles execution without data', () => {
      const exec = makeExecution({ data: undefined });
      const record = mapN8nExecutionToRunRecord(exec);
      expect(record.steps).toHaveLength(0);
      expect(record.inputs).toEqual({});
    });
  });

  // =========================================================================
  // Status mapping
  // =========================================================================
  describe('status mapping', () => {
    it.each([
      ['success', 'completed'],
      ['error', 'failed'],
      ['canceled', 'failed'],
      ['crashed', 'failed'],
      ['new', 'pending'],
      ['running', 'running'],
      ['waiting', 'running'],
    ] as const)('maps n8n status "%s" to "%s"', (n8nStatus, expected) => {
      const exec = makeExecution({ status: n8nStatus });
      const record = mapN8nExecutionToRunRecord(exec);
      expect(record.status).toBe(expected);
    });

    it('maps unknown finished execution to completed', () => {
      const exec = makeExecution({ status: 'unknown_status' as never, finished: true });
      const record = mapN8nExecutionToRunRecord(exec);
      expect(record.status).toBe('completed');
    });

    it('maps unknown unfinished execution to running', () => {
      const exec = makeExecution({ status: 'unknown_status' as never, finished: false });
      const record = mapN8nExecutionToRunRecord(exec);
      expect(record.status).toBe('running');
    });
  });

  // =========================================================================
  // Error extraction
  // =========================================================================
  describe('error extraction', () => {
    it('extracts error from execution result', () => {
      const exec = makeExecution({
        status: 'error',
        data: {
          resultData: {
            runData: {},
            error: { message: 'Node failed', node: 'HTTP Request' },
          },
        },
      });
      const record = mapN8nExecutionToRunRecord(exec);

      expect(record.error).toBeDefined();
      expect(record.error!.code).toBe('N8N_EXECUTION_ERROR');
      expect(record.error!.message).toBe('Node failed');
      expect(record.error!.step_id).toBe('step_http_request_0');
    });

    it('returns undefined error when no error in result', () => {
      const exec = makeExecution();
      const record = mapN8nExecutionToRunRecord(exec);
      expect(record.error).toBeUndefined();
    });
  });

  // =========================================================================
  // Step mapping
  // =========================================================================
  describe('step mapping', () => {
    it('maps node runs to steps', () => {
      const exec = makeExecution({
        data: {
          resultData: {
            runData: {
              Webhook: [makeNodeRun({ startTime: 1000, executionTime: 10 })],
              'AI Agent': [makeNodeRun({ startTime: 1010, executionTime: 500 })],
            },
          },
        },
      });
      const record = mapN8nExecutionToRunRecord(exec);

      expect(record.steps).toHaveLength(2);
      expect(record.steps[0].name).toBe('Webhook');
      expect(record.steps[1].name).toBe('AI Agent');
      expect(record.steps[0].step_index).toBe(0);
      expect(record.steps[1].step_index).toBe(1);
    });

    it('sorts steps by startTime', () => {
      const exec = makeExecution({
        data: {
          resultData: {
            runData: {
              Later: [makeNodeRun({ startTime: 2000 })],
              Earlier: [makeNodeRun({ startTime: 1000 })],
            },
          },
        },
      });
      const record = mapN8nExecutionToRunRecord(exec);
      expect(record.steps[0].name).toBe('Earlier');
      expect(record.steps[1].name).toBe('Later');
    });

    it('maps error status on failed node', () => {
      const exec = makeExecution({
        data: {
          resultData: {
            runData: {
              'Bad Node': [makeNodeRun({ error: { message: 'timeout' } })],
            },
          },
        },
      });
      const record = mapN8nExecutionToRunRecord(exec);
      expect(record.steps[0].status).toBe('error');
      expect(record.steps[0].error).toBe('timeout');
    });

    it('sets latency_ms from executionTime', () => {
      const exec = makeExecution({
        data: {
          resultData: {
            runData: {
              Node: [makeNodeRun({ executionTime: 250 })],
            },
          },
        },
      });
      const record = mapN8nExecutionToRunRecord(exec);
      expect(record.steps[0].latency_ms).toBe(250);
    });
  });

  // =========================================================================
  // Span kind inference
  // =========================================================================
  describe('span_kind inference', () => {
    it('infers llm for AI Agent node', () => {
      const exec = makeExecution({
        data: {
          resultData: {
            runData: {
              'AI Agent': [makeNodeRun()],
            },
          },
        },
        workflowData: {
          nodes: [{ id: '1', name: 'AI Agent', type: '@n8n/n8n-nodes-langchain.agent' }],
        },
      });
      const record = mapN8nExecutionToRunRecord(exec);
      expect(record.steps[0].span_kind).toBe('llm');
    });

    it('infers workflow for Webhook node', () => {
      const exec = makeExecution({
        data: {
          resultData: {
            runData: {
              Webhook: [makeNodeRun()],
            },
          },
        },
        workflowData: {
          nodes: [{ id: '1', name: 'Webhook', type: 'n8n-nodes-base.webhook' }],
        },
      });
      const record = mapN8nExecutionToRunRecord(exec);
      expect(record.steps[0].span_kind).toBe('workflow');
    });

    it('infers chain as default for unknown types', () => {
      const exec = makeExecution({
        data: {
          resultData: {
            runData: {
              'Custom Node': [makeNodeRun()],
            },
          },
        },
      });
      const record = mapN8nExecutionToRunRecord(exec);
      expect(record.steps[0].span_kind).toBe('chain');
    });
  });

  // =========================================================================
  // Input/output extraction
  // =========================================================================
  describe('input/output extraction', () => {
    it('extracts webhook inputs', () => {
      const exec = makeExecution({
        data: {
          resultData: {
            runData: {
              Webhook: [
                makeNodeRun({
                  data: { main: [[{ json: { query: 'hello', user: 'test' } }]] },
                }),
              ],
            },
          },
        },
      });
      const record = mapN8nExecutionToRunRecord(exec);
      expect(record.inputs).toEqual({ query: 'hello', user: 'test' });
    });

    it('extracts final output from last node', () => {
      const exec = makeExecution({
        data: {
          resultData: {
            runData: {
              Webhook: [makeNodeRun({ startTime: 1000 })],
              'Respond To Webhook': [
                makeNodeRun({
                  startTime: 2000,
                  data: { main: [[{ json: { response: 'done' } }]] },
                }),
              ],
            },
            lastNodeExecuted: 'Respond To Webhook',
          },
        },
      });
      const record = mapN8nExecutionToRunRecord(exec);
      expect(record.output).toEqual({ response: 'done' });
    });

    it('omits data when includeFullData is false', () => {
      const exec = makeExecution({
        data: {
          resultData: {
            runData: {
              Node: [makeNodeRun()],
            },
          },
        },
      });
      const record = mapN8nExecutionToRunRecord(exec, { includeFullData: false });
      expect(record.steps[0].output).toEqual({ _data_omitted: true });
    });
  });

  // =========================================================================
  // Workflow node type map
  // =========================================================================
  describe('workflow node type map', () => {
    it('uses workflowData.nodes for type inference', () => {
      const exec = makeExecution({
        data: {
          resultData: {
            runData: {
              'My LLM': [makeNodeRun()],
            },
          },
        },
        workflowData: {
          nodes: [{ id: '1', name: 'My LLM', type: '@n8n/n8n-nodes-langchain.lmChatOpenAi' }],
        },
      });
      const record = mapN8nExecutionToRunRecord(exec);
      expect(record.steps[0].type).toBe('llm_call');
      expect(record.steps[0].span_kind).toBe('llm');
    });
  });

  // =========================================================================
  // mapN8nExecutionsToRunRecords (batch)
  // =========================================================================
  describe('mapN8nExecutionsToRunRecords', () => {
    it('maps multiple executions', () => {
      const executions = [
        makeExecution({ id: 'exec_1' }),
        makeExecution({ id: 'exec_2', status: 'error' }),
      ];
      const records = mapN8nExecutionsToRunRecords(executions);
      expect(records).toHaveLength(2);
      expect(records[0].run_id).toBe('n8n_exec_1');
      expect(records[1].status).toBe('failed');
    });

    it('returns empty array for empty input', () => {
      expect(mapN8nExecutionsToRunRecords([])).toHaveLength(0);
    });
  });
});
