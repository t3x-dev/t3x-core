// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { usePathHighlight } from '@/hooks/shared/usePathHighlight';
import type { CanvasNodeData } from '@/types/nodes';

function unitNode(
  id: string,
  branchType: 'main' | 'branch',
  branchName?: string
): Node<CanvasNodeData> {
  return {
    data: {
      branchName,
      branchType,
      commitStatus: 'committed',
      kind: 'unit',
      title: id,
    },
    id,
    position: { x: 0, y: 0 },
    type: 'unit',
  } as Node<CanvasNodeData>;
}

function edge(id: string, source: string, target: string): Edge {
  return {
    data: { edgeType: 'evolve' },
    id,
    source,
    target,
    type: 'animated',
  };
}

describe('usePathHighlight edge rhythm', () => {
  it('marks selected node paths and dimmed branches with semantic edge data only', () => {
    const { result } = renderHook(() =>
      usePathHighlight({
        edges: [edge('main-path', 'main-1', 'main-2'), edge('branch-path', 'branch-1', 'branch-2')],
        nodes: [
          unitNode('main-1', 'main'),
          unitNode('main-2', 'main'),
          unitNode('branch-1', 'branch', 'feature'),
          unitNode('branch-2', 'branch', 'feature'),
        ],
      })
    );

    act(() => result.current.setHighlight({ mode: 'node', nodeId: 'main-1' }));

    const selected = result.current.edgesForRender.find((item) => item.id === 'main-path');
    const dimmed = result.current.edgesForRender.find((item) => item.id === 'branch-path');

    expect(selected?.data).toMatchObject({
      edgePathTone: 'commit',
      edgeRhythm: 'selected',
    });
    expect(dimmed?.data).toMatchObject({
      edgePathTone: 'commit',
      edgeRhythm: 'dimmed',
    });
    expect(selected?.style?.stroke).toBeUndefined();
    expect(dimmed?.style?.opacity).toBeUndefined();
  });

  it('marks active branch paths with branch tone', () => {
    const { result } = renderHook(() =>
      usePathHighlight({
        edges: [edge('main-path', 'main-1', 'main-2'), edge('branch-path', 'branch-1', 'branch-2')],
        nodes: [
          unitNode('main-1', 'main'),
          unitNode('main-2', 'main'),
          unitNode('branch-1', 'branch', 'feature'),
          unitNode('branch-2', 'branch', 'feature'),
        ],
      })
    );

    act(() => result.current.setHighlight({ branch: 'feature', mode: 'branch' }));

    const selected = result.current.edgesForRender.find((item) => item.id === 'branch-path');
    const dimmed = result.current.edgesForRender.find((item) => item.id === 'main-path');

    expect(selected?.data).toMatchObject({
      edgePathTone: 'branch',
      edgeRhythm: 'selected',
    });
    expect(dimmed?.data).toMatchObject({
      edgePathTone: 'branch',
      edgeRhythm: 'dimmed',
    });
  });
});
