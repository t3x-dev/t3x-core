import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { buildStateCanvasSvg } from '@/domain/canvas/stateCanvasExport';
import type { CanvasNodeData } from '@/types/nodes';

function node(id: string, x: number, branchType: 'main' | 'branch'): Node<CanvasNodeData> {
  return {
    data: {
      branchName: branchType === 'branch' ? 'feature-x' : undefined,
      branchType,
      commitHash: `sha256:${id}`,
      commitStatus: 'committed',
      entryId: id,
      kind: 'unit',
      status: 'committed',
      summary: 'Summary',
      tags: [],
      timestamp: 'now',
      title: id,
    },
    height: 168,
    id,
    position: { x, y: 20 },
    type: 'unit',
    width: 288,
  };
}

describe('buildStateCanvasSvg', () => {
  it('exports the filtered free-layout graph with a dotted grid and directional edges', () => {
    const nodes = [node('parent', 0, 'main'), node('child', 420, 'branch')];
    const edges: Edge[] = [
      { data: { edgeType: 'merge' }, id: 'e1', source: 'parent', target: 'child' },
    ];

    const svg = buildStateCanvasSvg(nodes, edges);

    expect(svg).toContain('<pattern id="grid"');
    expect(svg).toContain('marker-end="url(#arrow-branch)"');
    expect(svg).toContain('stroke-dasharray="8 5"');
    expect(svg).toContain('feature-x');
    expect(svg).not.toContain('swimlane');
  });

  it('exports a valid empty SVG when the filter has no visible nodes', () => {
    expect(buildStateCanvasSvg([], [])).toContain('viewBox="0 0 640 360"');
  });
});
