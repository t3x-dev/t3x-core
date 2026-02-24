// @vitest-environment jsdom
/**
 * Tests for getMergeChecks from mergeWorkspaceStore
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock settingsStore
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

// Mock canvasStore to avoid dependency chain issues
vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: {
    getState: () => ({
      loadProjectData: vi.fn(),
    }),
  },
}));

// Mock API module
vi.mock('@/lib/api', () => ({
  fetchTurnContext: vi.fn(),
}));

import { type MergeCheck, useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { Merge2WayResult, Sentence } from '@/types/merge';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSentence(id: string, text: string): Sentence {
  return { id, text, confidence: 0.9 };
}

function makePrepared(overrides: Partial<Merge2WayResult> = {}): Merge2WayResult {
  return {
    identical: overrides.identical ?? [makeSentence('s1', 'Identical sentence')],
    similarPairs: overrides.similarPairs ?? [],
    onlyInSource: overrides.onlyInSource ?? [],
    onlyInTarget: overrides.onlyInTarget ?? [],
  };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  useMergeWorkspaceStore.getState().reset();
  useSettingsStore.setState({ developerMode: false });
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getMergeChecks', () => {
  it('returns an array of MergeCheck items', () => {
    useMergeWorkspaceStore.setState({
      prepared: makePrepared(),
      message: 'test merge',
      targetBranch: 'main',
    });

    const checks = useMergeWorkspaceStore.getState().getMergeChecks();
    expect(Array.isArray(checks)).toBe(true);
    expect(checks.length).toBeGreaterThan(0);

    // Each item should have id, label, passed
    for (const check of checks) {
      expect(check).toHaveProperty('id');
      expect(check).toHaveProperty('label');
      expect(check).toHaveProperty('passed');
      expect(typeof check.id).toBe('string');
      expect(typeof check.label).toBe('string');
      expect(typeof check.passed).toBe('boolean');
    }
  });

  it('returns exactly 5 checks', () => {
    useMergeWorkspaceStore.setState({
      prepared: makePrepared(),
      message: 'msg',
      targetBranch: 'main',
    });

    const checks = useMergeWorkspaceStore.getState().getMergeChecks();
    expect(checks).toHaveLength(5);

    const ids = checks.map((c: MergeCheck) => c.id);
    expect(ids).toContain('resolved');
    expect(ids).toContain('message');
    expect(ids).toContain('sentences');
    expect(ids).toContain('target_branch');
    expect(ids).toContain('impact_scope');
  });

  // --------------------------------------------------------------------------
  // 'resolved' check
  // --------------------------------------------------------------------------

  describe("'resolved' check", () => {
    it('passes when there are no conflicts (unresolvedCount === 0)', () => {
      useMergeWorkspaceStore.setState({
        prepared: makePrepared({ similarPairs: [] }),
        message: 'msg',
        targetBranch: 'main',
      });

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const resolved = checks.find((c: MergeCheck) => c.id === 'resolved');
      expect(resolved?.passed).toBe(true);
      expect(resolved?.detail).toBeUndefined();
    });

    it('fails when there are unresolved conflicts', () => {
      useMergeWorkspaceStore.setState({
        prepared: makePrepared({
          similarPairs: [
            {
              source: makeSentence('s1', 'Source version'),
              target: makeSentence('s2', 'Target version'),
              wordDiff: [],
              // no resolution set
              sourceConstraints: [],
              targetConstraints: [],
            },
          ],
        }),
        message: 'msg',
        targetBranch: 'main',
      });

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const resolved = checks.find((c: MergeCheck) => c.id === 'resolved');
      expect(resolved?.passed).toBe(false);
      expect(resolved?.detail).toBe('1 unresolved');
    });

    it('passes when all conflicts are resolved', () => {
      useMergeWorkspaceStore.setState({
        prepared: makePrepared({
          similarPairs: [
            {
              source: makeSentence('s1', 'Source version'),
              target: makeSentence('s2', 'Target version'),
              wordDiff: [],
              resolution: 'source',
              sourceConstraints: [],
              targetConstraints: [],
            },
          ],
        }),
        message: 'msg',
        targetBranch: 'main',
      });

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const resolved = checks.find((c: MergeCheck) => c.id === 'resolved');
      expect(resolved?.passed).toBe(true);
    });

    it('passes when conflicts are resolved via extended resolutions', () => {
      useMergeWorkspaceStore.setState({
        prepared: makePrepared({
          similarPairs: [
            {
              source: makeSentence('s1', 'Source version'),
              target: makeSentence('s2', 'Target version'),
              wordDiff: [],
              // no standard resolution
              sourceConstraints: [],
              targetConstraints: [],
            },
          ],
        }),
        extendedResolutions: { '0': { type: 'both' } },
        message: 'msg',
        targetBranch: 'main',
      });

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const resolved = checks.find((c: MergeCheck) => c.id === 'resolved');
      expect(resolved?.passed).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 'message' check
  // --------------------------------------------------------------------------

  describe("'message' check", () => {
    it('passes when message is not empty', () => {
      useMergeWorkspaceStore.setState({
        prepared: makePrepared(),
        message: 'My merge message',
        targetBranch: 'main',
      });

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const msgCheck = checks.find((c: MergeCheck) => c.id === 'message');
      expect(msgCheck?.passed).toBe(true);
    });

    it('fails when message is empty', () => {
      useMergeWorkspaceStore.setState({
        prepared: makePrepared(),
        message: '',
        targetBranch: 'main',
      });

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const msgCheck = checks.find((c: MergeCheck) => c.id === 'message');
      expect(msgCheck?.passed).toBe(false);
    });

    it('fails when message is only whitespace', () => {
      useMergeWorkspaceStore.setState({
        prepared: makePrepared(),
        message: '   ',
        targetBranch: 'main',
      });

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const msgCheck = checks.find((c: MergeCheck) => c.id === 'message');
      expect(msgCheck?.passed).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 'sentences' check
  // --------------------------------------------------------------------------

  describe("'sentences' check", () => {
    it('passes when previewSentences.length > 0', () => {
      useMergeWorkspaceStore.setState({
        prepared: makePrepared({
          identical: [makeSentence('s1', 'A sentence')],
        }),
        message: 'msg',
        targetBranch: 'main',
      });

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const sentCheck = checks.find((c: MergeCheck) => c.id === 'sentences');
      expect(sentCheck?.passed).toBe(true);
      expect(sentCheck?.detail).toBe('1 sentences');
    });

    it('fails when previewSentences is empty', () => {
      useMergeWorkspaceStore.setState({
        prepared: makePrepared({
          identical: [],
          similarPairs: [],
          onlyInSource: [],
          onlyInTarget: [],
        }),
        message: 'msg',
        targetBranch: 'main',
      });

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const sentCheck = checks.find((c: MergeCheck) => c.id === 'sentences');
      expect(sentCheck?.passed).toBe(false);
      expect(sentCheck?.detail).toBe('No sentences in result');
    });

    it('counts sentences from multiple sources', () => {
      useMergeWorkspaceStore.setState({
        prepared: makePrepared({
          identical: [makeSentence('s1', 'Identical 1'), makeSentence('s2', 'Identical 2')],
          similarPairs: [
            {
              source: makeSentence('s3', 'Source pick'),
              target: makeSentence('s4', 'Target alternative'),
              wordDiff: [],
              resolution: 'source',
              sourceConstraints: [],
              targetConstraints: [],
            },
          ],
          onlyInSource: [
            {
              sentence: makeSentence('s5', 'Source only'),
              constraints: [],
              keep: true,
            },
          ],
          onlyInTarget: [
            {
              sentence: makeSentence('s6', 'Target only'),
              constraints: [],
              keep: false,
            },
          ],
        }),
        message: 'msg',
        targetBranch: 'main',
      });

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const sentCheck = checks.find((c: MergeCheck) => c.id === 'sentences');
      // 2 identical + 1 resolved source + 1 kept source-only = 4
      expect(sentCheck?.passed).toBe(true);
      expect(sentCheck?.detail).toBe('4 sentences');
    });
  });

  // --------------------------------------------------------------------------
  // 'target_branch' check
  // --------------------------------------------------------------------------

  describe("'target_branch' check", () => {
    it('passes when targetBranch is set', () => {
      useMergeWorkspaceStore.setState({
        prepared: makePrepared(),
        message: 'msg',
        targetBranch: 'main',
      });

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const branchCheck = checks.find((c: MergeCheck) => c.id === 'target_branch');
      expect(branchCheck?.passed).toBe(true);
      expect(branchCheck?.detail).toBe('main');
    });

    it('fails when targetBranch is null', () => {
      useMergeWorkspaceStore.setState({
        prepared: makePrepared(),
        message: 'msg',
        targetBranch: null,
      });

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const branchCheck = checks.find((c: MergeCheck) => c.id === 'target_branch');
      expect(branchCheck?.passed).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 'impact_scope' check (always passes, informational)
  // --------------------------------------------------------------------------

  describe("'impact_scope' check", () => {
    it('always passes', () => {
      useMergeWorkspaceStore.setState({
        prepared: makePrepared(),
        message: 'msg',
        targetBranch: 'main',
      });

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const impactCheck = checks.find((c: MergeCheck) => c.id === 'impact_scope');
      expect(impactCheck?.passed).toBe(true);
    });

    it('includes detail with counts', () => {
      useMergeWorkspaceStore.setState({
        prepared: makePrepared({
          identical: [makeSentence('s1', 'kept')],
          similarPairs: [
            {
              source: makeSentence('s2', 'src'),
              target: makeSentence('s3', 'tgt'),
              wordDiff: [],
              sourceConstraints: [],
              targetConstraints: [],
            },
          ],
          onlyInSource: [
            {
              sentence: makeSentence('s4', 'unique src'),
              constraints: [],
              keep: true,
            },
          ],
          onlyInTarget: [],
        }),
        message: 'msg',
        targetBranch: 'main',
      });

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const impactCheck = checks.find((c: MergeCheck) => c.id === 'impact_scope');
      expect(impactCheck?.detail).toBe('1 kept, 1 conflicts, 1 unique');
    });
  });

  // --------------------------------------------------------------------------
  // Developer mode affects labels
  // --------------------------------------------------------------------------

  describe('developer mode labels', () => {
    it('uses friendly terminology in default mode', () => {
      useMergeWorkspaceStore.setState({
        prepared: makePrepared(),
        message: 'msg',
        targetBranch: 'main',
      });

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const msgCheck = checks.find((c: MergeCheck) => c.id === 'message');
      // In default mode, tm('merge') returns '合并'
      expect(msgCheck?.label).toContain('\u5408\u5E76'); // 合并

      const branchCheck = checks.find((c: MergeCheck) => c.id === 'target_branch');
      // In default mode, tm('branch') returns '变体'
      expect(branchCheck?.label).toContain('\u53d8\u4f53'); // 变体
    });

    it('uses Git terminology in developer mode', () => {
      useSettingsStore.setState({ developerMode: true });
      useMergeWorkspaceStore.setState({
        prepared: makePrepared(),
        message: 'msg',
        targetBranch: 'main',
      });

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const msgCheck = checks.find((c: MergeCheck) => c.id === 'message');
      expect(msgCheck?.label).toContain('Merge');

      const branchCheck = checks.find((c: MergeCheck) => c.id === 'target_branch');
      expect(branchCheck?.label).toContain('branch');
    });
  });
});
