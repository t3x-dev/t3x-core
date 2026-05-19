// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CanvasWorkspace from '@/components/canvas/CanvasWorkspace';
import { useCanvasStore } from '@/store/canvasStore';
import type { CanvasNodeData } from '@/types/nodes';

const flowMocks = vi.hoisted(() => ({
  fitView: vi.fn(),
  getEdges: vi.fn(),
  getNodes: vi.fn(),
  screenToFlowPosition: vi.fn(),
  setCenter: vi.fn(),
  setNodes: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  zoomTo: vi.fn(),
}));

const layoutMocks = vi.hoisted(() => ({
  getLayoutedElements: vi.fn(),
  saveNodePosition: vi.fn(),
}));

vi.mock('@xyflow/react', async () => {
  const React = await import('react');
  const passthrough = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children);

  return {
    Background: () => React.createElement('div', { 'data-testid': 'flow-background' }),
    BackgroundVariant: { Dots: 'dots' },
    BaseEdge: () => React.createElement('path'),
    Handle: () => React.createElement('span'),
    MiniMap: () => React.createElement('div', { 'data-testid': 'flow-minimap' }),
    Panel: passthrough,
    Position: { Left: 'left', Right: 'right' },
    ReactFlow: passthrough,
    ReactFlowProvider: passthrough,
    getSmoothStepPath: () => ['M0 0'],
    useReactFlow: () => ({
      fitView: flowMocks.fitView,
      getEdges: flowMocks.getEdges,
      getNodes: flowMocks.getNodes,
      screenToFlowPosition: flowMocks.screenToFlowPosition,
      setCenter: flowMocks.setCenter,
      setNodes: flowMocks.setNodes,
      zoomIn: flowMocks.zoomIn,
      zoomOut: flowMocks.zoomOut,
      zoomTo: flowMocks.zoomTo,
    }),
    useStore: (
      selector: (state: { maxZoom: number; minZoom: number; transform: number[] }) => unknown
    ) => selector({ maxZoom: 2, minZoom: 0.25, transform: [0, 0, 1] }),
    useViewport: () => ({ zoom: 1 }),
  };
});

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ projectId: 'proj_test' }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/components/canvas/CanvasShortcutsContent', async () => {
  const React = await import('react');
  return {
    CanvasShortcutsDialog: () => React.createElement('div', { 'data-testid': 'shortcuts-dialog' }),
  };
});

vi.mock('@/components/canvas/CanvasStatusBar', async () => {
  const React = await import('react');
  return {
    CanvasStatusBar: () => React.createElement('div', { 'data-testid': 'canvas-status-bar' }),
  };
});

vi.mock('@/components/canvas/DeletionConfirmDialog', async () => {
  const React = await import('react');
  return {
    DeletionConfirmDialog: () =>
      React.createElement('div', { 'data-testid': 'deletion-confirm-dialog' }),
  };
});

vi.mock('@/components/canvas/LeafPanel', async () => {
  const React = await import('react');
  return {
    LeafPanel: () => React.createElement('div', { 'data-testid': 'leaf-panel' }),
  };
});

vi.mock('@/components/canvas/NodeModal', async () => {
  const React = await import('react');
  return {
    NodeModal: () => React.createElement('div', { 'data-testid': 'node-modal' }),
  };
});

vi.mock('@/components/draft/DraftQuickSheet', async () => {
  const React = await import('react');
  return {
    DraftQuickSheet: () => React.createElement('div', { 'data-testid': 'draft-quick-sheet' }),
  };
});

vi.mock('@/components/import/ImportDialog', async () => {
  const React = await import('react');
  return {
    ImportDialog: () => React.createElement('div', { 'data-testid': 'import-dialog' }),
  };
});

vi.mock('@/components/memory/MemoryContextModal', async () => {
  const React = await import('react');
  return {
    MemoryContextModal: () => React.createElement('div', { 'data-testid': 'memory-modal' }),
  };
});

vi.mock('@/components/merge/MergePanel', async () => {
  const React = await import('react');
  return {
    MergePanel: () => React.createElement('div', { 'data-testid': 'merge-panel' }),
  };
});

vi.mock('@/components/ui/zoom-slider', async () => {
  const React = await import('react');
  return {
    ZoomSlider: () => React.createElement('div', { 'data-testid': 'zoom-slider' }),
  };
});

vi.mock('@/components/canvas/elkLayout', () => ({
  getLayoutedElements: layoutMocks.getLayoutedElements,
}));

vi.mock('@/hooks/canvas/useCanvasCommitActions', () => ({
  useCanvasCommitActions: () => ({
    addConversationFromCommit: vi.fn(),
    startMerge: vi.fn(),
  }),
}));

vi.mock('@/hooks/canvas/useCanvasLeafActions', () => ({
  useCanvasLeafActions: () => ({
    remove: vi.fn(),
  }),
}));

vi.mock('@/hooks/canvas/useCanvasNodeActions', () => ({
  useCanvasNodeActions: () => ({
    add: vi.fn(),
    load: vi.fn(),
  }),
}));

vi.mock('@/hooks/canvas/useCanvasPositionPersist', () => ({
  useCanvasPositionPersist: () => undefined,
}));

vi.mock('@/hooks/conversations/useConversationContext', () => ({
  useConversationContext: () => ({ contextConfig: null }),
}));

vi.mock('@/hooks/shared/useChatCompactViewport', () => ({
  useCompactViewport: () => false,
}));

vi.mock('@/hooks/shared/useNodePositionSaver', () => ({
  useNodePositionSaver: () => ({ save: layoutMocks.saveNodePosition }),
}));

vi.mock('@/hooks/shared/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

vi.mock('@/hooks/shared/useTerminology', () => ({
  useTerminology: () => ({
    isDeveloperMode: false,
    t: (key: string) => key,
  }),
}));

function unitNode(id: string): Node<CanvasNodeData> {
  return {
    id,
    type: 'unit',
    position: { x: 0, y: 0 },
    data: {
      entryId: id,
      kind: 'unit',
      status: 'active',
      title: 'Unit',
      summary: 'Summary',
      timestamp: 'now',
      commitStatus: 'committed',
      branchType: 'main',
    },
  };
}

describe('CanvasWorkspace initial fit view', () => {
  const requestAnimationFrame = globalThis.requestAnimationFrame;
  const ResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.ResizeObserver = class {
      disconnect() {}
      observe() {}
      unobserve() {}
    };
    globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
      act(() => {
        callback(0);
      });
      return 0;
    };

    const nodes = [unitNode('node_1')];
    useCanvasStore.setState({
      edges: [],
      hasDbPositions: false,
      hasMainCommit: true,
      initialLoadingComplete: true,
      loading: false,
      nodes,
      projectId: 'proj_test',
    } as Partial<ReturnType<typeof useCanvasStore.getState>>);

    flowMocks.getNodes.mockImplementation(() => useCanvasStore.getState().nodes);
    flowMocks.getEdges.mockImplementation(() => useCanvasStore.getState().edges);
    flowMocks.setNodes.mockImplementation((nextNodes: Node<CanvasNodeData>[]) => {
      act(() => {
        useCanvasStore.setState({ nodes: nextNodes });
      });
    });
  });

  afterEach(() => {
    cleanup();
    globalThis.requestAnimationFrame = requestAnimationFrame;
    globalThis.ResizeObserver = ResizeObserver;
    useCanvasStore.setState({
      edges: [],
      hasDbPositions: false,
      loading: false,
      nodes: [],
      projectId: null,
    });
  });

  it('caps the initial auto-fit at 100% zoom after ELK layout', async () => {
    let resolveLayout: ((nodes: Node<CanvasNodeData>[]) => void) | undefined;
    layoutMocks.getLayoutedElements.mockReturnValue(
      new Promise<Node<CanvasNodeData>[]>((resolve) => {
        resolveLayout = (inputNodes) => {
          resolve(
            inputNodes.map((node, index) => ({
              ...node,
              position: { x: index * 240, y: 0 },
            }))
          );
        };
      })
    );

    render(<CanvasWorkspace projectName="Trust Gate" />);

    await waitFor(() => {
      expect(layoutMocks.getLayoutedElements).toHaveBeenCalled();
    });

    await act(async () => {
      resolveLayout?.(useCanvasStore.getState().nodes);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(flowMocks.fitView).toHaveBeenCalledWith({
        duration: 300,
        maxZoom: 1,
        padding: 0.3,
      });
    });
  });
});
