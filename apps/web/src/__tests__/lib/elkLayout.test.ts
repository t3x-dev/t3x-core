/**
 * elkLayout Tests
 *
 * Tests the ELK.js graph layout wrapper.
 */

import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { getLayoutedElements } from '@/lib/elkLayout';

// Helper: create minimal Node
const createNode = (id: string, overrides: Partial<Node> = {}): Node => ({
  id,
  type: 'default',
  position: { x: 0, y: 0 },
  data: {},
  ...overrides,
});

// Helper: create minimal Edge
const createEdge = (id: string, source: string, target: string): Edge => ({
  id,
  source,
  target,
});

describe('getLayoutedElements', () => {
  it('returns empty array for empty nodes', async () => {
    const result = await getLayoutedElements([], []);
    expect(result).toEqual([]);
  });

  it('returns nodes with positions for single node', async () => {
    const nodes = [createNode('a')];
    const result = await getLayoutedElements(nodes, []);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
    expect(typeof result[0].position.x).toBe('number');
    expect(typeof result[0].position.y).toBe('number');
  });

  it('positions connected nodes', async () => {
    const nodes = [createNode('a'), createNode('b')];
    const edges = [createEdge('e1', 'a', 'b')];
    const result = await getLayoutedElements(nodes, edges);

    expect(result).toHaveLength(2);
    // Both nodes should have defined positions
    const nodeA = result.find((n) => n.id === 'a')!;
    const nodeB = result.find((n) => n.id === 'b')!;
    expect(nodeA.position).toBeDefined();
    expect(nodeB.position).toBeDefined();
  });

  it('respects DOWN direction (default) — child is below parent', async () => {
    const nodes = [createNode('parent'), createNode('child')];
    const edges = [createEdge('e1', 'parent', 'child')];
    const result = await getLayoutedElements(nodes, edges, { direction: 'DOWN' });

    const parent = result.find((n) => n.id === 'parent')!;
    const child = result.find((n) => n.id === 'child')!;
    expect(child.position.y).toBeGreaterThan(parent.position.y);
  });

  it('respects RIGHT direction — child is right of parent', async () => {
    const nodes = [createNode('parent'), createNode('child')];
    const edges = [createEdge('e1', 'parent', 'child')];
    const result = await getLayoutedElements(nodes, edges, { direction: 'RIGHT' });

    const parent = result.find((n) => n.id === 'parent')!;
    const child = result.find((n) => n.id === 'child')!;
    expect(child.position.x).toBeGreaterThan(parent.position.x);
  });

  it('uses measured dimensions when available', async () => {
    const nodes = [createNode('a', { measured: { width: 400, height: 300 } }), createNode('b')];
    const edges = [createEdge('e1', 'a', 'b')];
    const result = await getLayoutedElements(nodes, edges);

    // Should succeed without errors (measured dimensions passed to ELK)
    expect(result).toHaveLength(2);
  });

  it('handles DAG with multiple edges', async () => {
    // Diamond: a -> b, a -> c, b -> d, c -> d
    const nodes = [createNode('a'), createNode('b'), createNode('c'), createNode('d')];
    const edges = [
      createEdge('e1', 'a', 'b'),
      createEdge('e2', 'a', 'c'),
      createEdge('e3', 'b', 'd'),
      createEdge('e4', 'c', 'd'),
    ];
    const result = await getLayoutedElements(nodes, edges);

    expect(result).toHaveLength(4);
    // All nodes should have defined positions
    for (const node of result) {
      expect(typeof node.position.x).toBe('number');
      expect(typeof node.position.y).toBe('number');
    }
  });

  it('preserves original node data', async () => {
    const nodes = [createNode('a', { data: { label: 'Hello', custom: true } })];
    const result = await getLayoutedElements(nodes, []);

    expect(result[0].data.label).toBe('Hello');
    expect(result[0].data.custom).toBe(true);
  });
});
