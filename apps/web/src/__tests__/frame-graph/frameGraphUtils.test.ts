import type { TreeNode, Relation, SemanticContent } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import {
  filterByZoomLevel,
  RELATION_STYLES,
  semanticToFlowElements,
} from '../../components/frame-graph/frameGraphUtils';

// ── Fixtures ──

const mkNode = (key: string, extra?: Partial<TreeNode>): TreeNode => ({
  key,
  slots: { agent: 'Alice' },
  children: [],
  ...extra,
});

const mkRel = (from: string, to: string, type: Relation['type']): Relation => ({ from, to, type });

/**
 * Graph topology used in zoom-level tests:
 *
 * Tree-primary: top-level nodes are trunk, children are hidden in overview.
 *
 *   f1 --causes--> f2 --follows--> f3
 *                   |
 *               depends
 *                   |
 *                   v
 *                  f4 --causes--> f5
 *                   |
 *               depends
 *                   v
 *                  f6
 *
 * Top-level trees: f1, f2, f3, f4, f5
 *   - f6 is a child of f4, hidden in overview
 */
const zoomContent: SemanticContent = {
  trees: [
    mkNode('f1', { children: [] }),
    mkNode('f2', { children: [] }),
    mkNode('f3', { children: [] }),
    mkNode('f4', {
      children: [mkNode('f6')],
    }),
    mkNode('f5', { children: [] }),
  ],
  relations: [
    mkRel('f1', 'f2', 'causes'),
    mkRel('f2', 'f3', 'follows'),
    mkRel('f2', 'f4', 'depends'),
    mkRel('f4', 'f5', 'causes'),
    mkRel('f4', 'f6', 'depends'),
  ],
};

// ── semanticToFlowElements ──

describe('semanticToFlowElements', () => {
  it('converts trees to nodes with correct shape', () => {
    const content: SemanticContent = {
      trees: [
        mkNode('preference', {
          slots: { item: 'coffee' },
          source: 'turn_abc',
          confidence: 0.9,
        }),
      ],
      relations: [],
    };
    const { nodes } = semanticToFlowElements(content);
    expect(nodes).toHaveLength(1);
    const n = nodes[0];
    expect(n.id).toBe('preference');
    expect(n.type).toBe('frameNode');
    expect(n.position).toEqual({ x: 0, y: 0 });
    expect(n.data).toEqual({
      frameType: 'preference',
      slots: { item: 'coffee' },
      source: 'turn_abc',
      confidence: 0.9,
    });
  });

  it('converts relations to edges with correct shape', () => {
    const content: SemanticContent = {
      trees: [mkNode('f1'), mkNode('f2')],
      relations: [mkRel('f1', 'f2', 'causes')],
    };
    const { edges } = semanticToFlowElements(content);
    expect(edges).toHaveLength(1);
    const e = edges[0];
    expect(e.id).toBe('f1-f2-causes');
    expect(e.source).toBe('f1');
    expect(e.target).toBe('f2');
    expect(e.type).toBe('relationEdge');
    expect(e.data).toEqual({ relationType: 'causes' });
  });

  it('handles empty content', () => {
    const { nodes, edges } = semanticToFlowElements({
      trees: [],
      relations: [],
    });
    expect(nodes).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });
});

// ── filterByZoomLevel ──

describe('filterByZoomLevel', () => {
  it("level 'full' returns all trees and relations", () => {
    const result = filterByZoomLevel(zoomContent, 'full');
    expect(result.trees).toHaveLength(5);
    expect(result.relations).toHaveLength(5);
  });

  it("level 'overview' shows only top-level trees", () => {
    const result = filterByZoomLevel(zoomContent, 'overview');
    const keys = result.trees.map((t: TreeNode) => t.key);
    // Top-level trees only
    expect(keys).toContain('f1');
    expect(keys).toContain('f2');
    expect(keys).toContain('f3');
    expect(keys).toContain('f4');
    expect(keys).toContain('f5');
  });

  it("level 'overview' filters relations to only visible nodes", () => {
    const result = filterByZoomLevel(zoomContent, 'overview');
    // f6 is a child, so relations to/from f6 should be filtered
    for (const rel of result.relations) {
      expect(rel.from).not.toBe('f6');
      expect(rel.to).not.toBe('f6');
    }
  });

  it("level 'expand' with expandedNodeId shows children of that node", () => {
    // Expand f4 → should show f6 (child of f4)
    const result = filterByZoomLevel(zoomContent, 'expand', 'f4');
    const keys = result.trees.flatMap((t: TreeNode) => {
      const childKeys = t.children.map((c: TreeNode) => c.key);
      return [t.key, ...childKeys];
    });
    expect(keys).toContain('f6');
  });

  it("level 'expand' without expandedNodeId falls back to overview", () => {
    const result = filterByZoomLevel(zoomContent, 'expand');
    const overviewResult = filterByZoomLevel(zoomContent, 'overview');
    expect(result.trees.map((t: TreeNode) => t.key).sort()).toEqual(
      overviewResult.trees.map((t: TreeNode) => t.key).sort()
    );
  });
});

// ── RELATION_STYLES ──

describe('RELATION_STYLES', () => {
  it('has entries for all 5 relation types', () => {
    const types = [
      'causes',
      'conditions',
      'contrasts',
      'follows',
      'depends',
    ] as const;
    for (const t of types) {
      expect(RELATION_STYLES[t]).toBeDefined();
      expect(RELATION_STYLES[t].color).toBeTruthy();
      expect(RELATION_STYLES[t].label).toBe(t);
    }
  });

  it('dashed styles have strokeDasharray', () => {
    expect(RELATION_STYLES.conditions.strokeDasharray).toBe('8 4');
    expect(RELATION_STYLES.depends.strokeDasharray).toBe('4 4');
  });
});
