/**
 * Corrective Prompt Tests
 *
 * Tests for intelligent feedback retry (Upgrade #3).
 * Verifies that corrective prompts contain the right information
 * for LLM to fix constraint violations.
 */

import { describe, expect, it } from 'vitest';
import { buildCorrectivePrompt } from '../../leaf/corrective-prompt';
import type { Assertion, Constraint } from '../../types';

const sampleConstraints: Constraint[] = [
  {
    id: 'cst_require1',
    type: 'require',
    match_mode: 'exact',
    value: 'refund policy',
  },
  {
    id: 'cst_require2',
    type: 'require',
    match_mode: 'semantic',
    value: 'customer satisfaction guarantee',
  },
  {
    id: 'cst_exclude1',
    type: 'exclude',
    match_mode: 'exact',
    value: 'CompetitorX',
    reason: 'Brand policy prohibits mentioning competitors',
  },
];

describe('buildCorrectivePrompt', () => {
  it('includes failed assertion details', () => {
    const failedAssertions: Assertion[] = [
      {
        id: 'ast_1',
        constraint_id: 'cst_require1',
        passed: false,
        details: 'Required value "refund policy" not found in output',
      },
    ];

    const prompt = buildCorrectivePrompt({
      output: 'Some output that lacks the required phrase.',
      failedAssertions,
      constraints: sampleConstraints,
      attempt: 2,
    });

    expect(prompt).toContain('REQUIRE');
    expect(prompt).toContain('exact');
    expect(prompt).toContain('refund policy');
    expect(prompt).toContain('1 constraint(s)');
  });

  it('includes exclude constraint reason', () => {
    const failedAssertions: Assertion[] = [
      {
        id: 'ast_2',
        constraint_id: 'cst_exclude1',
        passed: false,
        details: 'Excluded value "CompetitorX" found at position 42',
      },
    ];

    const prompt = buildCorrectivePrompt({
      output: 'Our product is better than CompetitorX in every way.',
      failedAssertions,
      constraints: sampleConstraints,
      attempt: 2,
    });

    expect(prompt).toContain('EXCLUDE');
    expect(prompt).toContain('CompetitorX');
    expect(prompt).toContain('Brand policy prohibits mentioning competitors');
  });

  it('includes urgency on final attempt', () => {
    const failedAssertions: Assertion[] = [
      {
        id: 'ast_1',
        constraint_id: 'cst_require1',
        passed: false,
        details: 'Required value "refund policy" not found',
      },
    ];

    const prompt = buildCorrectivePrompt({
      output: 'Some output.',
      failedAssertions,
      constraints: sampleConstraints,
      attempt: 3,
    });

    expect(prompt).toContain('FINAL attempt');
    expect(prompt).toContain('MUST satisfy ALL');
  });

  it('non-final attempt has moderate urgency', () => {
    const failedAssertions: Assertion[] = [
      {
        id: 'ast_1',
        constraint_id: 'cst_require1',
        passed: false,
        details: 'Not found',
      },
    ];

    const prompt = buildCorrectivePrompt({
      output: 'Some output.',
      failedAssertions,
      constraints: sampleConstraints,
      attempt: 2,
    });

    expect(prompt).toContain('carefully address');
    expect(prompt).not.toContain('FINAL attempt');
  });

  it('includes the previous output', () => {
    const failedAssertions: Assertion[] = [
      {
        id: 'ast_1',
        constraint_id: 'cst_require1',
        passed: false,
        details: 'Not found',
      },
    ];

    const output = 'This is the previous output text.';
    const prompt = buildCorrectivePrompt({
      output,
      failedAssertions,
      constraints: sampleConstraints,
      attempt: 2,
    });

    expect(prompt).toContain('previous output');
    expect(prompt).toContain(output);
  });

  it('truncates very long outputs', () => {
    const failedAssertions: Assertion[] = [
      {
        id: 'ast_1',
        constraint_id: 'cst_require1',
        passed: false,
        details: 'Not found',
      },
    ];

    const longOutput = 'x'.repeat(3000);
    const prompt = buildCorrectivePrompt({
      output: longOutput,
      failedAssertions,
      constraints: sampleConstraints,
      attempt: 2,
    });

    expect(prompt).toContain('truncated');
    expect(prompt.length).toBeLessThan(longOutput.length);
  });

  it('handles multiple failed constraints', () => {
    const failedAssertions: Assertion[] = [
      {
        id: 'ast_1',
        constraint_id: 'cst_require1',
        passed: false,
        details: 'Required value "refund policy" not found',
      },
      {
        id: 'ast_2',
        constraint_id: 'cst_exclude1',
        passed: false,
        details: 'Excluded value "CompetitorX" found',
      },
    ];

    const prompt = buildCorrectivePrompt({
      output: 'Output mentioning CompetitorX.',
      failedAssertions,
      constraints: sampleConstraints,
      attempt: 2,
    });

    expect(prompt).toContain('2 constraint(s)');
    expect(prompt).toContain('refund policy');
    expect(prompt).toContain('CompetitorX');
  });

  it('handles missing constraint gracefully', () => {
    const failedAssertions: Assertion[] = [
      {
        id: 'ast_1',
        constraint_id: 'cst_unknown',
        passed: false,
        details: 'Some assertion from unknown constraint',
      },
    ];

    const prompt = buildCorrectivePrompt({
      output: 'Some output.',
      failedAssertions,
      constraints: sampleConstraints,
      attempt: 2,
    });

    expect(prompt).toContain('Some assertion from unknown constraint');
  });

  it('includes semantic match mode label', () => {
    const failedAssertions: Assertion[] = [
      {
        id: 'ast_1',
        constraint_id: 'cst_require2',
        passed: false,
        details: 'Semantic similarity 0.620 < 0.85 threshold',
      },
    ];

    const prompt = buildCorrectivePrompt({
      output: 'Some output.',
      failedAssertions,
      constraints: sampleConstraints,
      attempt: 2,
    });

    expect(prompt).toContain('REQUIRE');
    expect(prompt).toContain('semantic');
    expect(prompt).toContain('customer satisfaction guarantee');
  });
});
