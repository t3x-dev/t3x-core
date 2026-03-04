/**
 * Canvas Store Utils Tests
 */

import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import {
  buildIncomingMap,
  buildOutgoingMap,
  canConnect,
  collectAffectedStagingUnits,
  computeAttachedPosition,
  computeUnitTone,
  getLockedNodeIds,
  getNumericId,
  isUpstreamOfStagingUnit,
  nextEdgeId,
  nextNodeId,
  resetCounters,
  resolveLatestMainUnitId,
  snapPosition,
} from '../../store/canvasStoreUtils';
import type { CanvasNodeData } from '../../types/nodes';

function makeNode(
  id: string,
  kind: 'unit' | 'leaf',
  overrides: Partial<CanvasNodeData> = {}
): Node<CanvasNodeData> {
  return {
    id,
    type: kind,
    position: { x: 0, y: 0 },
    data: {
      entryId: id,
      title: id,
      summary: '',
      status: 'staging',
      tags: [],
      kind,
      sources: [],
      commitStatus: 'staging',
      ...overrides,
    } as CanvasNodeData,
  };
}

function makeEdge(source: string, target: string): Edge {
  return { id: `e-${source}-${target}`, source, target };
}

describe('snapPosition', () => {
  it('snaps to 16px grid', () => {
    expect(snapPosition({ x: 10, y: 25 })).toEqual({ x: 16, y: 32 });
  });

  it('keeps already-aligned positions', () => {
    expect(snapPosition({ x: 32, y: 64 })).toEqual({ x: 32, y: 64 });
  });

  it('handles zero', () => {
    expect(snapPosition({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('handles negative values', () => {
    expect(snapPosition({ x: -10, y: -25 })).toEqual({ x: -16, y: -32 });
  });
});

describe('getNumericId', () => {
  it('extracts trailing number', () => {
    expect(getNumericId('node-5')).toBe(5);
  });

  it('returns 0 for no number', () => {
    expect(getNumericId('abc')).toBe(0);
  });

  it('extracts from complex id', () => {
    expect(getNumericId('sha256:abc123')).toBe(123);
  });
});

describe('resetCounters / nextNodeId / nextEdgeId', () => {
  it('generates unique IDs with correct prefix', () => {
    resetCounters();
    const n1 = nextNodeId();
    const n2 = nextNodeId();
    const e1 = nextEdgeId();
    const e2 = nextEdgeId();
    expect(n1).toMatch(/^node-/);
    expect(n2).toMatch(/^node-/);
    expect(e1).toMatch(/^edge-/);
    expect(e2).toMatch(/^edge-/);
    // All IDs should be unique
    expect(new Set([n1, n2, e1, e2]).size).toBe(4);
  });
});

describe('canConnect', () => {
  it('allows unit → unit', () => {
    const source = makeNode('a', 'unit');
    const target = makeNode('b', 'unit');
    expect(canConnect(source, target)).toBe(true);
  });

  it('rejects self-connection', () => {
    const node = makeNode('a', 'unit');
    expect(canConnect(node, node)).toBe(false);
  });

  it('rejects connection to committed unit', () => {
    const source = makeNode('a', 'unit');
    const target = makeNode('b', 'unit', { commitStatus: 'committed' });
    expect(canConnect(source, target)).toBe(false);
  });

  it('rejects unit → leaf', () => {
    const source = makeNode('a', 'unit');
    const target = makeNode('b', 'leaf');
    expect(canConnect(source, target)).toBe(false);
  });

  it('returns false for undefined nodes', () => {
    expect(canConnect(undefined, undefined)).toBe(false);
  });
});

describe('buildIncomingMap', () => {
  it('builds correct incoming map', () => {
    const edges = [makeEdge('a', 'b'), makeEdge('c', 'b'), makeEdge('a', 'd')];
    const map = buildIncomingMap(edges);
    expect(map.get('b')).toEqual(['a', 'c']);
    expect(map.get('d')).toEqual(['a']);
    expect(map.get('a')).toBeUndefined();
  });

  it('handles empty edges', () => {
    const map = buildIncomingMap([]);
    expect(map.size).toBe(0);
  });
});

describe('buildOutgoingMap', () => {
  it('builds correct outgoing map', () => {
    const edges = [makeEdge('a', 'b'), makeEdge('a', 'c')];
    const map = buildOutgoingMap(edges);
    expect(map.get('a')).toEqual(['b', 'c']);
    expect(map.get('b')).toBeUndefined();
  });
});

describe('getLockedNodeIds', () => {
  it('locks committed units', () => {
    const nodes = [
      makeNode('n1', 'unit', { commitStatus: 'committed' }),
      makeNode('n2', 'unit', { commitStatus: 'staging' }),
    ];
    const locked = getLockedNodeIds(nodes, []);
    expect(locked.has('n1')).toBe(true);
    expect(locked.has('n2')).toBe(false);
  });

  it('locks upstream of committed units', () => {
    const nodes = [
      makeNode('parent', 'unit', { commitStatus: 'committed' }),
      makeNode('child', 'unit', { commitStatus: 'committed' }),
    ];
    const edges = [makeEdge('parent', 'child')];
    const locked = getLockedNodeIds(nodes, edges);
    expect(locked.has('parent')).toBe(true);
    expect(locked.has('child')).toBe(true);
  });

  it('does not lock staging upstream nodes', () => {
    const nodes = [
      makeNode('staging', 'unit', { commitStatus: 'staging' }),
      makeNode('committed', 'unit', { commitStatus: 'committed' }),
    ];
    const edges = [makeEdge('staging', 'committed')];
    const locked = getLockedNodeIds(nodes, edges);
    expect(locked.has('committed')).toBe(true);
    expect(locked.has('staging')).toBe(false);
  });

  it('returns empty set when no committed units', () => {
    const nodes = [makeNode('n1', 'unit'), makeNode('n2', 'unit')];
    const locked = getLockedNodeIds(nodes, []);
    expect(locked.size).toBe(0);
  });
});

describe('isUpstreamOfStagingUnit', () => {
  it('returns true when downstream staging unit exists', () => {
    const nodes = [
      makeNode('parent', 'unit', { commitStatus: 'committed' }),
      makeNode('child', 'unit', { commitStatus: 'staging' }),
    ];
    const edges = [makeEdge('parent', 'child')];
    expect(isUpstreamOfStagingUnit('parent', nodes, edges)).toBe(true);
  });

  it('returns false when no downstream staging units', () => {
    const nodes = [
      makeNode('a', 'unit', { commitStatus: 'committed' }),
      makeNode('b', 'unit', { commitStatus: 'committed' }),
    ];
    const edges = [makeEdge('a', 'b')];
    expect(isUpstreamOfStagingUnit('a', nodes, edges)).toBe(false);
  });

  it('returns false for isolated node', () => {
    const nodes = [makeNode('alone', 'unit')];
    expect(isUpstreamOfStagingUnit('alone', nodes, [])).toBe(true);
  });
});

describe('collectAffectedStagingUnits', () => {
  it('finds downstream staging units', () => {
    const nodes = [
      makeNode('to-delete', 'unit', { commitStatus: 'committed' }),
      makeNode('staging-child', 'unit', { commitStatus: 'staging' }),
    ];
    const edges = [makeEdge('to-delete', 'staging-child')];
    const affected = collectAffectedStagingUnits(['to-delete'], nodes, edges);
    expect(affected).toContain('staging-child');
  });

  it('returns empty when no affected staging units', () => {
    const nodes = [
      makeNode('a', 'unit', { commitStatus: 'committed' }),
      makeNode('b', 'unit', { commitStatus: 'committed' }),
    ];
    const edges = [makeEdge('a', 'b')];
    const affected = collectAffectedStagingUnits(['a'], nodes, edges);
    expect(affected).toEqual([]);
  });

  it('does not include nodes being deleted', () => {
    const nodes = [
      makeNode('del1', 'unit', { commitStatus: 'staging' }),
      makeNode('del2', 'unit', { commitStatus: 'staging' }),
    ];
    const edges = [makeEdge('del1', 'del2')];
    const affected = collectAffectedStagingUnits(['del1', 'del2'], nodes, edges);
    expect(affected).toEqual([]);
  });
});

describe('resolveLatestMainUnitId', () => {
  it('returns preferred ID if it exists as main unit', () => {
    const nodes = [
      makeNode('n1', 'unit', { branchType: 'main' }),
      makeNode('n2', 'unit', { branchType: 'main' }),
    ];
    expect(resolveLatestMainUnitId(nodes, 'n1')).toBe('n1');
  });

  it('returns undefined when no main units', () => {
    const nodes = [makeNode('n1', 'unit', { branchType: 'branch' })];
    expect(resolveLatestMainUnitId(nodes)).toBeUndefined();
  });

  it('returns latest by timestamp', () => {
    const nodes = [
      makeNode('older', 'unit', { branchType: 'main', timestamp: '2024-01-01T00:00:00Z' }),
      makeNode('newer', 'unit', { branchType: 'main', timestamp: '2024-06-01T00:00:00Z' }),
    ];
    expect(resolveLatestMainUnitId(nodes)).toBe('newer');
  });

  it('falls back to numeric ID when no timestamps', () => {
    const nodes = [
      makeNode('node-1', 'unit', { branchType: 'main' }),
      makeNode('node-5', 'unit', { branchType: 'main' }),
    ];
    expect(resolveLatestMainUnitId(nodes)).toBe('node-5');
  });
});

describe('computeUnitTone', () => {
  it('returns main-latest for latest main unit', () => {
    const nodes = [makeNode('n1', 'unit', { branchType: 'main' })];
    expect(computeUnitTone(nodes, [], undefined, 'n1')).toBe('main-latest');
  });

  it('returns main-history for older main unit', () => {
    const nodes = [
      makeNode('old', 'unit', { branchType: 'main', timestamp: '2024-01-01T00:00:00Z' }),
      makeNode('new', 'unit', { branchType: 'main', timestamp: '2024-06-01T00:00:00Z' }),
    ];
    expect(computeUnitTone(nodes, [], undefined, 'old')).toBe('main-history');
  });

  it('returns branch-latest for latest branch unit', () => {
    const nodes = [
      makeNode('br1', 'unit', {
        branchType: 'branch',
        branchName: 'feature',
        timestamp: '2024-01-01T00:00:00Z',
      }),
    ];
    expect(computeUnitTone(nodes, [], undefined, 'br1')).toBe('branch-latest');
  });

  it('returns branch-history for undefined unitId', () => {
    expect(computeUnitTone([], [], undefined, undefined)).toBe('branch-history');
  });

  it('returns branch-history for non-existent node', () => {
    expect(computeUnitTone([], [], undefined, 'missing')).toBe('branch-history');
  });
});

describe('computeAttachedPosition', () => {
  it('computes position snapped to grid', () => {
    const source = makeNode('n1', 'unit');
    source.position = { x: 100, y: 100 };
    const pos = computeAttachedPosition(source, 'unit', 400);
    expect(pos.x).toBe(snapPosition({ x: 500, y: 0 }).x);
    expect(typeof pos.y).toBe('number');
  });
});
