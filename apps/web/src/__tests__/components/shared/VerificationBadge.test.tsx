import { describe, expect, test } from 'vitest';
import { VerificationBadge } from '@/components/shared/VerificationBadge';
import type { BackfillResult, QuickVerifyResult, VerifyResult } from '@/infrastructure';

describe('VerificationBadge', () => {
  test('component exports successfully', () => {
    expect(VerificationBadge).toBeDefined();
    expect(typeof VerificationBadge).toBe('function');
  });

  test('VerifyResult interface has correct shape with Merkle fields', () => {
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
      merkle_roots: { branch_main: 'sha256:abc' },
      merkle_mismatches: [],
      truncated: false,
      verified_at: '2026-03-02T00:00:00Z',
    };
    expect(result.valid).toBe(true);
    expect(result.merkle_roots).toBeDefined();
    expect(result.truncated).toBe(false);
  });

  test('VerifyResult Merkle fields are optional', () => {
    const result: VerifyResult = {
      valid: true,
      total: 5,
      verified_depth: 5,
      entry_points: 1,
      errors: { hash_mismatch: [], parent_not_found: [], other: [] },
      verified_at: '2026-03-02T12:30:00Z',
    };
    expect(result.merkle_roots).toBeUndefined();
    expect(result.merkle_mismatches).toBeUndefined();
    expect(result.truncated).toBeUndefined();
  });

  test('QuickVerifyResult interface has correct shape', () => {
    const result: QuickVerifyResult = {
      valid: true,
      checked: 42,
      mismatches: [],
      missing_roots: [],
      verified_at: '2026-03-10T10:00:00Z',
    };
    expect(result.valid).toBe(true);
    expect(result.checked).toBe(42);
    expect(result.mismatches).toHaveLength(0);
    expect(result.missing_roots).toHaveLength(0);
  });

  test('QuickVerifyResult with failures', () => {
    const result: QuickVerifyResult = {
      valid: false,
      checked: 10,
      mismatches: ['sha256:abc', 'sha256:def'],
      missing_roots: ['sha256:ghi'],
      verified_at: '2026-03-10T10:00:00Z',
    };
    expect(result.valid).toBe(false);
    expect(result.mismatches).toHaveLength(2);
    expect(result.missing_roots).toHaveLength(1);
  });

  test('BackfillResult interface has correct shape', () => {
    const result: BackfillResult = {
      updated: 150,
      remaining: false,
      verified_at: '2026-03-10T10:05:00Z',
    };
    expect(result.updated).toBe(150);
    expect(result.remaining).toBe(false);
  });

  test('failed VerifyResult has error details', () => {
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
});
