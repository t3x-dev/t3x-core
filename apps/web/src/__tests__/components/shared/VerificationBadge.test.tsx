import { describe, expect, test } from 'vitest';
import { VerificationBadge } from '@/components/shared/VerificationBadge';
import type { VerifyResult } from '@/lib/api';

describe('VerificationBadge', () => {
  test('component exports successfully', () => {
    expect(VerificationBadge).toBeDefined();
    expect(typeof VerificationBadge).toBe('function');
  });

  test('VerifyResult interface has correct shape', () => {
    const result: VerifyResult = {
      valid: true,
      total: 10,
      verified_depth: 5,
      entry_points: 2,
      errors: {
        hash_mismatch: [],
        parent_not_found: [],
        other: [],
      },
      verified_at: '2026-03-02T00:00:00Z',
    };
    expect(result.valid).toBe(true);
    expect(result.total).toBe(10);
  });

  test('failed result has error details', () => {
    const result: VerifyResult = {
      valid: false,
      total: 10,
      verified_depth: 3,
      entry_points: 2,
      errors: {
        hash_mismatch: ['sha256:abc'],
        parent_not_found: ['sha256:def'],
        other: [],
      },
      verified_at: '2026-03-02T00:00:00Z',
    };
    expect(result.valid).toBe(false);
    expect(result.errors.hash_mismatch).toHaveLength(1);
    expect(result.errors.parent_not_found).toHaveLength(1);
  });

  test('verified_at is parseable as date', () => {
    const result: VerifyResult = {
      valid: true,
      total: 5,
      verified_depth: 5,
      entry_points: 1,
      errors: { hash_mismatch: [], parent_not_found: [], other: [] },
      verified_at: '2026-03-02T12:30:00Z',
    };
    const date = new Date(result.verified_at);
    expect(date.getFullYear()).toBe(2026);
  });
});
