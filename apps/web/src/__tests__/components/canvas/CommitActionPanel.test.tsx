import { describe, expect, it, vi } from 'vitest';
import { buildCommitActions } from '@/components/canvas/CommitActionPanel';

describe('buildCommitActions', () => {
  const baseOpts = {
    onContinueConversation: vi.fn(),
    onViewDetails: vi.fn(),
    onCreateLeaf: vi.fn(),
  };

  it('returns the three standard actions when merge is not available', () => {
    const actions = buildCommitActions(baseOpts);
    expect(actions.map((a) => a.label)).toEqual(['Continue', 'Details', 'Leaf']);
  });

  it('appends a Merge action when onMerge is provided', () => {
    const onMerge = vi.fn();
    const actions = buildCommitActions({ ...baseOpts, onMerge });
    expect(actions.map((a) => a.label)).toEqual(['Continue', 'Details', 'Leaf', 'Merge']);
    actions[3].onClick();
    expect(onMerge).toHaveBeenCalledTimes(1);
  });

  it('omits the Merge action when onMerge is undefined', () => {
    const actions = buildCommitActions({ ...baseOpts, onMerge: undefined });
    expect(actions.find((a) => a.label === 'Merge')).toBeUndefined();
  });
});
