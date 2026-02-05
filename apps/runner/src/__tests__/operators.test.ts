import { describe, expect, it } from 'vitest';
import { operators, runOperator } from '../evaluator/operators.js';

describe('operators', () => {
  // =========================================================================
  // exists
  // =========================================================================
  describe('exists', () => {
    it('returns false for null', () => {
      expect(operators.exists(null, undefined)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(operators.exists(undefined, undefined)).toBe(false);
    });

    it('returns true for 0', () => {
      expect(operators.exists(0, undefined)).toBe(true);
    });

    it('returns true for empty string', () => {
      expect(operators.exists('', undefined)).toBe(true);
    });

    it('returns true for object', () => {
      expect(operators.exists({ key: 'val' }, undefined)).toBe(true);
    });

    it('returns true for false', () => {
      expect(operators.exists(false, undefined)).toBe(true);
    });
  });

  // =========================================================================
  // not_empty
  // =========================================================================
  describe('not_empty', () => {
    it('returns false for null', () => {
      expect(operators.not_empty(null, undefined)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(operators.not_empty(undefined, undefined)).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(operators.not_empty('', undefined)).toBe(false);
    });

    it('returns false for empty array', () => {
      expect(operators.not_empty([], undefined)).toBe(false);
    });

    it('returns true for non-empty object ({})', () => {
      expect(operators.not_empty({}, undefined)).toBe(true);
    });

    it('returns true for non-empty string', () => {
      expect(operators.not_empty('hello', undefined)).toBe(true);
    });

    it('returns true for non-empty array', () => {
      expect(operators.not_empty([1], undefined)).toBe(true);
    });

    it('returns true for number', () => {
      expect(operators.not_empty(42, undefined)).toBe(true);
    });
  });

  // =========================================================================
  // equals
  // =========================================================================
  describe('equals', () => {
    it('matches same primitive', () => {
      expect(operators.equals('hello', 'hello')).toBe(true);
    });

    it('rejects different primitives', () => {
      expect(operators.equals('hello', 'world')).toBe(false);
    });

    it('matches deep objects', () => {
      expect(operators.equals({ a: 1, b: [2, 3] }, { a: 1, b: [2, 3] })).toBe(true);
    });

    it('rejects different objects', () => {
      expect(operators.equals({ a: 1 }, { a: 2 })).toBe(false);
    });

    it('returns false on JSON serialization error for different circular refs', () => {
      const a: Record<string, unknown> = { key: 'a' };
      a.self = a;
      const b: Record<string, unknown> = { key: 'b' };
      b.self = b;
      expect(operators.equals(a, b)).toBe(false);
    });

    it('matches same numbers', () => {
      expect(operators.equals(42, 42)).toBe(true);
    });
  });

  // =========================================================================
  // not_equals
  // =========================================================================
  describe('not_equals', () => {
    it('returns true for different values', () => {
      expect(operators.not_equals('a', 'b')).toBe(true);
    });

    it('returns false for same values', () => {
      expect(operators.not_equals('a', 'a')).toBe(false);
    });
  });

  // =========================================================================
  // contains
  // =========================================================================
  describe('contains', () => {
    it('finds substring in string', () => {
      expect(operators.contains('hello world', 'world')).toBe(true);
    });

    it('rejects missing substring', () => {
      expect(operators.contains('hello world', 'xyz')).toBe(false);
    });

    it('finds member in array', () => {
      expect(operators.contains([1, 2, 3], 2)).toBe(true);
    });

    it('rejects missing array member', () => {
      expect(operators.contains([1, 2, 3], 4)).toBe(false);
    });

    it('uses string coercion for non-string/non-array', () => {
      expect(operators.contains(12345, '234')).toBe(true);
    });
  });

  // =========================================================================
  // not_contains
  // =========================================================================
  describe('not_contains', () => {
    it('returns true when substring not found', () => {
      expect(operators.not_contains('hello', 'xyz')).toBe(true);
    });

    it('returns false when substring found', () => {
      expect(operators.not_contains('hello', 'ell')).toBe(false);
    });
  });

  // =========================================================================
  // regex
  // =========================================================================
  describe('regex', () => {
    it('matches valid pattern', () => {
      expect(operators.regex('hello-123', undefined, { pattern: '^hello-\\d+$' })).toBe(true);
    });

    it('rejects non-matching pattern', () => {
      expect(operators.regex('abc', undefined, { pattern: '^\\d+$' })).toBe(false);
    });

    it('returns false when no pattern provided', () => {
      expect(operators.regex('abc', undefined)).toBe(false);
      expect(operators.regex('abc', undefined, {})).toBe(false);
    });

    it('returns false for invalid regex', () => {
      expect(operators.regex('abc', undefined, { pattern: '[invalid' })).toBe(false);
    });
  });

  // =========================================================================
  // range
  // =========================================================================
  describe('range', () => {
    it('passes when in range', () => {
      expect(operators.range(5, undefined, { min: 1, max: 10 })).toBe(true);
    });

    it('fails when below min', () => {
      expect(operators.range(0, undefined, { min: 1, max: 10 })).toBe(false);
    });

    it('fails when above max', () => {
      expect(operators.range(11, undefined, { min: 1, max: 10 })).toBe(false);
    });

    it('returns false for NaN', () => {
      expect(operators.range('abc', undefined, { min: 0, max: 10 })).toBe(false);
    });

    it('passes when no bounds given (always true)', () => {
      expect(operators.range(999, undefined)).toBe(true);
      expect(operators.range(999, undefined, {})).toBe(true);
    });

    it('includes boundary values', () => {
      expect(operators.range(1, undefined, { min: 1, max: 10 })).toBe(true);
      expect(operators.range(10, undefined, { min: 1, max: 10 })).toBe(true);
    });
  });

  // =========================================================================
  // some
  // =========================================================================
  describe('some', () => {
    it('returns true when match found', () => {
      const items = [{ status: 'ok' }, { status: 'error' }];
      expect(operators.some(items, undefined, { condition: { status: 'error' } })).toBe(true);
    });

    it('returns false when no match', () => {
      const items = [{ status: 'ok' }, { status: 'ok' }];
      expect(operators.some(items, undefined, { condition: { status: 'error' } })).toBe(false);
    });

    it('returns false for empty array', () => {
      expect(operators.some([], undefined, { condition: { status: 'ok' } })).toBe(false);
    });

    it('returns false for non-array', () => {
      expect(operators.some('not-array', undefined, { condition: { status: 'ok' } })).toBe(false);
    });
  });

  // =========================================================================
  // all
  // =========================================================================
  describe('all', () => {
    it('returns true when all match', () => {
      const items = [{ status: 'ok' }, { status: 'ok' }];
      expect(operators.all(items, undefined, { condition: { status: 'ok' } })).toBe(true);
    });

    it('returns false when one fails', () => {
      const items = [{ status: 'ok' }, { status: 'error' }];
      expect(operators.all(items, undefined, { condition: { status: 'ok' } })).toBe(false);
    });

    it('returns true for empty array (vacuous truth)', () => {
      expect(operators.all([], undefined, { condition: { status: 'ok' } })).toBe(true);
    });

    it('returns false for non-array', () => {
      expect(operators.all('not-array', undefined, { condition: { status: 'ok' } })).toBe(false);
    });
  });

  // =========================================================================
  // none
  // =========================================================================
  describe('none', () => {
    it('returns true when no match', () => {
      const items = [{ status: 'ok' }, { status: 'ok' }];
      expect(operators.none(items, undefined, { condition: { status: 'error' } })).toBe(true);
    });

    it('returns false when one matches', () => {
      const items = [{ status: 'ok' }, { status: 'error' }];
      expect(operators.none(items, undefined, { condition: { status: 'error' } })).toBe(false);
    });

    it('returns true for empty array', () => {
      expect(operators.none([], undefined, { condition: { status: 'error' } })).toBe(true);
    });

    it('returns true for non-array', () => {
      expect(operators.none('not-array', undefined, { condition: { status: 'ok' } })).toBe(true);
    });
  });

  // =========================================================================
  // expected_tools
  // =========================================================================
  describe('expected_tools', () => {
    const steps = [
      { span_kind: 'tool', tool: { tool_name: 'search' } },
      { span_kind: 'tool', tool: { tool_name: 'calculator' } },
      { span_kind: 'llm', llm: { model: 'gpt-4' } },
    ];

    it('returns true when all expected tools present', () => {
      expect(operators.expected_tools(steps, ['search', 'calculator'])).toBe(true);
    });

    it('returns false when one expected tool missing', () => {
      expect(operators.expected_tools(steps, ['search', 'browser'])).toBe(false);
    });

    it('returns false for non-array actual', () => {
      expect(operators.expected_tools('not-array', ['search'])).toBe(false);
    });

    it('returns false for non-array expected', () => {
      expect(operators.expected_tools(steps, 'search')).toBe(false);
    });

    it('returns true for empty expected list', () => {
      expect(operators.expected_tools(steps, [])).toBe(true);
    });
  });

  // =========================================================================
  // no_unknown_tools
  // =========================================================================
  describe('no_unknown_tools', () => {
    const steps = [
      { span_kind: 'tool', tool: { tool_name: 'search' } },
      { span_kind: 'tool', tool: { tool_name: 'calculator' } },
    ];

    it('returns true when all tools allowed', () => {
      expect(operators.no_unknown_tools(steps, ['search', 'calculator', 'browser'])).toBe(true);
    });

    it('returns false when unknown tool found', () => {
      expect(operators.no_unknown_tools(steps, ['search'])).toBe(false);
    });

    it('returns false for non-array actual', () => {
      expect(operators.no_unknown_tools('not-array', ['search'])).toBe(false);
    });

    it('returns false for non-array expected', () => {
      expect(operators.no_unknown_tools(steps, 'search')).toBe(false);
    });
  });

  // =========================================================================
  // step_count
  // =========================================================================
  describe('step_count', () => {
    const steps = [{}, {}, {}];

    it('passes when within range', () => {
      expect(operators.step_count(steps, undefined, { min: 1, max: 5 })).toBe(true);
    });

    it('fails when below min', () => {
      expect(operators.step_count(steps, undefined, { min: 5, max: 10 })).toBe(false);
    });

    it('fails when above max', () => {
      expect(operators.step_count(steps, undefined, { min: 1, max: 2 })).toBe(false);
    });

    it('returns false for non-array', () => {
      expect(operators.step_count('not-array', undefined, { min: 0, max: 10 })).toBe(false);
    });
  });

  // =========================================================================
  // no_repeated_steps
  // =========================================================================
  describe('no_repeated_steps', () => {
    it('returns true when all unique', () => {
      const steps = [
        { span_kind: 'tool', tool: { tool_name: 'search', tool_input: 'a' } },
        { span_kind: 'tool', tool: { tool_name: 'search', tool_input: 'b' } },
      ];
      expect(operators.no_repeated_steps(steps, undefined)).toBe(true);
    });

    it('returns false when duplicate found', () => {
      const steps = [
        { span_kind: 'tool', tool: { tool_name: 'search', tool_input: 'a' } },
        { span_kind: 'tool', tool: { tool_name: 'search', tool_input: 'a' } },
      ];
      expect(operators.no_repeated_steps(steps, undefined)).toBe(false);
    });

    it('returns true for non-array', () => {
      expect(operators.no_repeated_steps('not-array', undefined)).toBe(true);
    });

    it('returns true for empty array', () => {
      expect(operators.no_repeated_steps([], undefined)).toBe(true);
    });
  });

  // =========================================================================
  // total_tokens
  // =========================================================================
  describe('total_tokens', () => {
    const steps = [
      { llm: { tokens: { prompt: 100, completion: 50, total: 150 } } },
      { llm: { tokens: { prompt: 200, completion: 100, total: 300 } } },
    ];

    it('passes when sum in range', () => {
      expect(operators.total_tokens(steps, undefined, { min: 0, max: 500 })).toBe(true);
    });

    it('fails when exceeds max', () => {
      expect(operators.total_tokens(steps, undefined, { min: 0, max: 400 })).toBe(false);
    });

    it('handles steps without llm data', () => {
      const mixedSteps = [
        { llm: { tokens: { prompt: 100, completion: 50, total: 150 } } },
        { span_kind: 'tool' },
      ];
      expect(operators.total_tokens(mixedSteps, undefined, { min: 0, max: 200 })).toBe(true);
    });

    it('returns false for non-array', () => {
      expect(operators.total_tokens('not-array', undefined, { min: 0, max: 100 })).toBe(false);
    });
  });

  // =========================================================================
  // total_latency_ms
  // =========================================================================
  describe('total_latency_ms', () => {
    const steps = [{ latency_ms: 100 }, { latency_ms: 200 }, { latency_ms: 50 }];

    it('passes when sum in range', () => {
      expect(operators.total_latency_ms(steps, undefined, { min: 0, max: 500 })).toBe(true);
    });

    it('fails when exceeds max', () => {
      expect(operators.total_latency_ms(steps, undefined, { min: 0, max: 300 })).toBe(false);
    });

    it('handles steps without latency_ms', () => {
      const mixedSteps = [{ latency_ms: 100 }, { name: 'no-latency' }];
      expect(operators.total_latency_ms(mixedSteps, undefined, { min: 0, max: 200 })).toBe(true);
    });

    it('returns false for non-array', () => {
      expect(operators.total_latency_ms('not-array', undefined, { min: 0, max: 100 })).toBe(false);
    });
  });

  // =========================================================================
  // runOperator dispatcher
  // =========================================================================
  describe('runOperator', () => {
    it('dispatches to correct operator', () => {
      expect(runOperator('exists', 'hello', undefined)).toBe(true);
      expect(runOperator('exists', null, undefined)).toBe(false);
      expect(runOperator('equals', 42, 42)).toBe(true);
      expect(runOperator('contains', 'hello world', 'world')).toBe(true);
    });

    it('throws for unknown operator', () => {
      expect(() => runOperator('bogus_op' as never, 'x', 'y')).toThrow('Unknown operator');
    });
  });
});
