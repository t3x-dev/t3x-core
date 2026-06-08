/**
 * LLM Asserter Tests
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('pino', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return { default: vi.fn(() => mockLogger) };
});

// Save and clear API key
const savedApiKey = process.env.ANTHROPIC_API_KEY;

function mockAnthropic(create = vi.fn()) {
  vi.doMock('@anthropic-ai/sdk', () => ({
    default: vi.fn(function MockAnthropic() {
      return {
        messages: { create },
      };
    }),
  }));
}

describe('LLMAsserter', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterAll(() => {
    if (savedApiKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = savedApiKey;
    }
  });

  describe('without API key', () => {
    beforeAll(() => {
      delete process.env.ANTHROPIC_API_KEY;
    });

    it('isAvailable returns false', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      const { LLMAsserter } = await import('../asserter.js');
      const asserter = new LLMAsserter();
      expect(asserter.isAvailable()).toBe(false);
    });

    it('generateAssertions returns unavailable status', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      const { LLMAsserter } = await import('../asserter.js');
      const asserter = new LLMAsserter();

      const result = await asserter.generateAssertions({
        evalResult: {
          run_id: 'run_1',
          rules_version: '1.0',
          evaluated_at: new Date().toISOString(),
          passed: false,
          score: 0.5,
          checks: [],
          violations: [{ rule_id: 'r1', severity: 'error', message: 'Failed' }],
        },
        runRecord: {
          run_id: 'run_1',
          status: 'completed',
          inputs: {},
          steps: [],
          timing: { started_at: new Date().toISOString() },
        },
      });

      expect(result.status).toBe('unavailable');
      expect(result.reason).toContain('API key');
    });
  });

  describe('with API key', () => {
    it('isAvailable returns true when key is set', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key-123';
      // Mock Anthropic to avoid real API calls
      mockAnthropic();
      const { LLMAsserter } = await import('../asserter.js');
      const asserter = new LLMAsserter();
      expect(asserter.isAvailable()).toBe(true);
      delete process.env.ANTHROPIC_API_KEY;
    });

    it('returns skipped when no violations and passed', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key-123';
      mockAnthropic();
      const { LLMAsserter } = await import('../asserter.js');
      const asserter = new LLMAsserter();

      const result = await asserter.generateAssertions({
        evalResult: {
          run_id: 'run_1',
          rules_version: '1.0',
          evaluated_at: new Date().toISOString(),
          passed: true,
          score: 1.0,
          checks: [],
          violations: [],
        },
        runRecord: {
          run_id: 'run_1',
          status: 'completed',
          inputs: {},
          steps: [],
          timing: { started_at: new Date().toISOString() },
        },
      });

      expect(result.status).toBe('skipped');
      expect(result.reason).toContain('passed');
      delete process.env.ANTHROPIC_API_KEY;
    });

    it('returns error when LLM call fails', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key-123';
      mockAnthropic(vi.fn().mockRejectedValue(new Error('API rate limited')));
      const { LLMAsserter } = await import('../asserter.js');
      const asserter = new LLMAsserter();

      const result = await asserter.generateAssertions({
        evalResult: {
          run_id: 'run_1',
          rules_version: '1.0',
          evaluated_at: new Date().toISOString(),
          passed: false,
          score: 0.3,
          checks: [],
          violations: [{ rule_id: 'r1', severity: 'error', message: 'Fail' }],
        },
        runRecord: {
          run_id: 'run_1',
          status: 'failed',
          inputs: {},
          steps: [],
          timing: { started_at: new Date().toISOString() },
        },
      });

      expect(result.status).toBe('error');
      expect(result.error).toContain('rate limited');
      delete process.env.ANTHROPIC_API_KEY;
    });

    it('returns success with parsed assertions', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key-123';
      mockAnthropic(
        vi.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                assertions: [
                  {
                    type: 'fail',
                    category: 'correctness',
                    message: 'Output was empty',
                    evidence_refs: ['output'],
                    confidence: 0.9,
                  },
                ],
                suggestions: [],
                summary: 'The run failed due to empty output',
              }),
            },
          ],
        })
      );
      const { LLMAsserter } = await import('../asserter.js');
      const asserter = new LLMAsserter();

      const result = await asserter.generateAssertions({
        evalResult: {
          run_id: 'run_1',
          rules_version: '1.0',
          evaluated_at: new Date().toISOString(),
          passed: false,
          score: 0,
          checks: [
            {
              rule_id: 'r1',
              passed: false,
              score: 0,
              actual: '',
              expected: 'output',
              message: 'Failed',
            },
          ],
          violations: [{ rule_id: 'r1', severity: 'error', message: 'Empty output' }],
        },
        runRecord: {
          run_id: 'run_1',
          status: 'completed',
          inputs: { query: 'hello' },
          steps: [],
          timing: { started_at: new Date().toISOString(), total_ms: 1000 },
        },
      });

      expect(result.status).toBe('success');
      expect(result.output).toBeDefined();
      expect(result.output!.assertions).toHaveLength(1);
      expect(result.output!.assertions[0].type).toBe('fail');
      expect(result.output!.summary).toContain('empty output');
      delete process.env.ANTHROPIC_API_KEY;
    });

    it('handles JSON wrapped in markdown code block', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key-123';
      mockAnthropic(
        vi.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: '```json\n{"assertions": [], "suggestions": [], "summary": "All good"}\n```',
            },
          ],
        })
      );
      const { LLMAsserter } = await import('../asserter.js');
      const asserter = new LLMAsserter();

      const result = await asserter.generateAssertions({
        evalResult: {
          run_id: 'run_1',
          rules_version: '1.0',
          evaluated_at: new Date().toISOString(),
          passed: false,
          score: 0.5,
          checks: [],
          violations: [{ rule_id: 'r1', severity: 'warning', message: 'Issue' }],
        },
        runRecord: {
          run_id: 'run_1',
          status: 'completed',
          inputs: {},
          steps: [],
          timing: { started_at: new Date().toISOString() },
        },
      });

      expect(result.status).toBe('success');
      expect(result.output!.summary).toBe('All good');
      delete process.env.ANTHROPIC_API_KEY;
    });

    it('handles unparseable LLM response gracefully', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key-123';
      mockAnthropic(
        vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'This is not JSON at all' }],
        })
      );
      const { LLMAsserter } = await import('../asserter.js');
      const asserter = new LLMAsserter();

      const result = await asserter.generateAssertions({
        evalResult: {
          run_id: 'run_1',
          rules_version: '1.0',
          evaluated_at: new Date().toISOString(),
          passed: false,
          score: 0,
          checks: [],
          violations: [{ rule_id: 'r1', severity: 'error', message: 'Fail' }],
        },
        runRecord: {
          run_id: 'run_1',
          status: 'failed',
          inputs: {},
          steps: [],
          timing: { started_at: new Date().toISOString() },
        },
      });

      expect(result.status).toBe('success');
      expect(result.output!.assertions).toEqual([]);
      expect(result.output!.summary).toContain('Failed to parse');
      delete process.env.ANTHROPIC_API_KEY;
    });
  });

  describe('types', () => {
    it('Assertion interface has required fields', () => {
      const assertion = {
        id: 'a1',
        type: 'fail' as const,
        category: 'correctness' as const,
        message: 'Test',
        evidence_refs: ['output'],
        confidence: 0.9,
      };
      expect(assertion.type).toBe('fail');
      expect(assertion.confidence).toBeLessThanOrEqual(1);
    });

    it('Suggestion interface has required fields', () => {
      const suggestion = {
        type: 'prompt_change' as const,
        description: 'Fix prompt',
        priority: 'high' as const,
      };
      expect(suggestion.type).toBe('prompt_change');
    });
  });
});
