import { describe, expect, it, vi } from 'vitest';

vi.mock('pino', () => {
  const noop = () => {};
  const logger = { debug: noop, info: noop, warn: noop, error: noop };
  return { default: () => logger };
});

// Must import after mock
const { EvalEngine } = await import('../evaluator/index.js');

import type { EvalRules, Rule } from '../schemas/eval-rules.js';
import type { RunRecord } from '../schemas/run-record.js';

function makeRecord(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    run_id: 'run_test001',
    status: 'completed',
    inputs: { query: 'hello' },
    output: 'test output',
    steps: [
      {
        step_id: 'step_001',
        step_index: 0,
        name: 'LLM Call',
        type: 'llm_call',
        span_kind: 'llm',
        input: 'prompt',
        output: 'response',
        latency_ms: 100,
        status: 'ok',
        llm: { model: 'gpt-4', tokens: { prompt: 100, completion: 50, total: 150 } },
      },
    ],
    timing: { started_at: new Date().toISOString() },
    ...overrides,
  };
}

function makeRules(rules: Rule[], threshold = 0.8): EvalRules {
  return {
    version: '1.0',
    rules,
    pass_threshold: threshold,
  };
}

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'r1',
    type: 'basic',
    target: 'output',
    check: 'exists',
    weight: 1.0,
    severity: 'error',
    ...overrides,
  };
}

describe('EvalEngine', () => {
  const engine = new EvalEngine();

  // =========================================================================
  // getByPath (tested via evaluateRule targets)
  // =========================================================================
  describe('getByPath (via evaluate)', () => {
    it('resolves output.result path', () => {
      const record = makeRecord({ output: { result: 'success' } });
      const rules = makeRules([
        makeRule({ id: 'r1', target: 'output.result', check: 'equals', value: 'success' }),
      ]);
      const result = engine.evaluate(record, rules);
      expect(result.checks[0].passed).toBe(true);
    });

    it('resolves steps[0] path', () => {
      const record = makeRecord();
      const rules = makeRules([
        makeRule({ id: 'r1', target: 'steps[0].status', check: 'equals', value: 'ok' }),
      ]);
      const result = engine.evaluate(record, rules);
      expect(result.checks[0].passed).toBe(true);
    });

    it('resolves root . path', () => {
      const record = makeRecord();
      const rules = makeRules([makeRule({ id: 'r1', target: '.', check: 'exists' })]);
      const result = engine.evaluate(record, rules);
      expect(result.checks[0].passed).toBe(true);
    });

    it('returns undefined for missing path', () => {
      const record = makeRecord();
      const rules = makeRules([
        makeRule({ id: 'r1', target: 'nonexistent.deep.path', check: 'exists' }),
      ]);
      const result = engine.evaluate(record, rules);
      expect(result.checks[0].passed).toBe(false);
    });

    it('handles null intermediate', () => {
      const record = makeRecord({ output: null });
      const rules = makeRules([makeRule({ id: 'r1', target: 'output.result', check: 'exists' })]);
      const result = engine.evaluate(record, rules);
      expect(result.checks[0].passed).toBe(false);
    });
  });

  // =========================================================================
  // evaluateRule
  // =========================================================================
  describe('evaluateRule (via evaluate)', () => {
    it('passes → score equals weight', () => {
      const record = makeRecord();
      const rules = makeRules([makeRule({ id: 'r1', weight: 0.5 })]);
      const result = engine.evaluate(record, rules);
      expect(result.checks[0].passed).toBe(true);
      expect(result.checks[0].score).toBe(0.5);
    });

    it('fails → score equals 0', () => {
      const record = makeRecord({ output: null });
      const rules = makeRules([makeRule({ id: 'r1', weight: 0.5 })]);
      const result = engine.evaluate(record, rules);
      expect(result.checks[0].passed).toBe(false);
      expect(result.checks[0].score).toBe(0);
    });

    it('message includes rule name when provided', () => {
      const record = makeRecord();
      const rules = makeRules([makeRule({ id: 'r1', name: 'Output check' })]);
      const result = engine.evaluate(record, rules);
      expect(result.checks[0].message).toContain('Output check');
    });

    it('message uses rule id when name not provided', () => {
      const record = makeRecord({ output: null });
      const rules = makeRules([makeRule({ id: 'my_rule' })]);
      const result = engine.evaluate(record, rules);
      expect(result.checks[0].message).toContain('my_rule');
    });
  });

  // =========================================================================
  // calculateDimensionScores
  // =========================================================================
  describe('calculateDimensionScores (via evaluate)', () => {
    it('single dimension', () => {
      const record = makeRecord();
      const rules = makeRules([makeRule({ id: 'r1', type: 'basic', weight: 1.0 })]);
      const result = engine.evaluate(record, rules);
      expect(result.dimension_scores!.task_completion).toBe(1.0);
    });

    it('multiple dimensions', () => {
      const record = makeRecord();
      const rules = makeRules([
        makeRule({ id: 'r1', type: 'basic', weight: 0.5 }),
        makeRule({
          id: 'r2',
          type: 'tool_use',
          target: 'steps',
          check: 'expected_tools',
          expected: [],
          weight: 0.5,
        }),
      ]);
      const result = engine.evaluate(record, rules);
      expect(result.dimension_scores!.task_completion).toBe(1.0);
      expect(result.dimension_scores!.tool_use).toBe(1.0);
    });

    it('no rules for a dimension → defaults to 1.0', () => {
      const record = makeRecord();
      const rules = makeRules([makeRule({ id: 'r1', type: 'basic', weight: 1.0 })]);
      const result = engine.evaluate(record, rules);
      expect(result.dimension_scores!.tool_use).toBe(1.0);
      expect(result.dimension_scores!.trajectory_efficiency).toBe(1.0);
      expect(result.dimension_scores!.cost_efficiency).toBe(1.0);
      expect(result.dimension_scores!.latency).toBe(1.0);
    });

    it('weighted average for mixed pass/fail', () => {
      const record = makeRecord({ output: 'present' });
      const rules = makeRules(
        [
          makeRule({ id: 'r1', type: 'basic', weight: 0.5, check: 'exists', target: 'output' }),
          makeRule({
            id: 'r2',
            type: 'basic',
            weight: 0.5,
            check: 'equals',
            target: 'output',
            value: 'wrong',
          }),
        ],
        0
      );
      const result = engine.evaluate(record, rules);
      expect(result.dimension_scores!.task_completion).toBe(0.5);
    });
  });

  // =========================================================================
  // evaluate - overall
  // =========================================================================
  describe('evaluate', () => {
    it('all pass → score 1.0, passed true', () => {
      const record = makeRecord();
      const rules = makeRules([
        makeRule({ id: 'r1', weight: 0.5 }),
        makeRule({ id: 'r2', weight: 0.5, check: 'not_empty' }),
      ]);
      const result = engine.evaluate(record, rules);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(1.0);
      expect(result.violations).toHaveLength(0);
    });

    it('all fail → score 0, passed false', () => {
      const record = makeRecord({ output: null });
      const rules = makeRules([
        makeRule({ id: 'r1', weight: 0.5 }),
        makeRule({ id: 'r2', weight: 0.5, check: 'not_empty' }),
      ]);
      const result = engine.evaluate(record, rules);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
      expect(result.violations).toHaveLength(2);
    });

    it('mixed → correct weighted score', () => {
      const record = makeRecord();
      const rules = makeRules(
        [
          makeRule({ id: 'r1', weight: 0.6, check: 'exists' }),
          makeRule({ id: 'r2', weight: 0.4, check: 'equals', value: 'wrong' }),
        ],
        0.5
      );
      const result = engine.evaluate(record, rules);
      expect(result.score).toBe(0.6);
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(1);
    });

    it('threshold pass/fail boundary', () => {
      const record = makeRecord();
      // Score will be 0.5 (only r1 passes)
      const rules = makeRules(
        [
          makeRule({ id: 'r1', weight: 0.5, check: 'exists' }),
          makeRule({ id: 'r2', weight: 0.5, check: 'equals', value: 'wrong' }),
        ],
        0.5
      );
      const result = engine.evaluate(record, rules);
      expect(result.score).toBe(0.5);
      expect(result.passed).toBe(true); // 0.5 >= 0.5
    });

    it('threshold fail when score below', () => {
      const record = makeRecord();
      const rules = makeRules(
        [
          makeRule({ id: 'r1', weight: 0.5, check: 'exists' }),
          makeRule({ id: 'r2', weight: 0.5, check: 'equals', value: 'wrong' }),
        ],
        0.6
      );
      const result = engine.evaluate(record, rules);
      expect(result.passed).toBe(false); // 0.5 < 0.6
    });

    it('violations contain severity and message', () => {
      const record = makeRecord({ output: null });
      const rules = makeRules([
        makeRule({ id: 'r1', severity: 'error' }),
        makeRule({ id: 'r2', severity: 'warning', check: 'not_empty' }),
      ]);
      const result = engine.evaluate(record, rules);
      expect(result.violations[0].severity).toBe('error');
      expect(result.violations[1].severity).toBe('warning');
      expect(result.violations[0].message).toBeTruthy();
    });

    it('run_id and rules_version in result', () => {
      const record = makeRecord({ run_id: 'run_abc123' });
      const rules = makeRules([makeRule()]);
      rules.version = '2.5';
      const result = engine.evaluate(record, rules);
      expect(result.run_id).toBe('run_abc123');
      expect(result.rules_version).toBe('2.5');
    });

    it('evaluated_at is ISO string', () => {
      const record = makeRecord();
      const rules = makeRules([makeRule()]);
      const result = engine.evaluate(record, rules);
      expect(() => new Date(result.evaluated_at)).not.toThrow();
      expect(result.evaluated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  // =========================================================================
  // dimension mapping
  // =========================================================================
  describe('dimension mapping', () => {
    it('basic → task_completion', () => {
      const record = makeRecord();
      const rules = makeRules([makeRule({ id: 'r1', type: 'basic', weight: 1 })]);
      const result = engine.evaluate(record, rules);
      expect(result.dimension_scores!.task_completion).toBe(1.0);
    });

    it('tool_use → tool_use', () => {
      const record = makeRecord();
      const rules = makeRules([
        makeRule({
          id: 'r1',
          type: 'tool_use',
          target: 'steps',
          check: 'expected_tools',
          expected: [],
          weight: 1,
        }),
      ]);
      const result = engine.evaluate(record, rules);
      expect(result.dimension_scores!.tool_use).toBe(1.0);
    });

    it('cost → cost_efficiency', () => {
      const record = makeRecord();
      const rules = makeRules([
        makeRule({
          id: 'r1',
          type: 'cost',
          target: 'steps',
          check: 'total_tokens',
          max: 10000,
          weight: 1,
        }),
      ]);
      const result = engine.evaluate(record, rules);
      expect(result.dimension_scores!.cost_efficiency).toBe(1.0);
    });

    it('performance → latency', () => {
      const record = makeRecord();
      const rules = makeRules([
        makeRule({
          id: 'r1',
          type: 'performance',
          target: 'steps',
          check: 'total_latency_ms',
          max: 10000,
          weight: 1,
        }),
      ]);
      const result = engine.evaluate(record, rules);
      expect(result.dimension_scores!.latency).toBe(1.0);
    });
  });

  // =========================================================================
  // findCausingStep
  // =========================================================================
  describe('findCausingStep (via violations)', () => {
    it('finds step with error when rule targets steps with ok condition', () => {
      const record = makeRecord({
        steps: [
          {
            step_id: 'step_ok',
            step_index: 0,
            name: 'ok step',
            type: 'llm_call',
            input: '',
            output: '',
            latency_ms: 0,
            status: 'ok',
          },
          {
            step_id: 'step_err',
            step_index: 1,
            name: 'bad step',
            type: 'tool_call',
            input: '',
            output: '',
            latency_ms: 0,
            status: 'error',
            error: 'timeout',
          },
        ],
      });
      const rules = makeRules([
        makeRule({
          id: 'r1',
          target: 'steps',
          check: 'all',
          condition: { status: 'ok' },
          weight: 1,
        }),
      ]);
      const result = engine.evaluate(record, rules);
      expect(result.violations[0].step_id).toBe('step_err');
    });

    it('uses record.error.step_id', () => {
      const record = makeRecord({
        output: null,
        error: { code: 'RUNTIME_ERROR', message: 'fail', step_id: 'step_xyz' },
      });
      const rules = makeRules([makeRule({ id: 'r1', target: 'output', check: 'exists' })]);
      const result = engine.evaluate(record, rules);
      expect(result.violations[0].step_id).toBe('step_xyz');
    });

    it('returns undefined when no match', () => {
      const record = makeRecord({ output: null });
      const rules = makeRules([makeRule({ id: 'r1', target: 'output', check: 'exists' })]);
      const result = engine.evaluate(record, rules);
      expect(result.violations[0].step_id).toBeUndefined();
    });
  });

  // =========================================================================
  // evaluateWithLeaf
  // =========================================================================
  describe('evaluateWithLeaf', () => {
    it('works without leaf (uses defaults)', () => {
      const record = makeRecord();
      const result = engine.evaluateWithLeaf(record);
      expect(result.run_id).toBe(record.run_id);
      expect(result.checks.length).toBeGreaterThan(0);
    });

    it('deprecated evaluateWithLeafRules still works', () => {
      const record = makeRecord();
      const result = engine.evaluateWithLeafRules(record);
      expect(result.run_id).toBe(record.run_id);
      expect(result.checks.length).toBeGreaterThan(0);
    });
  });
});
