import { describe, expect, it } from 'vitest';
import { getBranchVisual, getCanvasNodeBranch } from '@/domain/canvas/branchVisuals';
import type { CanvasNodeData } from '@/types/nodes';

describe('branch visuals', () => {
  it('gives main and dev distinct product colors', () => {
    expect(getBranchVisual('main').accent).toBe('#6366f1');
    expect(getBranchVisual('dev').accent).toBe('#ec4899');
    expect(getBranchVisual('main').accent).not.toBe(getBranchVisual('dev').accent);
  });

  it('keeps a named branch color stable across calls', () => {
    const first = getBranchVisual('feature/canvas');
    const second = getBranchVisual('feature/canvas');

    expect(first).toEqual(second);
    expect(first.key).toBe('feature/canvas');
    expect(first.accent).toMatch(/^hsl\(/);
  });

  it('uses the persisted commit branch as the node color identity', () => {
    const data = {
      branchName: 'legacy-name',
      branchType: 'branch',
      commit: { branch: 'release/alpha' },
      commitStatus: 'committed',
    } as CanvasNodeData;

    expect(getCanvasNodeBranch(data)).toBe('release/alpha');
  });
});
