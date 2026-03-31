import { describe, expect, it } from 'vitest';
import { generateLesson } from '../../feedback/generate';
import type { Constraint } from '../../types';

describe('generateLesson', () => {
  it('generates lesson for failed require+exact constraint', () => {
    const constraint: Constraint = {
      id: 'cst_abc',
      type: 'require',
      match_mode: 'exact',
      value: 'hello world',
    };
    const lesson = generateLesson(constraint, 'Text "hello world" not found in output');
    expect(lesson).toBe('Output must include exact text: "hello world"');
  });

  it('generates lesson for failed require+semantic constraint', () => {
    const constraint: Constraint = {
      id: 'cst_abc',
      type: 'require',
      match_mode: 'semantic',
      value: 'budget is under 5000',
    };
    const lesson = generateLesson(constraint, 'Semantic match below threshold');
    expect(lesson).toBe('Output must convey the meaning of: "budget is under 5000"');
  });

  it('generates lesson for failed exclude+exact constraint', () => {
    const constraint: Constraint = {
      id: 'cst_abc',
      type: 'exclude',
      match_mode: 'exact',
      value: 'confidential',
      reason: 'legal requirement',
    };
    const lesson = generateLesson(constraint, 'Found excluded text');
    expect(lesson).toBe('Output must NOT contain: "confidential" (reason: legal requirement)');
  });

  it('generates lesson for failed exclude without reason', () => {
    const constraint: Constraint = {
      id: 'cst_abc',
      type: 'exclude',
      match_mode: 'exact',
      value: 'TODO',
    };
    const lesson = generateLesson(constraint, 'Found excluded text');
    expect(lesson).toBe('Output must NOT contain: "TODO"');
  });

  it('generates lesson for exclude+semantic constraint', () => {
    const constraint: Constraint = {
      id: 'cst_abc',
      type: 'exclude',
      match_mode: 'semantic',
      value: 'negative sentiment',
      reason: 'brand guidelines',
    };
    const lesson = generateLesson(constraint, 'Semantic exclude match found');
    expect(lesson).toBe(
      'Output must NOT convey the meaning of: "negative sentiment" (reason: brand guidelines)'
    );
  });
});
