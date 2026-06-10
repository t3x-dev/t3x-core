// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CanvasWorkspace from '@/components/canvas/CanvasWorkspace';
import { useCanvasStore } from '@/store/canvasStore';
import type { CanvasNodeData } from '@/types/nodes';

const flowMocks = vi.hoisted(() => ({
  fitView: vi.fn(),
  getEdges: vi.fn(),
  getNodes: vi.fn(),
  reactFlowProps: undefined as
    | {
        onNodeClick?: (...args: unknown[]) => void;
        onNodeDragStart?: (...args: unknown[]) => void;
        onNodeDragStop?: (...args: unknown[]) => void;
      }
    | undefined,
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

const navigationMocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
}));

const viewportMocks = vi.hoisted(() => ({
  selectionPanelVisible: false,
}));

vi.mock('@xyflow/react', async () => {
  const React = await import('react');
  const passthrough = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children);

  return {
    Background: (props: { gap?: number; size?: number; variant?: string }) =>
      React.createElement('div', {
        'data-gap': props.gap,
        'data-testid': 'flow-background',
        'data-variant': props.variant,
      }),
    BackgroundVariant: { Dots: 'dots', Lines: 'lines' },
    BaseEdge: () => React.createElement('path'),
    Handle: () => React.createElement('span'),
    MiniMap: () => React.createElement('div', { 'data-testid': 'flow-minimap' }),
    Panel: passthrough,
    Position: { Left: 'left', Right: 'right' },
    ReactFlow: (props: {
      children?: React.ReactNode;
      onNodeClick?: (...args: unknown[]) => void;
      onNodeDragStart?: (...args: unknown[]) => void;
      onNodeDragStop?: (...args: unknown[]) => void;
    }) => {
      flowMocks.reactFlowProps = props;
      return React.createElement('div', { 'data-testid': 'react-flow' }, props.children);
    },
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
  usePathname: () => '/chat/project/proj_test/canvas',
  useRouter: () => ({ push: navigationMocks.routerPush }),
  useSearchParams: () => new URLSearchParams(),
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
  useCompactViewport: (query?: string) =>
    query === '(min-width: 1280px)' ? viewportMocks.selectionPanelVisible : false,
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
    flowMocks.reactFlowProps = undefined;
    viewportMocks.selectionPanelVisible = false;
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
    vi.useRealTimers();
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

  it('renders a line-grid canvas background instead of a decorative radial wash', () => {
    layoutMocks.getLayoutedElements.mockResolvedValue(useCanvasStore.getState().nodes);

    render(<CanvasWorkspace projectName="Trust Gate" />);

    expect(screen.getByTestId('flow-background')).toHaveAttribute('data-variant', 'lines');
    expect(screen.getByTestId('flow-background')).toHaveAttribute('data-gap', '32');
    const style = screen
      .getByRole('tree', { name: /knowledge graph canvas/i })
      .getAttribute('style');
    expect(style).toContain('--surface-canvas');
  });

  it('lays out committed version paths from left to right even when DB positions exist', async () => {
    const nodes = [
      {
        ...unitNode('sha256:parent'),
        data: { ...unitNode('sha256:parent').data, commitHash: 'sha256:parent' },
      },
      {
        ...unitNode('sha256:child'),
        data: { ...unitNode('sha256:child').data, commitHash: 'sha256:child' },
      },
    ];
    useCanvasStore.setState({
      edges: [{ id: 'e1', source: 'sha256:parent', target: 'sha256:child' }],
      hasDbPositions: true,
      nodes,
    } as Partial<ReturnType<typeof useCanvasStore.getState>>);
    flowMocks.getNodes.mockImplementation(() => useCanvasStore.getState().nodes);
    flowMocks.getEdges.mockImplementation(() => useCanvasStore.getState().edges);
    layoutMocks.getLayoutedElements.mockResolvedValue(nodes);

    render(<CanvasWorkspace projectName="Trust Gate" />);

    await waitFor(() => {
      expect(layoutMocks.getLayoutedElements).toHaveBeenCalledWith(
        nodes,
        useCanvasStore.getState().edges,
        expect.objectContaining({ direction: 'RIGHT' })
      );
    });
  });

  it('reanchors an open commit action panel after dragging the selected node', async () => {
    layoutMocks.getLayoutedElements.mockResolvedValue(useCanvasStore.getState().nodes);
    render(<CanvasWorkspace projectName="Trust Gate" />);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    const node = useCanvasStore.getState().nodes[0];
    const clickTarget = document.createElement('div');
    clickTarget.className = 'react-flow__node';
    clickTarget.getBoundingClientRect = () =>
      ({
        bottom: 300,
        height: 160,
        left: 100,
        right: 300,
        top: 140,
        width: 200,
        x: 100,
        y: 140,
        toJSON: () => ({}),
      }) as DOMRect;

    act(() => {
      flowMocks.reactFlowProps?.onNodeClick?.(
        { clientX: 200, clientY: 300, target: clickTarget },
        node
      );
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(260);
    });
    expect(screen.getByRole('button', { name: /New Leaf/i })).toBeInTheDocument();

    const firstPanel = screen.getByRole('button', { name: /New Leaf/i }).parentElement;
    expect(firstPanel).toHaveStyle({ left: '200px', top: '308px' });

    act(() => {
      flowMocks.reactFlowProps?.onNodeDragStart?.({ target: clickTarget }, node);
    });
    expect(screen.queryByRole('button', { name: /New Leaf/i })).not.toBeInTheDocument();

    const dropTarget = document.createElement('div');
    dropTarget.className = 'react-flow__node';
    dropTarget.getBoundingClientRect = () =>
      ({
        bottom: 460,
        height: 160,
        left: 360,
        right: 560,
        top: 300,
        width: 200,
        x: 360,
        y: 300,
        toJSON: () => ({}),
      }) as DOMRect;

    act(() => {
      flowMocks.reactFlowProps?.onNodeDragStop?.(
        { clientX: 460, clientY: 460, target: dropTarget },
        node
      );
    });

    const reanchoredPanel = screen.getByRole('button', { name: /New Leaf/i }).parentElement;
    expect(reanchoredPanel).toHaveStyle({ left: '460px', top: '468px' });
  });

  it('uses the selection panel actions instead of a floating panel on xl viewports', () => {
    viewportMocks.selectionPanelVisible = true;
    layoutMocks.getLayoutedElements.mockResolvedValue(useCanvasStore.getState().nodes);
    render(<CanvasWorkspace projectName="Trust Gate" />);

    const node = useCanvasStore.getState().nodes[0];
    const clickTarget = document.createElement('div');
    clickTarget.className = 'react-flow__node';
    clickTarget.getBoundingClientRect = () =>
      ({
        bottom: 300,
        height: 160,
        left: 100,
        right: 300,
        top: 140,
        width: 200,
        x: 100,
        y: 140,
        toJSON: () => ({}),
      }) as DOMRect;

    act(() => {
      flowMocks.reactFlowProps?.onNodeClick?.(
        { clientX: 200, clientY: 300, target: clickTarget },
        node
      );
    });

    expect(screen.queryByTestId('commit-action-panel')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Details' })).toHaveAttribute(
      'data-intro-target',
      'canvas-action-details'
    );
    expect(screen.getByRole('button', { name: 'Create Leaf From This Version' })).toHaveAttribute(
      'data-intro-target',
      'canvas-action-new-leaf'
    );
  });

  it('does not use double click as committed node detail navigation', () => {
    layoutMocks.getLayoutedElements.mockResolvedValue(useCanvasStore.getState().nodes);
    const node = {
      ...useCanvasStore.getState().nodes[0],
      data: {
        ...useCanvasStore.getState().nodes[0].data,
        commitHash: 'sha256:2576b1356297',
      },
    };
    useCanvasStore.setState({ nodes: [node] });
    render(<CanvasWorkspace projectName="Trust Gate" />);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    const clickTarget = document.createElement('div');
    clickTarget.className = 'react-flow__node';

    act(() => {
      flowMocks.reactFlowProps?.onNodeClick?.(
        { clientX: 200, clientY: 300, target: clickTarget },
        node
      );
      flowMocks.reactFlowProps?.onNodeClick?.(
        { clientX: 200, clientY: 300, target: clickTarget },
        node
      );
    });

    expect(navigationMocks.routerPush).not.toHaveBeenCalledWith(
      '/project/proj_test/commit/sha256%3A2576b1356297'
    );
  });
});
