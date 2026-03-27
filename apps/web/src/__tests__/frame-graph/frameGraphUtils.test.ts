// @ts-nocheck — tree-primary migration: test needs rework
import type { TreeNode, Relation, SemanticContent } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import {
  filterByZoomLevel,
  RELATION_STYLES,
  semanticToFlowElements,
} from '../../components/frame-graph/frameGraphUtils';

// ── Fixtures ──

const mkFrame = (id: string, type: string, extra?: Partial<Frame>): TreeNode => ({
  id,
  type,
  slots: { agent: 'Alice' },
  ...extra,
});

const mkRel = (from: string, to: string, type: Relation['type']): Relation => ({ from, to, type });

/**
 * Graph topology used in zoom-level tests:
 *
 *   f1 --causes--> f2 --follows--> f3
 *                   |
 *               elaborates
 *                   |
 *                   v
 *                  f4 --causes--> f5
 *                   |
 *               elaborates
 *                   v
 *                  f6
 *
 * Trunk nodes (overview): f1, f2, f3, f4, f5
 *   - f4 has elaborates incoming but also causes outgoing → stays
 *   - f6 has ONLY elaborates incoming and no outgoing non-elaborates → hidden
 */
const zoomContent: SemanticContent = {
  frames: [
    mkFrame('f1', 'action'),
    mkFrame('f2', 'action'),
    mkFrame('f3', 'result'),
    mkFrame('f4', 'detail'),
    mkFrame('f5', 'outcome'),
    mkFrame('f6', 'sub_detail'),
  ],
  relations: [
    mkRel('f1', 'f2', 'causes'),
    mkRel('f2', 'f3', 'follows'),
    mkRel('f2', 'f4', 'elaborates'),
    mkRel('f4', 'f5', 'causes'),
    mkRel('f4', 'f6', 'elaborates'),
  ],
};

// ── semanticToFlowElements ──

describe('semanticToFlowElements', () => {
  it('converts frames to nodes with correct shape', () => {
    const content: SemanticContent = {
      frames: [
        mkFrame('f1', 'preference', {
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
    expect(n.id).toBe('f1');
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
      frames: [mkFrame('f1', 'a'), mkFrame('f2', 'b')],
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
      frames: [],
      relations: [],
    });
    expect(nodes).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });
});

// ── filterByZoomLevel ──

describe('filterByZoomLevel', () => {
  it("level 'full' returns all frames and relations", () => {
    const result = filterByZoomLevel(zoomContent, 'full');
    expect(result.frames).toHaveLength(6);
    expect(result.relations).toHaveLength(5);
  });

  it("level 'overview' hides elaborates-only children", () => {
    const result = filterByZoomLevel(zoomContent, 'overview');
    const ids = result.frames.map((f) => f.id);
    // f6 should be hidden: only incoming is elaborates, no outgoing non-elaborates
    expect(ids).toContain('f1');
    expect(ids).toContain('f2');
    expect(ids).toContain('f3');
    expect(ids).toContain('f4'); // has causes outgoing
    expect(ids).toContain('f5');
    expect(ids).not.toContain('f6');
    // relations referencing f6 should be removed
    for (const rel of result.relations) {
      expect(rel.from).not.toBe('f6');
      expect(rel.to).not.toBe('f6');
    }
  });

  it("level 'overview' keeps frame with elaborates incoming but non-elaborates outgoing", () => {
    const result = filterByZoomLevel(zoomContent, 'overview');
    const ids = result.frames.map((f) => f.id);
    // f4 has elaborates incoming from f2 but causes outgoing to f5 → trunk
    expect(ids).toContain('f4');
  });

  it("level 'expand' with expandedNodeId shows elaborates children of that node", () => {
    // Expand f2 → should show f4 (elaborates child of f2) but still hide f6
    const result = filterByZoomLevel(zoomContent, 'expand', 'f2');
    const ids = result.frames.map((f) => f.id);
    expect(ids).toContain('f4'); // elaborates child of f2, also trunk
    // f6 is elaborates child of f4, not f2, so hidden unless f4 is expanded
    expect(ids).not.toContain('f6');
  });

  it("level 'expand' with expandedNodeId reveals hidden elaborates-only children", () => {
    // Expand f4 → should reveal f6 (elaborates child of f4)
    const result = filterByZoomLevel(zoomContent, 'expand', 'f4');
    const ids = result.frames.map((f) => f.id);
    expect(ids).toContain('f6');
  });

  it("level 'expand' without expandedNodeId falls back to overview", () => {
    const result = filterByZoomLevel(zoomContent, 'expand');
    const overviewResult = filterByZoomLevel(zoomContent, 'overview');
    expect(result.frames.map((f) => f.id).sort()).toEqual(
      overviewResult.frames.map((f) => f.id).sort()
    );
  });
});

// ── RELATION_STYLES ──

describe('RELATION_STYLES', () => {
  it('has entries for all 6 relation types', () => {
    const types = [
      'causes',
      'conditions',
      'contrasts',
      'elaborates',
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
