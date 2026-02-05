import { describe, expect, it } from 'vitest';
import {
  CheckResultSchema,
  DimensionScoresSchema,
  EvalResultSchema,
  ViolationSchema,
} from '../schemas/eval-result.js';
import {
  EvalRulesSchema,
  RuleOperatorSchema,
  RuleSchema,
  RuleTypeSchema,
} from '../schemas/eval-rules.js';
import { RunRecordSchema, SpanKindSchema, StepRecordSchema } from '../schemas/run-record.js';

describe('schemas', () => {
  // =========================================================================
  // RuleOperator enum
  // =========================================================================
  describe('RuleOperatorSchema', () => {
    const validOperators = [
      'exists',
      'not_empty',
      'equals',
      'not_equals',
      'contains',
      'not_contains',
      'regex',
      'range',
      'some',
      'all',
      'none',
      'expected_tools',
      'no_unknown_tools',
      'step_count',
      'no_repeated_steps',
      'total_tokens',
      'total_latency_ms',
    ];

    it.each(validOperators)('accepts valid operator: %s', (op) => {
      expect(RuleOperatorSchema.parse(op)).toBe(op);
    });

    it('rejects invalid operator', () => {
      expect(() => RuleOperatorSchema.parse('bogus')).toThrow();
    });
  });

  // =========================================================================
  // RuleType enum
  // =========================================================================
  describe('RuleTypeSchema', () => {
    const validTypes = ['basic', 'tool_use', 'trajectory', 'cost', 'performance'];

    it.each(validTypes)('accepts valid type: %s', (t) => {
      expect(RuleTypeSchema.parse(t)).toBe(t);
    });

    it('rejects invalid type', () => {
      expect(() => RuleTypeSchema.parse('invalid')).toThrow();
    });
  });

  // =========================================================================
  // Rule object
  // =========================================================================
  describe('RuleSchema', () => {
    it('accepts valid rule', () => {
      const rule = {
        id: 'r1',
        target: 'output',
        check: 'exists',
        weight: 0.5,
      };
      const parsed = RuleSchema.parse(rule);
      expect(parsed.id).toBe('r1');
      expect(parsed.type).toBe('basic'); // default
      expect(parsed.severity).toBe('error'); // default
    });

    it('accepts rule with all optional fields', () => {
      const rule = {
        id: 'r1',
        name: 'Output check',
        type: 'tool_use',
        target: 'steps',
        check: 'expected_tools',
        value: 'test',
        pattern: '.*',
        min: 0,
        max: 100,
        condition: { status: 'ok' },
        expected: ['search'],
        skip_if_empty: true,
        weight: 0.8,
        severity: 'warning',
      };
      const parsed = RuleSchema.parse(rule);
      expect(parsed.name).toBe('Output check');
      expect(parsed.type).toBe('tool_use');
    });

    it('rejects rule without required fields', () => {
      expect(() => RuleSchema.parse({ id: 'r1' })).toThrow();
    });

    it('rejects weight out of range', () => {
      expect(() =>
        RuleSchema.parse({ id: 'r1', target: 'output', check: 'exists', weight: 2.0 })
      ).toThrow();
      expect(() =>
        RuleSchema.parse({ id: 'r1', target: 'output', check: 'exists', weight: -0.1 })
      ).toThrow();
    });
  });

  // =========================================================================
  // EvalRules
  // =========================================================================
  describe('EvalRulesSchema', () => {
    it('accepts valid eval rules', () => {
      const rules = {
        version: '1.0',
        rules: [{ id: 'r1', target: 'output', check: 'exists', weight: 0.5 }],
        pass_threshold: 0.8,
      };
      const parsed = EvalRulesSchema.parse(rules);
      expect(parsed.version).toBe('1.0');
      expect(parsed.rules).toHaveLength(1);
    });

    it('rejects empty rules array', () => {
      expect(() =>
        EvalRulesSchema.parse({ version: '1.0', rules: [], pass_threshold: 0.8 })
      ).toThrow();
    });

    it('rejects threshold above 1', () => {
      expect(() =>
        EvalRulesSchema.parse({
          version: '1.0',
          rules: [{ id: 'r1', target: 'output', check: 'exists', weight: 0.5 }],
          pass_threshold: 1.5,
        })
      ).toThrow();
    });

    it('rejects threshold below 0', () => {
      expect(() =>
        EvalRulesSchema.parse({
          version: '1.0',
          rules: [{ id: 'r1', target: 'output', check: 'exists', weight: 0.5 }],
          pass_threshold: -0.1,
        })
      ).toThrow();
    });
  });

  // =========================================================================
  // SpanKind
  // =========================================================================
  describe('SpanKindSchema', () => {
    it.each(['chain', 'llm', 'tool', 'retriever', 'workflow'])('accepts %s', (kind) => {
      expect(SpanKindSchema.parse(kind)).toBe(kind);
    });

    it('rejects invalid span kind', () => {
      expect(() => SpanKindSchema.parse('invalid')).toThrow();
    });
  });

  // =========================================================================
  // StepRecord
  // =========================================================================
  describe('StepRecordSchema', () => {
    it('accepts valid step record', () => {
      const step = {
        step_id: 'step_001',
        step_index: 0,
        name: 'LLM Call',
        type: 'llm_call',
        input: 'prompt',
        output: 'response',
        latency_ms: 100,
        status: 'ok',
      };
      const parsed = StepRecordSchema.parse(step);
      expect(parsed.step_id).toBe('step_001');
      expect(parsed.span_kind).toBe('chain'); // default
    });

    it('accepts step with llm data', () => {
      const step = {
        step_id: 'step_002',
        step_index: 0,
        name: 'LLM',
        type: 'llm_call',
        span_kind: 'llm',
        input: '',
        output: '',
        latency_ms: 0,
        status: 'ok',
        llm: {
          model: 'gpt-4',
          tokens: { prompt: 100, completion: 50, total: 150 },
        },
      };
      expect(StepRecordSchema.parse(step).llm?.model).toBe('gpt-4');
    });
  });

  // =========================================================================
  // RunRecord
  // =========================================================================
  describe('RunRecordSchema', () => {
    it('accepts valid run record', () => {
      const record = {
        run_id: 'run_001',
        status: 'completed',
        inputs: { query: 'hello' },
        steps: [],
        timing: { started_at: new Date().toISOString() },
      };
      const parsed = RunRecordSchema.parse(record);
      expect(parsed.run_id).toBe('run_001');
    });

    it('accepts record with all optional fields', () => {
      const record = {
        run_id: 'run_002',
        status: 'failed',
        inputs: { query: 'hello' },
        output: { error: 'fail' },
        steps: [],
        timing: {
          started_at: new Date().toISOString(),
          ended_at: new Date().toISOString(),
          total_ms: 500,
        },
        error: { code: 'TIMEOUT', message: 'Run timed out', step_id: 'step_001' },
        source: { system: 'n8n', execution_id: 'exec_001' },
      };
      const parsed = RunRecordSchema.parse(record);
      expect(parsed.error?.code).toBe('TIMEOUT');
      expect(parsed.source?.system).toBe('n8n');
    });

    it('rejects invalid status', () => {
      expect(() =>
        RunRecordSchema.parse({
          run_id: 'run_003',
          status: 'invalid_status',
          inputs: {},
          steps: [],
          timing: { started_at: new Date().toISOString() },
        })
      ).toThrow();
    });
  });

  // =========================================================================
  // CheckResult
  // =========================================================================
  describe('CheckResultSchema', () => {
    it('accepts valid check result', () => {
      const check = {
        rule_id: 'r1',
        passed: true,
        score: 0.5,
        actual: 'hello',
        expected: 'hello',
        message: 'Rule passed',
      };
      expect(CheckResultSchema.parse(check).passed).toBe(true);
    });

    it('rejects score out of range', () => {
      expect(() =>
        CheckResultSchema.parse({
          rule_id: 'r1',
          passed: true,
          score: 1.5,
          actual: null,
          expected: null,
          message: '',
        })
      ).toThrow();
    });
  });

  // =========================================================================
  // Violation
  // =========================================================================
  describe('ViolationSchema', () => {
    it('accepts valid violation', () => {
      const v = { rule_id: 'r1', severity: 'error', message: 'Failed' };
      expect(ViolationSchema.parse(v).severity).toBe('error');
    });

    it('accepts violation with step_id', () => {
      const v = { rule_id: 'r1', severity: 'warning', message: 'Warn', step_id: 'step_001' };
      expect(ViolationSchema.parse(v).step_id).toBe('step_001');
    });
  });

  // =========================================================================
  // DimensionScores
  // =========================================================================
  describe('DimensionScoresSchema', () => {
    it('accepts valid dimension scores', () => {
      const scores = {
        task_completion: 1.0,
        tool_use: 0.8,
        trajectory_efficiency: 0.9,
        cost_efficiency: 0.7,
        latency: 0.6,
      };
      expect(DimensionScoresSchema.parse(scores).task_completion).toBe(1.0);
    });

    it('rejects score above 1', () => {
      expect(() =>
        DimensionScoresSchema.parse({
          task_completion: 1.5,
          tool_use: 0.8,
          trajectory_efficiency: 0.9,
          cost_efficiency: 0.7,
          latency: 0.6,
        })
      ).toThrow();
    });
  });

  // =========================================================================
  // EvalResult
  // =========================================================================
  describe('EvalResultSchema', () => {
    it('accepts valid eval result', () => {
      const result = {
        run_id: 'run_001',
        rules_version: '1.0',
        evaluated_at: new Date().toISOString(),
        passed: true,
        score: 0.9,
        checks: [],
        violations: [],
      };
      expect(EvalResultSchema.parse(result).passed).toBe(true);
    });

    it('rejects score out of range', () => {
      expect(() =>
        EvalResultSchema.parse({
          run_id: 'run_001',
          rules_version: '1.0',
          evaluated_at: new Date().toISOString(),
          passed: true,
          score: 2.0,
          checks: [],
          violations: [],
        })
      ).toThrow();
    });
  });
});
