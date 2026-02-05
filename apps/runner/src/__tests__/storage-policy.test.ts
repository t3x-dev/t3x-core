import { describe, expect, it } from 'vitest';
import { shouldStoreFullTrace } from '../trace/storage-policy.js';

describe('shouldStoreFullTrace', () => {
  describe('always policy', () => {
    it('returns true for completed run', () => {
      expect(shouldStoreFullTrace('always', 'completed')).toBe(true);
    });

    it('returns true for failed run', () => {
      expect(shouldStoreFullTrace('always', 'failed')).toBe(true);
    });
  });

  describe('on_failure policy', () => {
    it('returns false for completed run', () => {
      expect(shouldStoreFullTrace('on_failure', 'completed')).toBe(false);
    });

    it('returns true for failed run', () => {
      expect(shouldStoreFullTrace('on_failure', 'failed')).toBe(true);
    });
  });

  describe('on_violation policy', () => {
    it('returns false when no violations', () => {
      expect(shouldStoreFullTrace('on_violation', 'completed', false)).toBe(false);
    });

    it('returns true when has violations', () => {
      expect(shouldStoreFullTrace('on_violation', 'completed', true)).toBe(true);
    });

    it('returns false when hasViolations is undefined', () => {
      expect(shouldStoreFullTrace('on_violation', 'completed')).toBe(false);
    });
  });

  describe('unknown policy', () => {
    it('falls back to on_failure behavior', () => {
      expect(shouldStoreFullTrace('unknown_policy' as never, 'completed')).toBe(false);
      expect(shouldStoreFullTrace('unknown_policy' as never, 'failed')).toBe(true);
    });
  });
});
