import { describe, expect, it, vi } from 'vitest';
import type { LLMProvider } from '../../llm/types';
import { BusinessGate, evaluateRule, parseGatesConfig } from '../../semantic/businessGate';
import type { BusinessRuleConfig, SemanticContent } from '../../semantic/types';

// ── Helpers ──

const content: SemanticContent = {
  frames: [
    {
      id: 'f_001',
      type: 'decision',
      slots: { description: 'Use React', budget: 5000, currency: 'USD' },
    },
    {
      id: 'f_002',
      type: 'requirement',
      slots: { description: 'Must be fast' },
    },
    {
      id: 'f_003',
      type: 'decision',
      slots: { description: 'Use PostgreSQL' },
    },
  ],
  relations: [
    { from: 'f_002', to: 'f_001', type: 'causes' },
    { from: 'f_002', to: 'f_003', type: 'depends' },
  ],
};

const passingRule: BusinessRuleConfig = {
  id: 'has_frames',
  type: 'rule',
  rule: 'frames.length > 0',
  message: 'Must have at least one frame',
  severity: 'error',
};

const failingRule: BusinessRuleConfig = {
  id: 'too_many_frames',
  type: 'rule',
  rule: 'frames.length > 100',
  message: 'Need more than 100 frames',
  severity: 'error',
};

const warningRule: BusinessRuleConfig = {
  id: 'budget_currency',
  type: 'rule',
  rule: `frames.filter(f => f.slots.budget !== undefined).every(f => f.slots.currency !== undefined)`,
  message: 'Frames with budget must have currency',
  severity: 'warning',
};

const failingWarningRule: BusinessRuleConfig = {
  id: 'all_have_budget',
  type: 'rule',
  rule: 'frames.every(f => f.slots.budget !== undefined)',
  message: 'All frames should have budget',
  severity: 'warning',
};

const invalidExprRule: BusinessRuleConfig = {
  id: 'bad_syntax',
  type: 'rule',
  rule: 'frames.notAMethod(!!',
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
  it('returns passed: true for passing expression', () => {
    const result = evaluateRule(passingRule, content);
    expect(result.passed).toBe(true);
    expect(result.message).toBeUndefined();
  });

  it('returns passed: false for failing expression', () => {
    const result = evaluateRule(failingRule, content);
    expect(result.passed).toBe(false);
    expect(result.message).toBe('Need more than 100 frames');
  });

  it('returns passed: false with error message for invalid expression', () => {
    const result = evaluateRule(invalidExprRule, content);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('threw an error');
  });

  it('evaluates complex relation checks', () => {
    const rule: BusinessRuleConfig = {
      id: 'decision_needs_basis',
      type: 'rule',
      rule: `frames.filter(f => f.type.includes('decision'))
        .every(f => relations.some(r => r.to === f.id &&
          (r.type === 'causes' || r.type === 'depends')))`,
      message: 'Every decision must have causes or depends',
      severity: 'error',
    };
    const result = evaluateRule(rule, content);
    expect(result.passed).toBe(true);
  });
});

// ── BusinessGate.evaluate ──

describe('BusinessGate.evaluate', () => {
  it('passes when all rules pass', async () => {
    const gate = new BusinessGate();
    const result = await gate.evaluate([passingRule, warningRule], content);
    expect(result.passed).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results.every((r) => r.passed)).toBe(true);
  });

  it('handles mixed results correctly', async () => {
    const gate = new BusinessGate();
    const result = await gate.evaluate([passingRule, failingRule], content);
    expect(result.passed).toBe(false);
    expect(result.results[0].passed).toBe(true);
    expect(result.results[1].passed).toBe(false);
  });

  it('warning-only failures do not block (passed: true)', async () => {
    const gate = new BusinessGate();
    const result = await gate.evaluate([passingRule, failingWarningRule], content);
    expect(result.passed).toBe(true);
    // The warning rule did fail
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
      generate: vi.fn().mockResolvedValue({ text: 'yes', usage: { inputTokens: 10, outputTokens: 5 } }),
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
      generate: vi.fn().mockResolvedValue({ text: 'no, missing destination', usage: { inputTokens: 10, outputTokens: 5 } }),
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
    // Warning severity, so overall still passes
    expect(result.passed).toBe(true);
    expect(result.results[0].passed).toBe(false);
    expect(result.results[0].message).toContain('API timeout');
  });
});
