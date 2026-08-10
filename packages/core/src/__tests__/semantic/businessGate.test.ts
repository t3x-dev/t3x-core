import { describe, expect, it, vi } from 'vitest';
import type { LLMProvider } from '../../llm/types';
import { BusinessGate, evaluateRule, parseGatesConfig } from '../../semantic/businessGate';
import type { BusinessRuleConfig, SemanticContent } from '../../semantic/types';

// ── Helpers ──

const content: SemanticContent = {
  trees: [
    {
      key: 'decision',
      slots: { description: 'Use React', budget: 5000, currency: 'USD' },
      children: [],
    },
    {
      key: 'requirement',
      slots: { description: 'Must be fast' },
      children: [],
    },
    {
      key: 'decision_b',
      slots: { description: 'Use PostgreSQL' },
      children: [],
    },
  ],
  relations: [
    { from: 'requirement', to: 'decision', type: 'causes' },
    { from: 'requirement', to: 'decision_b', type: 'depends' },
  ],
};

const passingRule: BusinessRuleConfig = {
  id: 'has_trees',
  type: 'rule',
  rule: 'trees.length > 0',
  message: 'Must have at least one tree',
  severity: 'error',
};

const failingRule: BusinessRuleConfig = {
  id: 'too_many_trees',
  type: 'rule',
  rule: 'trees.length > 100',
  message: 'Need more than 100 trees',
  severity: 'error',
};

const warningRule: BusinessRuleConfig = {
  id: 'budget_currency',
  type: 'rule',
  rule: `trees.filter(t => t.slots.budget !== undefined).every(t => t.slots.currency !== undefined)`,
  message: 'Trees with budget must have currency',
  severity: 'warning',
};

const failingWarningRule: BusinessRuleConfig = {
  id: 'all_have_budget',
  type: 'rule',
  rule: 'trees.every(t => t.slots.budget !== undefined)',
  message: 'All trees should have budget',
  severity: 'warning',
};

const invalidExprRule: BusinessRuleConfig = {
  id: 'bad_syntax',
  type: 'rule',
  rule: 'trees.notAMethod(!!',
  message: 'Bad syntax',
  severity: 'error',
};

// ── parseGatesConfig ──

describe('parseGatesConfig', () => {
  it('accepts valid config', () => {
    const result = parseGatesConfig([passingRule, warningRule]);
    expect(result).toHaveLength(2);
  });

  it('throws on non-array', () => {
    expect(() => parseGatesConfig('bad' as never)).toThrow('must be an array');
  });

  it('throws on missing id', () => {
    expect(() =>
      parseGatesConfig([{ type: 'rule', rule: 'true', severity: 'error' } as never])
    ).toThrow('string "id"');
  });

  it('throws on invalid type', () => {
    expect(() => parseGatesConfig([{ id: 'x', type: 'bad', severity: 'error' } as never])).toThrow(
      'type must be'
    );
  });

  it('throws when rule type has no expression', () => {
    expect(() => parseGatesConfig([{ id: 'x', type: 'rule', severity: 'error' } as never])).toThrow(
      'requires a "rule" expression'
    );
  });

  it('throws when llm type has no prompt', () => {
    expect(() => parseGatesConfig([{ id: 'x', type: 'llm', severity: 'error' } as never])).toThrow(
      'requires a "prompt"'
    );
  });
});

// ── evaluateRule ──

describe('evaluateRule', () => {
  it('fails closed instead of executing a passing expression', () => {
    const result = evaluateRule(passingRule, content);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('executable business rules are disabled');
  });

  it('does not use the caller-provided failure message as evidence of evaluation', () => {
    const result = evaluateRule(failingRule, content);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('was not evaluated');
  });

  it('does not parse invalid expressions', () => {
    const result = evaluateRule(invalidExprRule, content);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('executable business rules are disabled');
  });

  it('never executes expressions that reconstruct access to the host runtime', () => {
    const rule: BusinessRuleConfig = {
      id: 'host_runtime_escape',
      type: 'rule',
      rule: `({}).constructor.constructor('return pro' + 'cess')().cwd()`,
      severity: 'error',
    };
    const result = evaluateRule(rule, content);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('executable business rules are disabled');
  });
});

// ── BusinessGate.evaluate ──

describe('BusinessGate.evaluate', () => {
  it('fails closed for legacy executable rules', async () => {
    const gate = new BusinessGate();
    const result = await gate.evaluate([passingRule, warningRule], content);
    expect(result.passed).toBe(false);
    expect(result.results).toHaveLength(2);
    expect(result.results.every((r) => !r.passed)).toBe(true);
  });

  it('fails closed for every executable rule regardless of expression result', async () => {
    const gate = new BusinessGate();
    const result = await gate.evaluate([passingRule, failingRule], content);
    expect(result.passed).toBe(false);
    expect(result.results[0].passed).toBe(false);
    expect(result.results[1].passed).toBe(false);
  });

  it('warning-only failures do not block (passed: true)', async () => {
    const gate = new BusinessGate();
    const result = await gate.evaluate([failingWarningRule], content);
    expect(result.passed).toBe(true);
    const warningResult = result.results.find((r) => r.rule_id === 'all_have_budget');
    expect(warningResult?.passed).toBe(false);
    expect(warningResult?.severity).toBe('warning');
  });

  it('error-severity failures block (passed: false)', async () => {
    const gate = new BusinessGate();
    const result = await gate.evaluate([failingRule], content);
    expect(result.passed).toBe(false);
    expect(result.results[0].severity).toBe('error');
  });

  it('skips LLM rules when no provider is available', async () => {
    const llmRule: BusinessRuleConfig = {
      id: 'travel_check',
      type: 'llm',
      prompt: 'Is the travel plan complete?',
      severity: 'warning',
    };
    const gate = new BusinessGate();
    const result = await gate.evaluate([llmRule], content);
    expect(result.passed).toBe(true);
    expect(result.results[0].passed).toBe(true);
    expect(result.results[0].message).toContain('Skipped');
  });

  it('evaluates LLM rules when provider is available', async () => {
    const mockProvider: LLMProvider = {
      id: 'mock',
      generate: vi
        .fn()
        .mockResolvedValue({ text: 'yes', usage: { inputTokens: 10, outputTokens: 5 } }),
      resolveConflict: vi.fn(),
    };
    const llmRule: BusinessRuleConfig = {
      id: 'completeness_check',
      type: 'llm',
      prompt: 'Is the content complete?',
      severity: 'error',
    };
    const gate = new BusinessGate(mockProvider);
    const result = await gate.evaluate([llmRule], content);
    expect(result.passed).toBe(true);
    expect(result.results[0].passed).toBe(true);
    expect(mockProvider.generate).toHaveBeenCalledOnce();
  });

  it('handles LLM "no" response as failure', async () => {
    const mockProvider: LLMProvider = {
      id: 'mock',
      generate: vi.fn().mockResolvedValue({
        text: 'no, missing destination',
        usage: { inputTokens: 10, outputTokens: 5 },
      }),
      resolveConflict: vi.fn(),
    };
    const llmRule: BusinessRuleConfig = {
      id: 'travel_check',
      type: 'llm',
      prompt: 'Is the travel plan complete?',
      message: 'Travel plan is incomplete',
      severity: 'error',
    };
    const gate = new BusinessGate(mockProvider);
    const result = await gate.evaluate([llmRule], content);
    expect(result.passed).toBe(false);
    expect(result.results[0].passed).toBe(false);
    expect(result.results[0].message).toBe('Travel plan is incomplete');
  });

  it('handles LLM provider errors gracefully', async () => {
    const mockProvider: LLMProvider = {
      id: 'mock',
      generate: vi.fn().mockRejectedValue(new Error('API timeout')),
      resolveConflict: vi.fn(),
    };
    const llmRule: BusinessRuleConfig = {
      id: 'fail_check',
      type: 'llm',
      prompt: 'Check something',
      severity: 'warning',
    };
    const gate = new BusinessGate(mockProvider);
    const result = await gate.evaluate([llmRule], content);
    expect(result.passed).toBe(true);
    expect(result.results[0].passed).toBe(false);
    expect(result.results[0].message).toContain('API timeout');
  });
});
