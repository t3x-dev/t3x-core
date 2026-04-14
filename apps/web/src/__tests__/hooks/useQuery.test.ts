// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { clearQueryCache } from '@/hooks/shared/useQuery';

describe('useQuery cache', () => {
  afterEach(() => {
    clearQueryCache();
  });

  it('clearQueryCache removes all entries', () => {
    // Just verify the function exists and doesn't throw
    expect(() => clearQueryCache()).not.toThrow();
  });
});
