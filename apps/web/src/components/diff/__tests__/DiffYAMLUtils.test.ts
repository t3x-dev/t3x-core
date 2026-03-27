// @ts-nocheck — tree-primary migration: test needs rework
import type { FrameDiff, SemanticContent } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import {
  buildAlignedFrames,
  buildDiffStatusMap,
  buildFrameTree,
  deriveRootFrameId,
} from '../DiffYAMLUtils';

describe('buildAlignedFrames', () => {
  it('orders: modified -> removed -> added -> identical', () => {
    const diff: FrameDiff = {
      modified: [
        {
          frameId: 'f1',
          sourceFrame: { id: 'f1', type: 'a', slots: { x: 1 } },
          targetFrame: { id: 'f1', type: 'a', slots: { x: 2 } },
          slotDiffs: [{ key: 'x', type: 'changed', oldValue: 1, newValue: 2 }],
        },
      ],
      onlyInSource: [{ id: 'f2', type: 'b', slots: {} }],
      onlyInTarget: [{ id: 'f3', type: 'c', slots: {} }],
      identical: [{ id: 'f4', type: 'd', slots: {} }],
      relationsAdded: [],
      relationsRemoved: [],
    };
    const aligned = buildAlignedFrames(diff);
    expect(aligned.map((a) => a.type)).toEqual(['modified', 'removed', 'added', 'identical']);
    expect(aligned.map((a) => a.frameId)).toEqual(['f1', 'f2', 'f3', 'f4']);
  });

  it('handles empty diff', () => {
    const diff: FrameDiff = {
      modified: [],
      onlyInSource: [],
      onlyInTarget: [],
      identical: [],
      relationsAdded: [],
      relationsRemoved: [],
    };
    expect(buildAlignedFrames(diff)).toEqual([]);
  });
});

describe('deriveRootFrameId', () => {
  it('returns explicit root_frame_id if set', () => {
    const content: SemanticContent = {
      root_frame_id: 'f_002',
      frames: [
        { id: 'f_001', type: 'a', slots: {} },
        { id: 'f_002', type: 'b', slots: {} },
      ],
      relations: [{ from: 'f_001', to: 'f_002', type: 'elaborates' }],
    };
    expect(deriveRootFrameId(content)).toBe('f_002');
  });

  it('derives root from most incoming edges', () => {
    const content: SemanticContent = {
      frames: [
        { id: 'f_001', type: 'a', slots: {} },
        { id: 'f_002', type: 'b', slots: {} },
        { id: 'f_003', type: 'c', slots: {} },
      ],
      relations: [
        { from: 'f_002', to: 'f_001', type: 'elaborates' },
        { from: 'f_003', to: 'f_001', type: 'conditions' },
      ],
    };
    expect(deriveRootFrameId(content)).toBe('f_001');
  });

  it('returns first frame when no relations', () => {
    const content: SemanticContent = {
      frames: [{ id: 'f_005', type: 'x', slots: {} }],
      relations: [],
    };
    expect(deriveRootFrameId(content)).toBe('f_005');
  });

  it('returns undefined for empty frames', () => {
    const content: SemanticContent = { frames: [], relations: [] };
    expect(deriveRootFrameId(content)).toBeUndefined();
  });
});

describe('buildDiffStatusMap', () => {
  it('maps all frame statuses', () => {
    const diff: FrameDiff = {
      modified: [
        {
          frameId: 'f1',
          sourceFrame: { id: 'f1', type: 'a', slots: {} },
          targetFrame: { id: 'f1', type: 'a', slots: { x: 1 } },
          slotDiffs: [],
        },
      ],
      onlyInSource: [{ id: 'f2', type: 'b', slots: {} }],
      onlyInTarget: [{ id: 'f3', type: 'c', slots: {} }],
      identical: [{ id: 'f4', type: 'd', slots: {} }],
      relationsAdded: [],
      relationsRemoved: [],
    };
    const map = buildDiffStatusMap(diff);
    expect(map.get('f1')).toBe('modified');
    expect(map.get('f2')).toBe('removed');
    expect(map.get('f3')).toBe('added');
    expect(map.get('f4')).toBe('identical');
  });
});

describe('buildFrameTree', () => {
  it('builds tree from relations', () => {
    const content: SemanticContent = {
      frames: [
        { id: 'f_001', type: 'plan', slots: {} },
        { id: 'f_002', type: 'budget', slots: {} },
        { id: 'f_003', type: 'pref', slots: {} },
      ],
      relations: [
        { from: 'f_002', to: 'f_001', type: 'conditions' },
        { from: 'f_003', to: 'f_001', type: 'elaborates' },
      ],
    };
    const statusMap = new Map<string, 'modified' | 'added' | 'removed' | 'identical'>([
      ['f_001', 'modified'],
      ['f_002', 'identical'],
      ['f_003', 'added'],
    ]);
    const trees = buildFrameTree(content, statusMap, 'f_001');
    expect(trees).toHaveLength(1);
    expect(trees[0].frameId).toBe('f_001');
    expect(trees[0].children).toHaveLength(2);
    expect(trees[0].children.map((c) => c.frameId).sort()).toEqual(['f_002', 'f_003']);
  });

  it('handles orphan frames', () => {
    const content: SemanticContent = {
      frames: [
        { id: 'f_001', type: 'a', slots: {} },
        { id: 'f_002', type: 'b', slots: {} },
      ],
      relations: [],
    };
    const statusMap = new Map<string, 'modified' | 'added' | 'removed' | 'identical'>([
      ['f_001', 'identical'],
      ['f_002', 'added'],
    ]);
    const trees = buildFrameTree(content, statusMap);
    expect(trees).toHaveLength(2); // both are roots since no relations
  });
});
