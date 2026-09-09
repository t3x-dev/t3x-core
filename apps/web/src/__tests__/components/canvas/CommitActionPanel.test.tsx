import { describe, expect, it, vi } from 'vitest';
import { buildCommitActions } from '@/components/canvas/CommitActionPanel';

describe('buildCommitActions', () => {
  const baseOpts = {
    onCreateLeaf: vi.fn(),
  };

  it('returns neutral canvas actions without duplicating commit detail navigation', () => {
    const actions = buildCommitActions(baseOpts);
    expect(actions.map((a) => a.label)).toEqual([]);
  });

  it('adds View Diff when a parent comparison is available', () => {
    const onViewDiff = vi.fn();
    const actions = buildCommitActions({ ...baseOpts, onViewDiff });
    expect(actions.map((a) => a.label)).toEqual(['View Diff']);
    actions[0].onClick();
    expect(onViewDiff).toHaveBeenCalledTimes(1);
  });

  it('keeps existing leaves one click away while still allowing a new leaf', () => {
    const onOpenLeaf = vi.fn();
    const actions = buildCommitActions({ ...baseOpts, onOpenLeaf });
    expect(actions.map((a) => a.label)).toEqual(['Open Leaf']);
    actions[0].onClick();
    expect(onOpenLeaf).toHaveBeenCalledTimes(1);
  });

  it('appends a Merge action when onMerge is provided', () => {
    const onMerge = vi.fn();
    const actions = buildCommitActions({ ...baseOpts, onMerge });
    expect(actions.map((a) => a.label)).toEqual(['Merge']);
    actions[0].onClick();
    expect(onMerge).toHaveBeenCalledTimes(1);
  });

  it('omits the Merge action when onMerge is undefined', () => {
    const actions = buildCommitActions({ ...baseOpts, onMerge: undefined });
    expect(actions.find((a) => a.label === 'Merge')).toBeUndefined();
  });
});
