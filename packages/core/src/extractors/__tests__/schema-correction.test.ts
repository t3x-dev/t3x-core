import type { Violation } from '@t3x-dev/yschema';
import { describe, expect, it } from 'vitest';
import { buildSchemaCorrectionPrompt } from '../schemaCorrectionPrompt';

describe('buildSchemaCorrectionPrompt', () => {
  it('formats violations into a repair prompt', () => {
    const violations: Violation[] = [
      {
        code: 'REQUIRED_SLOT',
        severity: 'error',
        path: 'services/app',
        message: 'Required slot "image" is missing',
      },
      {
        code: 'REF_NOT_FOUND',
        severity: 'error',
        path: 'services/app',
        message: "'db' referenced from services/app/depends_on is not a key under services",
      },
    ];
    const result = buildSchemaCorrectionPrompt({
      previousOutput: 'yops:\n  - define: { path: services }\n',
      violations,
    });
    expect(result).not.toBeNull();
    expect(result?.systemPrompt).toContain('schema validation');
    expect(result?.systemPrompt).toMatch(/Output ONLY valid YAML/);
    expect(result?.userPrompt).toContain('REQUIRED_SLOT');
    expect(result?.userPrompt).toContain('image');
    expect(result?.userPrompt).toContain('REF_NOT_FOUND');
    expect(result?.userPrompt).toContain('services/app');
    expect(result?.userPrompt).toContain('yops:\n  - define: { path: services }');
  });

  it('returns null when there are no error-severity violations', () => {
    const violations: Violation[] = [
      {
        code: 'RULE_VIOLATION',
        severity: 'info',
        path: 'services/app',
        message: 'no restart policy',
      },
    ];
    const result = buildSchemaCorrectionPrompt({ previousOutput: '', violations });
    expect(result).toBeNull();
  });

  it('ignores warn and info violations, only surfaces errors', () => {
    const violations: Violation[] = [
      {
        code: 'REQUIRED_SLOT',
        severity: 'error',
        path: 'services/app',
        message: 'Required slot "image" is missing',
      },
      {
        code: 'RULE_VIOLATION',
        severity: 'warn',
        path: 'services/db',
        message: 'database should have a password',
      },
      {
        code: 'RULE_VIOLATION',
        severity: 'info',
        path: 'services/app',
        message: 'no restart policy',
      },
    ];
    const result = buildSchemaCorrectionPrompt({
      previousOutput: 'yops: []',
      violations,
    });
    expect(result).not.toBeNull();
    expect(result?.userPrompt).toContain('REQUIRED_SLOT');
    expect(result?.userPrompt).not.toContain('database should have a password');
    expect(result?.userPrompt).not.toContain('no restart policy');
  });
});
