import { describe, expect, it } from 'vitest';
import { diffValidationResults, type ValidationResult } from '../src/index';

describe('diffValidationResults', () => {
  it('reports fixed, new, and unchanged validation gaps', () => {
    const before: ValidationResult = {
      valid: true,
      ready: false,
      errors: [],
      gaps: [
        {
          code: 'REQUIRED_SLOT_MISSING',
          path: 'summary/audience',
          message: 'summary/audience is required before commit.',
        },
        {
          code: 'REQUIRED_EVIDENCE_MISSING',
          path: 'summary/problem',
          message: 'summary/problem needs accepted source evidence.',
        },
      ],
      fixes: [],
    };
    const after: ValidationResult = {
      valid: true,
      ready: false,
      errors: [],
      gaps: [
        {
          code: 'REQUIRED_EVIDENCE_MISSING',
          path: 'summary/problem',
          message: 'summary/problem needs accepted source evidence.',
        },
        {
          code: 'REQUIRED_SLOT_MISSING',
          path: 'summary/outcome',
          message: 'summary/outcome is required before commit.',
        },
      ],
      fixes: [],
    };

    const delta = diffValidationResults({ before, after });

    expect(delta.fixedGaps.map((gap) => gap.path)).toEqual(['summary/audience']);
    expect(delta.newGaps.map((gap) => gap.path)).toEqual(['summary/outcome']);
    expect(delta.unchangedGaps.map((gap) => gap.path)).toEqual(['summary/problem']);
    expect(delta.readyChanged).toBe(false);
    expect(delta.validChanged).toBe(false);
  });

  it('reports fixed and new hard validation errors', () => {
    const before: ValidationResult = {
      valid: false,
      ready: false,
      errors: [
        {
          code: 'INVALID_ENUM',
          path: 'requirements/review_gate/priority',
          message: 'priority must be one of must, should, could',
          details: { actual: 'critical', allowed: ['must', 'should', 'could'] },
        },
      ],
      gaps: [],
      fixes: [],
    };
    const after: ValidationResult = {
      valid: false,
      ready: false,
      errors: [
        {
          code: 'INVALID_TYPE',
          path: 'requirements/review_gate/acceptance',
          message: 'acceptance must be an array',
          details: { actual: 'string', expected: 'array' },
        },
      ],
      gaps: [],
      fixes: [],
    };

    const delta = diffValidationResults({ before, after });

    expect(delta.fixedErrors.map((error) => error.code)).toEqual(['INVALID_ENUM']);
    expect(delta.newErrors.map((error) => error.code)).toEqual(['INVALID_TYPE']);
    expect(delta.unchangedErrors).toEqual([]);
    expect(delta.validChanged).toBe(false);
  });

  it('ignores unstable relation indexes when matching otherwise identical issues', () => {
    const before: ValidationResult = {
      valid: false,
      ready: false,
      errors: [
        {
          code: 'BROKEN_RELATION_ENDPOINT',
          path: '$relations',
          message: 'to endpoint "requirements/missing" does not exist.',
          details: {
            index: 0,
            side: 'to',
            endpoint: 'requirements/missing',
          },
        },
      ],
      gaps: [],
      fixes: [],
    };
    const after: ValidationResult = {
      valid: false,
      ready: false,
      errors: [
        {
          code: 'BROKEN_RELATION_ENDPOINT',
          path: '$relations',
          message: 'to endpoint "requirements/missing" does not exist.',
          details: {
            index: 4,
            side: 'to',
            endpoint: 'requirements/missing',
          },
        },
      ],
      gaps: [],
      fixes: [],
    };

    const delta = diffValidationResults({ before, after });

    expect(delta.fixedErrors).toEqual([]);
    expect(delta.newErrors).toEqual([]);
    expect(delta.unchangedErrors).toHaveLength(1);
  });

  it('preserves duplicate issue counts when only some repeated gaps are fixed', () => {
    const repeatedGap = {
      code: 'REQUIRED_EVIDENCE_MISSING' as const,
      path: 'summary/problem',
      message: 'summary/problem needs accepted source evidence.',
    };
    const before: ValidationResult = {
      valid: true,
      ready: false,
      errors: [],
      gaps: [repeatedGap, repeatedGap],
      fixes: [],
    };
    const after: ValidationResult = {
      valid: true,
      ready: false,
      errors: [],
      gaps: [repeatedGap],
      fixes: [],
    };

    const delta = diffValidationResults({ before, after });

    expect(delta.fixedGaps).toHaveLength(1);
    expect(delta.unchangedGaps).toHaveLength(1);
    expect(delta.newGaps).toEqual([]);
  });

  it('reports valid and ready state changes', () => {
    const before: ValidationResult = {
      valid: false,
      ready: false,
      errors: [
        {
          code: 'INVALID_TYPE',
          path: 'requirements/review_gate/acceptance',
          message: 'acceptance must be an array',
        },
      ],
      gaps: [],
      fixes: [],
    };
    const after: ValidationResult = {
      valid: true,
      ready: true,
      errors: [],
      gaps: [],
      fixes: [],
    };

    const delta = diffValidationResults({ before, after });

    expect(delta.fixedErrors.map((error) => error.code)).toEqual(['INVALID_TYPE']);
    expect(delta.newErrors).toEqual([]);
    expect(delta.validChanged).toBe(true);
    expect(delta.readyChanged).toBe(true);
  });
});
