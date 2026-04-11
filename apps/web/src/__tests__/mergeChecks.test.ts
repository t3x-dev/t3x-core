// @vitest-environment jsdom
/**
 * Tests for getMergeChecks from mergeWorkspaceStore
 *
 * Updated for tree-primary merge architecture.
 * Uses treeMergeResult (path-based MergeResult from core).
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

import type { MergeResult } from '@t3x-dev/core';
import { type MergeCheck, useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';
import { useSettingsStore } from '@/store/settingsStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePrepared(overrides: Partial<MergeResult> = {}): MergeResult {
  return {
    autoKept: overrides.autoKept ?? ['path/identical'],
    conflicts: overrides.conflicts ?? [],
    onlyInSource: overrides.onlyInSource ?? [],
    onlyInTarget: overrides.onlyInTarget ?? [],
    relationsOnlyInSource: overrides.relationsOnlyInSource ?? [],
    relationsOnlyInTarget: overrides.relationsOnlyInTarget ?? [],
    relationsInBoth: overrides.relationsInBoth ?? [],
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
    const result = makePrepared();
    useMergeWorkspaceStore.getState().setTreeMergeResult(result);
    useMergeWorkspaceStore.setState({
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
    const result = makePrepared();
    useMergeWorkspaceStore.getState().setTreeMergeResult(result);
    useMergeWorkspaceStore.setState({
      message: 'msg',
      targetBranch: 'main',
    });

    const checks = useMergeWorkspaceStore.getState().getMergeChecks();
    expect(checks).toHaveLength(5);

    const ids = checks.map((c: MergeCheck) => c.id);
    expect(ids).toContain('resolved');
    expect(ids).toContain('message');
    expect(ids).toContain('nodes');
    expect(ids).toContain('target_branch');
    expect(ids).toContain('preview_computed');
  });

  // --------------------------------------------------------------------------
  // 'resolved' check
  // --------------------------------------------------------------------------

  describe("'resolved' check", () => {
    it('passes when there are no conflicts (unresolvedCount === 0)', () => {
      const result = makePrepared({ conflicts: [] });
      useMergeWorkspaceStore.getState().setTreeMergeResult(result);
      useMergeWorkspaceStore.setState({
        message: 'msg',
        targetBranch: 'main',
      });

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const resolved = checks.find((c: MergeCheck) => c.id === 'resolved');
      expect(resolved?.passed).toBe(true);
      expect(resolved?.detail).toBeUndefined();
    });

    it('fails when there are unresolved conflicts', () => {
      const result = makePrepared({
        conflicts: [{ path: 'topic/a', slotConflicts: [] }],
      });
      useMergeWorkspaceStore.getState().setTreeMergeResult(result);
      useMergeWorkspaceStore.setState({
        message: 'msg',
        targetBranch: 'main',
      });

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const resolved = checks.find((c: MergeCheck) => c.id === 'resolved');
      expect(resolved?.passed).toBe(false);
      expect(resolved?.detail).toBe('1 unresolved');
    });

    it('passes when all conflicts are resolved', () => {
      const result = makePrepared({
        conflicts: [{ path: 'topic/a', slotConflicts: [] }],
      });
      useMergeWorkspaceStore.getState().setTreeMergeResult(result);
      useMergeWorkspaceStore.setState({
        message: 'msg',
        targetBranch: 'main',
      });

      useMergeWorkspaceStore.getState().resolveConflict(0, 'source');

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const resolved = checks.find((c: MergeCheck) => c.id === 'resolved');
      expect(resolved?.passed).toBe(true);
    });

    it('passes when conflicts are resolved via extended resolutions', () => {
      const result = makePrepared({
        conflicts: [{ path: 'topic/a', slotConflicts: [] }],
      });
      useMergeWorkspaceStore.getState().setTreeMergeResult(result);
      useMergeWorkspaceStore.setState({
        message: 'msg',
        targetBranch: 'main',
      });

      useMergeWorkspaceStore.getState().resolveConflict(0, 'both');

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
      const result = makePrepared();
      useMergeWorkspaceStore.getState().setTreeMergeResult(result);
      useMergeWorkspaceStore.setState({
        message: 'My merge message',
        targetBranch: 'main',
      });

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const msgCheck = checks.find((c: MergeCheck) => c.id === 'message');
      expect(msgCheck?.passed).toBe(true);
    });

    it('fails when message is empty', () => {
      const result = makePrepared();
      useMergeWorkspaceStore.getState().setTreeMergeResult(result);
      useMergeWorkspaceStore.setState({
        message: '',
        targetBranch: 'main',
      });

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const msgCheck = checks.find((c: MergeCheck) => c.id === 'message');
      expect(msgCheck?.passed).toBe(false);
    });

    it('fails when message is only whitespace', () => {
      const result = makePrepared();
      useMergeWorkspaceStore.getState().setTreeMergeResult(result);
      useMergeWorkspaceStore.setState({
        message: '   ',
        targetBranch: 'main',
      });

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const msgCheck = checks.find((c: MergeCheck) => c.id === 'message');
      expect(msgCheck?.passed).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 'nodes' check
  // --------------------------------------------------------------------------

  describe("'nodes' check", () => {
    it('passes when preview has nodes', () => {
      const result = makePrepared({
        autoKept: ['path/a'],
      });
      useMergeWorkspaceStore.getState().setTreeMergeResult(result);
      useMergeWorkspaceStore.setState({
        message: 'msg',
        targetBranch: 'main',
      });

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const nodesCheck = checks.find((c: MergeCheck) => c.id === 'nodes');
      expect(nodesCheck?.passed).toBe(true);
      expect(nodesCheck?.detail).toBeDefined();
    });

    it('fails when preview is empty', () => {
      const result = makePrepared({
        autoKept: [],
        conflicts: [],
        onlyInSource: [],
        onlyInTarget: [],
      });
      useMergeWorkspaceStore.getState().setTreeMergeResult(result);
      useMergeWorkspaceStore.setState({
        message: 'msg',
        targetBranch: 'main',
      });

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const nodesCheck = checks.find((c: MergeCheck) => c.id === 'nodes');
      expect(nodesCheck?.passed).toBe(false);
      expect(nodesCheck?.detail).toBe('No nodes in result');
    });

    it('counts nodes from multiple sources', () => {
      const result = makePrepared({
        autoKept: ['path/a', 'path/b'],
        conflicts: [{ path: 'path/conflict', slotConflicts: [] }],
        onlyInSource: ['path/src_only'],
        onlyInTarget: [],
      });
      useMergeWorkspaceStore.getState().setTreeMergeResult(result);
      useMergeWorkspaceStore.setState({
        message: 'msg',
        targetBranch: 'main',
      });

      // Resolve the conflict
      useMergeWorkspaceStore.getState().resolveConflict(0, 'source');

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const nodesCheck = checks.find((c: MergeCheck) => c.id === 'nodes');
      // 2 auto-kept + 1 resolved conflict + 1 source-only = 4
      expect(nodesCheck?.passed).toBe(true);
      expect(nodesCheck?.detail).toBe('4 nodes');
    });
  });

  // --------------------------------------------------------------------------
  // 'target_branch' check
  // --------------------------------------------------------------------------

  describe("'target_branch' check", () => {
    it('passes when targetBranch is set', () => {
      const result = makePrepared();
      useMergeWorkspaceStore.getState().setTreeMergeResult(result);
      useMergeWorkspaceStore.setState({
        message: 'msg',
        targetBranch: 'main',
      });

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const branchCheck = checks.find((c: MergeCheck) => c.id === 'target_branch');
      expect(branchCheck?.passed).toBe(true);
      expect(branchCheck?.detail).toBe('main');
    });

    it('fails when targetBranch is null', () => {
      const result = makePrepared();
      useMergeWorkspaceStore.getState().setTreeMergeResult(result);
      useMergeWorkspaceStore.setState({
        message: 'msg',
        targetBranch: null,
      });

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const branchCheck = checks.find((c: MergeCheck) => c.id === 'target_branch');
      expect(branchCheck?.passed).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 'preview_computed' check (always passes, informational)
  // --------------------------------------------------------------------------

  describe("'preview_computed' check", () => {
    it('always passes', () => {
      const result = makePrepared();
      useMergeWorkspaceStore.getState().setTreeMergeResult(result);
      useMergeWorkspaceStore.setState({
        message: 'msg',
        targetBranch: 'main',
      });

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const impactCheck = checks.find((c: MergeCheck) => c.id === 'preview_computed');
      expect(impactCheck?.passed).toBe(true);
    });

    it('includes detail with counts', () => {
      const result = makePrepared({
        autoKept: ['path/kept'],
        conflicts: [{ path: 'path/conflict', slotConflicts: [] }],
        onlyInSource: ['path/unique_src'],
        onlyInTarget: [],
      });
      useMergeWorkspaceStore.getState().setTreeMergeResult(result);
      useMergeWorkspaceStore.setState({
        message: 'msg',
        targetBranch: 'main',
      });

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const impactCheck = checks.find((c: MergeCheck) => c.id === 'preview_computed');
      expect(impactCheck?.detail).toBe('1 kept, 1 conflicts, 1 unique');
    });
  });

  // --------------------------------------------------------------------------
  // Developer mode affects labels
  // --------------------------------------------------------------------------

  describe('developer mode labels', () => {
    it('uses friendly terminology in default mode', () => {
      const result = makePrepared();
      useMergeWorkspaceStore.getState().setTreeMergeResult(result);
      useMergeWorkspaceStore.setState({
        message: 'msg',
        targetBranch: 'main',
      });

      const checks = useMergeWorkspaceStore.getState().getMergeChecks();
      const msgCheck = checks.find((c: MergeCheck) => c.id === 'message');
      // In default mode, tm('merge') returns 'Merge'
      expect(msgCheck?.label).toContain('Merge');

      const branchCheck = checks.find((c: MergeCheck) => c.id === 'target_branch');
      // In default mode, tm('branch') returns 'Branch', then .toLowerCase() → 'branch'
      expect(branchCheck?.label).toContain('branch');
    });

    it('uses Git terminology in developer mode', () => {
      useSettingsStore.setState({ developerMode: true });
      const result = makePrepared();
      useMergeWorkspaceStore.getState().setTreeMergeResult(result);
      useMergeWorkspaceStore.setState({
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
