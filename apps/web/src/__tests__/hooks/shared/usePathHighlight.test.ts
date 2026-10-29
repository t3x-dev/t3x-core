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
  it('highlights every ancestor edge while keeping descendants dimmed', () => {
    const { result } = renderHook(() =>
      usePathHighlight({
        edges: [
          edge('root-to-parent', 'root', 'parent'),
          edge('parent-to-selected', 'parent', 'selected'),
          edge('selected-to-future', 'selected', 'future'),
          edge('unrelated', 'other-1', 'other-2'),
        ],
        nodes: [
          unitNode('root', 'main'),
          unitNode('parent', 'main'),
          unitNode('selected', 'main'),
          unitNode('future', 'main'),
          unitNode('other-1', 'branch', 'other'),
          unitNode('other-2', 'branch', 'other'),
        ],
      })
    );

    act(() => result.current.setHighlight({ mode: 'node', nodeId: 'selected' }));

    for (const id of ['root-to-parent', 'parent-to-selected']) {
      expect(result.current.edgesForRender.find((item) => item.id === id)?.data).toMatchObject({
        edgePathTone: 'commit',
        edgeRhythm: 'selected',
      });
    }
    for (const id of ['selected-to-future', 'unrelated']) {
      expect(result.current.edgesForRender.find((item) => item.id === id)?.data).toMatchObject({
        edgePathTone: 'commit',
        edgeRhythm: 'dimmed',
      });
    }
    expect(result.current.nodesForRender.find((node) => node.id === 'root')?.data.dimmed).toBe(
      false
    );
    expect(result.current.nodesForRender.find((node) => node.id === 'future')?.data.dimmed).toBe(
      true
    );
  });

  it('traces every parent of a merge commit but not its future child', () => {
    const { result } = renderHook(() =>
      usePathHighlight({
        edges: [
          edge('root-main', 'root', 'main-parent'),
          edge('root-dev', 'root', 'dev-parent'),
          edge('main-merge', 'main-parent', 'merge'),
          edge('dev-merge', 'dev-parent', 'merge'),
          edge('merge-future', 'merge', 'future'),
        ],
        nodes: [
          unitNode('root', 'main'),
          unitNode('main-parent', 'main'),
          unitNode('dev-parent', 'branch', 'dev'),
          unitNode('merge', 'main'),
          unitNode('future', 'main'),
        ],
      })
    );

    act(() => result.current.setHighlight({ mode: 'node', nodeId: 'merge' }));

    for (const id of ['root-main', 'root-dev', 'main-merge', 'dev-merge']) {
      expect(result.current.edgesForRender.find((item) => item.id === id)?.data).toMatchObject({
        edgeRhythm: 'selected',
      });
    }
    expect(
      result.current.edgesForRender.find((item) => item.id === 'merge-future')?.data
    ).toMatchObject({ edgeRhythm: 'dimmed' });
  });

  it('traces a pending node through its branch head and ancestors', () => {
    const pending = unitNode('pending', 'branch', 'dev');
    pending.data.commitStatus = 'staging';
    const { result } = renderHook(() =>
      usePathHighlight({
        edges: [edge('root-head', 'root', 'head'), edge('head-pending', 'head', 'pending')],
        nodes: [unitNode('root', 'main'), unitNode('head', 'branch', 'dev'), pending],
      })
    );

    act(() => result.current.setHighlight({ mode: 'node', nodeId: 'pending' }));

    expect(result.current.edgesForRender.map((item) => item.data?.edgeRhythm)).toEqual([
      'selected',
      'selected',
    ]);
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
