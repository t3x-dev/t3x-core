// @vitest-environment jsdom

import { fireEvent, renderHook } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';
import { useCanvasKeyboardShortcuts } from '@/components/canvas/CanvasKeyboardShortcuts';
import type { CanvasNodeData, CommitStatus } from '@/types/nodes';

function selectedNode(commitStatus: CommitStatus): Node<CanvasNodeData> {
  return {
    id: `${commitStatus}_node`,
    selected: true,
    position: { x: 0, y: 0 },
    data: {
      commitStatus,
      entryId: `${commitStatus}_node`,
      kind: 'unit',
      status: 'active',
      summary: 'Version',
      tags: [],
      timestamp: '2026-08-03T00:00:00Z',
      title: 'Version',
    },
  };
}

function renderShortcuts(node: Node<CanvasNodeData>) {
  const openNodeModal = vi.fn();
  renderHook(() =>
    useCanvasKeyboardShortcuts({
      deselectAllNodes: vi.fn(),
      getNodes: () => [node],
      navigateToNode: vi.fn(),
      openNodeId: null,
      openNodeModal,
      selectAllNodes: vi.fn(),
      setIsPanMode: vi.fn(),
      setNodes: vi.fn(),
      setShowShortcuts: vi.fn(),
      showShortcuts: false,
    })
  );
  return openNodeModal;
}

describe('useCanvasKeyboardShortcuts', () => {
  it('does not open the removed commit-mode modal for a committed node', () => {
    const openNodeModal = renderShortcuts(selectedNode('committed'));

    fireEvent.keyDown(window, { key: 'Enter' });

    expect(openNodeModal).not.toHaveBeenCalled();
  });

  it('keeps Enter available for a staging node workflow', () => {
    const openNodeModal = renderShortcuts(selectedNode('staging'));

    fireEvent.keyDown(window, { key: 'Enter' });

    expect(openNodeModal).toHaveBeenCalledWith('staging_node', 'commit');
  });
});
