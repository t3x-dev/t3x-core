// @vitest-environment jsdom
/**
 * Tests for microcopy.ts — getMicrocopy + useMicrocopy
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRoots, renderHook } from './hooks/renderHook';

// Mock settingsStore before importing microcopy
vi.mock('@/store/settingsStore', () => {
  const { create } = require('zustand');
  const store = create(() => ({
    developerMode: false,
    setDeveloperMode: (enabled: boolean) => store.setState({ developerMode: enabled }),
    toggleDeveloperMode: () =>
      store.setState((s: { developerMode: boolean }) => ({
        developerMode: !s.developerMode,
      })),
  }));
  return { useSettingsStore: store };
});

import { getMicrocopy, type MicrocopyScenario, useMicrocopy } from '@/lib/microcopy';
import { useSettingsStore } from '@/store/settingsStore';

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  useSettingsStore.setState({ developerMode: false });
  vi.clearAllMocks();
});

afterEach(() => {
  cleanupRoots();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// All scenario keys — used for exhaustive checks
// ---------------------------------------------------------------------------

const ALL_SCENARIOS: MicrocopyScenario[] = [
  'commitSuccess',
  'mergeSuccess',
  'generateComplete',
  'emptyProject',
  'loading',
  'constraintsAllPass',
  'constraintsFail',
  'mergeReviewTitle',
  'mergeReviewConfirm',
  'mergeReviewCancel',
  'reviewAndMerge',
  'backToCanvas',
  'stayHere',
];

// ---------------------------------------------------------------------------
// Tests: getMicrocopy
// ---------------------------------------------------------------------------

describe('getMicrocopy', () => {
  describe('default mode', () => {
    it('returns friendly string for static scenarios', () => {
      expect(getMicrocopy('commitSuccess', 'default')).toBe('Knowledge saved');
      expect(getMicrocopy('emptyProject', 'default')).toBe('Start your first project');
      expect(getMicrocopy('loading', 'default')).toBe('Preparing your workspace...');
      expect(getMicrocopy('constraintsAllPass', 'default')).toBe('All constraints satisfied');
      expect(getMicrocopy('mergeReviewTitle', 'default')).toBe('Review Merge');
      expect(getMicrocopy('mergeReviewConfirm', 'default')).toBe('Confirm Merge');
      expect(getMicrocopy('mergeReviewCancel', 'default')).toBe('Go Back');
      expect(getMicrocopy('reviewAndMerge', 'default')).toBe('\u5BA1\u67E5\u5E76\u5408\u5E76'); // 审查并合并
      expect(getMicrocopy('backToCanvas', 'default')).toBe('\u8FD4\u56DE\u753B\u5E03'); // 返回画布
      expect(getMicrocopy('stayHere', 'default')).toBe('\u7559\u5728\u6B64\u9875'); // 留在此页
    });

    it('returns parameterized string for mergeSuccess', () => {
      const result = getMicrocopy('mergeSuccess', 'default', { n: 5 });
      expect(result).toBe('Versions merged \u2014 5 nodes unified');
    });

    it('returns parameterized string for generateComplete', () => {
      const result = getMicrocopy('generateComplete', 'default', {
        wordCount: 200,
      });
      expect(result).toBe('Output ready \u2014 200 words');
    });

    it('returns parameterized string for constraintsFail', () => {
      const result = getMicrocopy('constraintsFail', 'default', { n: 3 });
      expect(result).toBe('3 constraints need attention');
    });
  });

  describe('developer mode', () => {
    it('returns technical strings for static scenarios', () => {
      expect(getMicrocopy('emptyProject', 'developer')).toBe('No projects');
      expect(getMicrocopy('loading', 'developer')).toBe('Loading...');
      expect(getMicrocopy('constraintsAllPass', 'developer')).toBe('All assertions passed');
      expect(getMicrocopy('mergeReviewTitle', 'developer')).toBe('Merge Review');
      expect(getMicrocopy('mergeReviewConfirm', 'developer')).toBe('Execute Merge');
      expect(getMicrocopy('mergeReviewCancel', 'developer')).toBe('Cancel');
      expect(getMicrocopy('reviewAndMerge', 'developer')).toBe('Review & Merge');
      expect(getMicrocopy('backToCanvas', 'developer')).toBe('Back to Canvas');
      expect(getMicrocopy('stayHere', 'developer')).toBe('Stay Here');
    });

    it('returns parameterized string for commitSuccess', () => {
      const result = getMicrocopy('commitSuccess', 'developer', {
        hash_short: 'abc123',
      });
      expect(result).toBe('Committed: abc123');
    });

    it('returns parameterized string for mergeSuccess', () => {
      const result = getMicrocopy('mergeSuccess', 'developer', {
        hash_short: 'def456',
      });
      expect(result).toBe('Merge complete: def456');
    });

    it('returns parameterized string for generateComplete', () => {
      const result = getMicrocopy('generateComplete', 'developer', {
        wordCount: 150,
        model: 'gpt-4',
      });
      expect(result).toBe('Generated: 150 words, gpt-4');
    });

    it('returns parameterized string for constraintsFail', () => {
      const result = getMicrocopy('constraintsFail', 'developer', { n: 2 });
      expect(result).toBe('2 assertions failed');
    });
  });

  describe('parameter interpolation', () => {
    it('handles numeric parameters', () => {
      const result = getMicrocopy('mergeSuccess', 'default', { n: 10 });
      expect(result).toContain('10');
    });

    it('handles string parameters', () => {
      const result = getMicrocopy('commitSuccess', 'developer', {
        hash_short: 'xyz789',
      });
      expect(result).toContain('xyz789');
    });

    it('handles missing params gracefully for function entries', () => {
      // Function entries receive empty object when params not provided
      const result = getMicrocopy('mergeSuccess', 'default');
      expect(typeof result).toBe('string');
    });
  });

  describe('exhaustive scenario coverage', () => {
    it('all MicrocopyScenario keys return a string in default mode', () => {
      for (const scenario of ALL_SCENARIOS) {
        const result = getMicrocopy(scenario, 'default', {
          n: 1,
          hash_short: 'abc',
          wordCount: 100,
          model: 'test',
        });
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      }
    });

    it('all MicrocopyScenario keys return a string in developer mode', () => {
      for (const scenario of ALL_SCENARIOS) {
        const result = getMicrocopy(scenario, 'developer', {
          n: 1,
          hash_short: 'abc',
          wordCount: 100,
          model: 'test',
        });
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: useMicrocopy hook
// ---------------------------------------------------------------------------

describe('useMicrocopy hook', () => {
  it('returns a function', () => {
    const { result, unmount } = renderHook(() => useMicrocopy());
    expect(typeof result.current).toBe('function');
    unmount();
  });

  it('returns default mode copy when developerMode is false', () => {
    const { result, unmount } = renderHook(() => useMicrocopy());
    expect(result.current('emptyProject')).toBe('Start your first project');
    expect(result.current('loading')).toBe('Preparing your workspace...');
    unmount();
  });

  it('returns developer mode copy when developerMode is true', () => {
    useSettingsStore.setState({ developerMode: true });
    const { result, unmount } = renderHook(() => useMicrocopy());
    expect(result.current('emptyProject')).toBe('No projects');
    expect(result.current('loading')).toBe('Loading...');
    unmount();
  });

  it('supports parameter interpolation via hook', () => {
    useSettingsStore.setState({ developerMode: true });
    const { result, unmount } = renderHook(() => useMicrocopy());
    const text = result.current('commitSuccess', { hash_short: 'aaa111' });
    expect(text).toBe('Committed: aaa111');
    unmount();
  });
});
