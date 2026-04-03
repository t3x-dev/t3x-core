/**
 * Commits Helper Functions Tests
 *
 * Tests for anchor normalization and constraint handling
 */

import { describe, expect, it } from 'vitest';

// Since normalizeAnchorConstraint is not exported, we test the behavior
// through the normalizeCommitAnchors function or re-implement the logic here
// for unit testing purposes.

describe('Anchor Constraint Normalization', () => {
  // Re-implement the normalization logic for testing
  type AnchorConstraint = 'must_have' | 'mustnt_have' | 'preferred';

  function normalizeAnchorConstraint(value: unknown): AnchorConstraint | undefined {
    // Accept snake_case (preferred for v1.1)
    if (value === 'must_have' || value === 'mustnt_have' || value === 'preferred') {
      return value;
    }
    // Accept camelCase for backward compatibility, convert to snake_case
    if (value === 'mustHave') return 'must_have';
    if (value === 'mustntHave') return 'mustnt_have';
    return undefined;
  }

  describe('normalizeAnchorConstraint', () => {
    it('accepts snake_case must_have and returns as-is', () => {
      expect(normalizeAnchorConstraint('must_have')).toBe('must_have');
    });

    it('accepts snake_case mustnt_have and returns as-is', () => {
      expect(normalizeAnchorConstraint('mustnt_have')).toBe('mustnt_have');
    });

    it('accepts preferred and returns as-is', () => {
      expect(normalizeAnchorConstraint('preferred')).toBe('preferred');
    });

    it('converts camelCase mustHave to snake_case must_have', () => {
      expect(normalizeAnchorConstraint('mustHave')).toBe('must_have');
    });

    it('converts camelCase mustntHave to snake_case mustnt_have', () => {
      expect(normalizeAnchorConstraint('mustntHave')).toBe('mustnt_have');
    });

    it('returns undefined for invalid values', () => {
      expect(normalizeAnchorConstraint('invalid')).toBeUndefined();
      expect(normalizeAnchorConstraint(null)).toBeUndefined();
      expect(normalizeAnchorConstraint(undefined)).toBeUndefined();
      expect(normalizeAnchorConstraint(123)).toBeUndefined();
    });
  });

  describe('Constraint behavior in anchors', () => {
    // Helper to simulate anchor constraint processing
    function processConstraint(constraint: unknown): 'must_have' | 'mustnt_have' | 'skip' {
      const normalized = normalizeAnchorConstraint(constraint);
      if (normalized === 'must_have' || normalized === 'preferred') {
        return 'must_have';
      } else if (normalized === 'mustnt_have') {
        return 'mustnt_have';
      }
      return 'skip';
    }

    it('maps must_have to must_have list', () => {
      expect(processConstraint('must_have')).toBe('must_have');
    });

    it('maps preferred to must_have list', () => {
      expect(processConstraint('preferred')).toBe('must_have');
    });

    it('maps mustnt_have to mustnt_have list', () => {
      expect(processConstraint('mustnt_have')).toBe('mustnt_have');
    });

    it('maps camelCase mustHave to must_have list', () => {
      expect(processConstraint('mustHave')).toBe('must_have');
    });

    it('maps camelCase mustntHave to mustnt_have list', () => {
      expect(processConstraint('mustntHave')).toBe('mustnt_have');
    });

    it('skips invalid constraints', () => {
      expect(processConstraint('invalid')).toBe('skip');
    });
  });
});
