import type { ColorMode, Node } from '@xyflow/react';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import {
  Brain,
  FileOutput,
  GitCommit,
  GitCommitHorizontal,
  HelpCircle,
  LayoutGrid,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import '@xyflow/react/dist/style.css';
import { useTheme } from 'next-themes';
import { AnimatedEdge } from './AnimatedEdge';
import { canvasNodeTypes } from './CanvasNodes';
import { NodePalette } from './NodePalette';

// Custom edge types for xyflow
const edgeTypes = {
  animated: AnimatedEdge,
};

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ZoomSlider } from '@/components/ui/zoom-slider';
import { getLayoutedElements } from '@/lib/elkLayout';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';
import { useProjectStore } from '@/store/projectStore';
import type { CanvasNodeData, NodeKind } from '@/types/nodes';
import { MemoryContextModal } from '../memory/MemoryContextModal';
import { MergePanel } from '../merge/MergePanel';
import { DeletionConfirmDialog } from './DeletionConfirmDialog';
import { LeafPanel } from './LeafPanel';
import { NodeModal, type NodeQuickAction } from './NodeModal';

const GRID_SIZE = 16;

type PathHighlight = { mode: 'main' } | { mode: 'branch'; branch?: string } | null;

interface CanvasWorkspaceProps {
  projectName: string;
  mode: 'editor' | 'execution';
  onModeChange: (mode: 'editor' | 'execution') => void;
}

// Wrapper component to provide ReactFlow context
export default function CanvasWorkspace(props: CanvasWorkspaceProps) {
  return (
    <ReactFlowProvider>
      <CanvasWorkspaceInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasWorkspaceInner({ projectName, mode, onModeChange }: CanvasWorkspaceProps) {
  const [isPanMode, setIsPanMode] = useState(false);
  const [highlight, setHighlight] = useState<PathHighlight>(null);
  const [branchFilter, setBranchFilter] = useState<'all' | string>('all');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, getNodes, getEdges, setNodes, fitView } = useReactFlow();
  const { resolvedTheme } = useTheme();
  const [isPending, startTransition] = useTransition();
  const [isLayouting, setIsLayouting] = useState(false);

  // Map next-themes to xyflow colorMode
  const colorMode: ColorMode = resolvedTheme === 'dark' ? 'dark' : 'light';
  const {
    nodes,
    edges,
    projectId,
    addNode,
    updateNode,
    commitPendingCommit,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addPendingCommitFromCommit,
    saveConversationConstraints,
    getPendingCommitEffectiveConstraints,
    updatePendingCommitConstraintOverrides,
    hasDownstreamPendingCommits,
    loadDemoData,
    openNodeId,
    modalViewMode,
    openNodeModal,
    closeNodeModal,
  } = useCanvasStore();
  const notify = useProjectStore((state) => state.notifyCallback);

  // Auto-layout handler
  const handleAutoLayout = useCallback(async () => {
    const currentNodes = getNodes();
    const currentEdges = getEdges();

    if (currentNodes.length === 0) return;

    setIsLayouting(true);
    try {
      const layoutedNodes = await getLayoutedElements(currentNodes, currentEdges, {
        direction: 'DOWN',
        nodeSpacing: 80,
        rankSpacing: 120,
      });
      setNodes(layoutedNodes);
      // Fit view after layout with a small delay for the transition
      setTimeout(() => {
        fitView({ padding: 0.2, duration: 300 });
      }, 50);
    } catch (_err) {
      notify?.('Auto-layout failed', 'error');
    } finally {
      setIsLayouting(false);
    }
  }, [getNodes, getEdges, setNodes, fitView, notify]);

  const modalNode = nodes.find((node) => node.id === openNodeId);
  const pendingCommitBranchMode = useCanvasStore((state) => {
    if (!openNodeId) {
      return undefined;
    }
    const pendingNode = state.nodes.find(
      (node) =>
        node.id === openNodeId && node.data.kind === 'unit' && node.data.commitStatus === 'staging'
    );
    if (!pendingNode) {
      return undefined;
    }
    return state.getPendingCommitBranchMode(openNodeId);
  });

  // Get effective constraints for pending commit nodes
  const effectiveConstraints = useMemo(() => {
    if (
      !openNodeId ||
      !modalNode ||
      modalNode.data.kind !== 'unit' ||
      modalNode.data.commitStatus !== 'staging'
    ) {
      return undefined;
    }
    return getPendingCommitEffectiveConstraints(openNodeId);
  }, [openNodeId, modalNode, getPendingCommitEffectiveConstraints]);

  // Check if conversation is locked (has downstream pending commits)
  const isConversationLocked = useMemo(() => {
    if (!openNodeId || !modalNode || modalNode.data.kind !== 'unit') {
      return false;
    }
    return hasDownstreamPendingCommits(openNodeId);
  }, [openNodeId, modalNode, hasDownstreamPendingCommits]);

  const modalQuickActions = useMemo<NodeQuickAction[] | undefined>(() => {
    if (!modalNode) {
      return undefined;
    }
    // Only show quick actions for committed units, not staging ones
    if (modalNode.data.kind === 'unit' && modalNode.data.commitStatus === 'committed') {
      return [
        {
          key: 'add-unit',
          label: 'Create Unit',
          icon: <GitCommit size={14} />,
          onClick: () => addPendingCommitFromCommit(modalNode.id),
        },
      ];
    }
    return undefined;
  }, [modalNode, addPendingCommitFromCommit]);

  // Select all nodes (Ctrl/Cmd+A)
  const selectAllNodes = useCallback(() => {
    const currentNodes = getNodes();
    setNodes(currentNodes.map((node) => ({ ...node, selected: true })));
  }, [getNodes, setNodes]);

  // Deselect all nodes (Escape)
  const deselectAllNodes = useCallback(() => {
    const currentNodes = getNodes();
    setNodes(currentNodes.map((node) => ({ ...node, selected: false })));
  }, [getNodes, setNodes]);

  // Navigate to adjacent node (Arrow keys)
  const navigateToNode = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right') => {
      const currentNodes = getNodes();
      const selectedNodes = currentNodes.filter((node) => node.selected);

      // If no nodes selected, select the first one
      if (selectedNodes.length === 0 && currentNodes.length > 0) {
        setNodes(currentNodes.map((node, i) => ({ ...node, selected: i === 0 })));
        return;
      }

      // Get the "anchor" node (last selected)
      const anchorNode = selectedNodes[selectedNodes.length - 1];
      if (!anchorNode) return;

      // Find the nearest node in the given direction
      let bestNodeId: string | null = null;
      let bestDistance = Infinity;

      currentNodes.forEach((node) => {
        if (node.id === anchorNode.id) return;

        const dx = node.position.x - anchorNode.position.x;
        const dy = node.position.y - anchorNode.position.y;

        // Check if node is in the correct direction
        const isInDirection =
          (direction === 'up' && dy < -20) ||
          (direction === 'down' && dy > 20) ||
          (direction === 'left' && dx < -20) ||
          (direction === 'right' && dx > 20);

        if (!isInDirection) return;

        // Calculate distance with preference for the primary axis
        const primaryDistance =
          direction === 'up' || direction === 'down' ? Math.abs(dy) : Math.abs(dx);
        const secondaryDistance =
          direction === 'up' || direction === 'down' ? Math.abs(dx) : Math.abs(dy);

        // Weight primary axis more heavily
        const distance = primaryDistance + secondaryDistance * 0.3;

        if (distance < bestDistance) {
          bestDistance = distance;
          bestNodeId = node.id;
        }
      });

      if (bestNodeId) {
        setNodes(
          currentNodes.map((node) => ({
            ...node,
            selected: node.id === bestNodeId,
          }))
        );
      }
    },
    [getNodes, setNodes]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't handle shortcuts when modal is open or typing in input
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Pan mode toggle (Meta/Ctrl held)
      if (event.key === 'Meta' || event.key === 'Control') {
        setIsPanMode(true);
      }

      // Select all (Ctrl/Cmd+A)
      if (event.key === 'a' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        selectAllNodes();
        return;
      }

      // Deselect all (Escape)
      if (event.key === 'Escape') {
        deselectAllNodes();
        return;
      }

      // Arrow key navigation
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        navigateToNode('up');
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        navigateToNode('down');
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        navigateToNode('left');
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        navigateToNode('right');
        return;
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Meta' || event.key === 'Control') {
        setIsPanMode(false);
      }
    };
    const handleBlur = () => setIsPanMode(false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [selectAllNodes, deselectAllNodes, navigateToNode]);

  // Keyboard shortcut help dialog toggle (? key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        setShowShortcuts((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const branchNames = useMemo(() => {
    const names = new Set<string>();
    nodes.forEach((node) => {
      if (node.data.kind === 'unit' && node.data.branchType === 'branch' && node.data.branchName) {
        names.add(node.data.branchName);
      }
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [nodes]);

  // Reset branch filter when branch is removed - using a ref to avoid synchronous setState in effect
  const prevBranchNamesRef = useRef(branchNames);
  useEffect(() => {
    const prevBranchNames = prevBranchNamesRef.current;
    prevBranchNamesRef.current = branchNames;

    // Only check if branch was removed (not on initial render)
    if (
      branchFilter !== 'all' &&
      !branchNames.includes(branchFilter) &&
      prevBranchNames.includes(branchFilter)
    ) {
      // Use setTimeout to avoid synchronous setState in effect
      setTimeout(() => {
        setBranchFilter('all');
        setHighlight((current) => (current?.mode === 'branch' ? { mode: 'branch' } : current));
      }, 0);
    }
  }, [branchFilter, branchNames]);

  const getViewportCenter = useCallback(() => {
    if (!canvasRef.current) {
      return undefined;
    }
    const bounds = canvasRef.current.getBoundingClientRect();
    return screenToFlowPosition({
      x: bounds.width / 2,
      y: bounds.height / 2,
    });
  }, [screenToFlowPosition]);

  const handleAddNode = async (kind: NodeKind) => {
    const position = getViewportCenter();
    startTransition(async () => {
      try {
        await addNode(kind, position);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create node';
        notify?.(message, 'error');
      }
    });
  };

  // Drag-and-drop handlers for node palette
  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      const kind = event.dataTransfer.getData('application/reactflow') as NodeKind;
      if (!kind) return;

      // Get the drop position in flow coordinates
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      startTransition(async () => {
        try {
          await addNode(kind, position);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to create node';
          notify?.(message, 'error');
        }
      });
    },
    [screenToFlowPosition, addNode, notify]
  );

  const matchesHighlightCommit = (node: Node<CanvasNodeData>, mode: PathHighlight) => {
    if (!mode || node.data.kind !== 'unit') {
      return false;
    }
    if (mode.mode === 'main') {
      return node.data.branchType === 'main';
    }
    if (mode.mode === 'branch') {
      if (node.data.branchType !== 'branch') {
        return false;
      }
      if (!mode.branch) {
        return true;
      }
      return (node.data.branchName ?? '').toLowerCase() === mode.branch.toLowerCase();
    }
    return false;
  };

  const highlightSets = useMemo(() => {
    if (!highlight) {
      return {
        nodes: new Set<string>(),
        edges: new Set<string>(),
      };
    }

    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const adjacency = new Map<string, Set<string>>();
    edges.forEach((edge) => {
      const out = adjacency.get(edge.source) ?? new Set<string>();
      out.add(edge.target);
      adjacency.set(edge.source, out);

      const inbound = adjacency.get(edge.target) ?? new Set<string>();
      inbound.add(edge.source);
      adjacency.set(edge.target, inbound);
    });

    const startNodes = nodes
      .filter((node) => matchesHighlightCommit(node, highlight))
      .map((node) => node.id);

    if (startNodes.length === 0) {
      return {
        nodes: new Set<string>(),
        edges: new Set<string>(),
      };
    }

    const visited = new Set<string>(startNodes);
    const commitStarts = new Set(startNodes);
    const queue = [...startNodes];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = adjacency.get(current);
      if (!neighbors) {
        continue;
      }
      neighbors.forEach((neighborId) => {
        if (visited.has(neighborId)) {
          return;
        }
        const neighborNode = nodeMap.get(neighborId);
        if (!neighborNode) {
          return;
        }
        if (neighborNode.data.kind === 'unit' && !matchesHighlightCommit(neighborNode, highlight)) {
          return;
        }
        visited.add(neighborId);
        queue.push(neighborId);
      });
    }

    const highlightedEdges = new Set<string>();
    edges.forEach((edge) => {
      const bothVisited = visited.has(edge.source) && visited.has(edge.target);
      if (bothVisited) {
        highlightedEdges.add(edge.id);
        return;
      }
      if (
        highlight.mode !== 'main' &&
        (commitStarts.has(edge.source) || commitStarts.has(edge.target))
      ) {
        highlightedEdges.add(edge.id);
      }
    });

    return {
      nodes: visited,
      edges: highlightedEdges,
    };
  }, [nodes, edges, highlight]);

  // Semantic highlight colors - Blue for main (committed), Orange for branch (pending)
  const highlightColor =
    highlight?.mode === 'main' ? '#2563eb' : highlight?.mode === 'branch' ? '#f97316' : undefined;

  const nodesForRender = useMemo(() => {
    if (!highlight) {
      return nodes;
    }

    return nodes.map((node) => {
      if (!highlightSets.nodes.has(node.id)) {
        return node;
      }
      return {
        ...node,
        data: {
          ...node.data,
          highlightMode: highlight.mode,
        },
      };
    });
  }, [nodes, highlight, highlightSets.nodes]);

  const edgesForRender = useMemo(() => {
    if (!highlight || !highlightColor || highlightSets.edges.size === 0) {
      return edges;
    }
    return edges.map((edge) => {
      if (!highlightSets.edges.has(edge.id)) {
        return edge;
      }
      return {
        ...edge,
        style: {
          ...edge.style,
          stroke: highlightColor,
          strokeWidth: 4.5,
        },
      };
    });
  }, [edges, highlight, highlightSets.edges, highlightColor]);

  const toggleHighlight = (mode: PathHighlight) => {
    setHighlight((current) => {
      if (!mode) {
        return null;
      }
      if (!current) {
        return mode;
      }
      if (current.mode === mode.mode) {
        if (current.mode === 'branch' && mode.mode === 'branch') {
          const prevBranch = current.branch ?? 'all';
          const nextBranch = mode.branch ?? 'all';
          if (prevBranch === nextBranch) {
            return null;
          }
        } else {
          return null;
        }
      }
      return mode;
    });
  };

  const hasMainCommits = nodes.some(
    (node) => node.data.kind === 'unit' && node.data.branchType === 'main'
  );
  const hasBranchCommits = nodes.some(
    (node) => node.data.kind === 'unit' && node.data.branchType === 'branch'
  );
  return (
    <div className="relative flex h-full flex-col">
      {/* Integrated Top Bar - Glass style */}
      <header
        className={cn(
          'flex h-14 shrink-0 items-center justify-between border-b border-[var(--stroke-divider)] px-5',
          glass.panelBase,
          glass.highlight
        )}
      >
        <div className="flex items-center gap-5">
          <h2 className="text-base font-semibold tracking-tight text-foreground">{projectName}</h2>
          <div className="h-5 w-px bg-border/60" />
          <div className="flex items-center gap-1">
            <Button
              variant={highlight?.mode === 'main' ? 'commit' : 'ghost'}
              size="sm"
              onClick={() => toggleHighlight({ mode: 'main' })}
              disabled={!hasMainCommits}
              className={cn(
                'h-7 px-3 text-xs font-medium rounded-full transition-all',
                highlight?.mode !== 'main' &&
                  'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              Main
            </Button>
            <Button
              variant={highlight?.mode === 'branch' ? 'pending' : 'ghost'}
              size="sm"
              onClick={() =>
                hasBranchCommits &&
                toggleHighlight({
                  mode: 'branch',
                  branch: branchFilter === 'all' ? undefined : branchFilter,
                })
              }
              disabled={!hasBranchCommits}
              className={cn(
                'h-7 px-3 text-xs font-medium rounded-full transition-all',
                highlight?.mode !== 'branch' &&
                  'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              Branch
            </Button>
            <Select
              value={branchFilter}
              onValueChange={(value) => {
                setBranchFilter(value);
                if (highlight?.mode === 'branch') {
                  setHighlight({
                    mode: 'branch',
                    branch: value === 'all' ? undefined : value,
                  });
                }
              }}
              disabled={!hasBranchCommits}
            >
              <SelectTrigger className="h-7 w-[130px] text-xs rounded-full border-border/50 bg-muted/50 hover:bg-muted transition-colors">
                <SelectValue placeholder="All branches" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">All branches</SelectItem>
                {branchNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowMemoryModal(true)}
            title="Memory Context"
            className={cn(
              'h-9 px-3 rounded-xl transition-all text-xs gap-1.5',
              'text-muted-foreground hover:text-foreground',
              'hover:bg-primary/10 hover:text-primary'
            )}
          >
            <Brain className="h-4 w-4" />
            Memory
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleAutoLayout}
            title="Auto Layout"
            className={cn(
              'h-9 w-9 rounded-xl transition-all',
              'text-muted-foreground hover:text-foreground',
              'hover:bg-primary/10 hover:text-primary',
              isLayouting && 'pointer-events-none'
            )}
            disabled={isLayouting || nodes.length === 0}
          >
            {isLayouting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LayoutGrid className="h-4 w-4" />
            )}
          </Button>
          {/* DEV: Load Demo Data button */}
          {process.env.NODE_ENV === 'development' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={loadDemoData}
              title="Load Demo Data"
              className={cn(
                'h-9 px-3 rounded-xl transition-all text-xs',
                'text-muted-foreground hover:text-foreground',
                'hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400',
                'border border-dashed border-amber-300 dark:border-amber-700'
              )}
            >
              Demo
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleAddNode('unit')}
            title="Add Unit"
            className={cn(
              'h-9 w-9 rounded-xl transition-all',
              'text-muted-foreground hover:text-foreground',
              'hover:bg-primary/10 hover:text-primary',
              isPending && 'pointer-events-none'
            )}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageSquarePlus className="h-4 w-4" />
            )}
          </Button>
        </div>
      </header>

      {/* Mode Switch - using shadcn Tabs with pill variant */}
      <div className="absolute left-1/2 top-14 z-10 -translate-x-1/2 -translate-y-1/2">
        <Tabs value={mode} onValueChange={(v) => onModeChange(v as 'editor' | 'execution')}>
          <TabsList variant="pill">
            <TabsTrigger value="editor" variant="pill">
              Editor
            </TabsTrigger>
            <TabsTrigger value="execution" variant="pill">
              Execution
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div
        ref={canvasRef}
        className={cn('relative flex-1', isPanMode && 'cursor-grab active:cursor-grabbing')}
        role="tree"
        aria-label="Knowledge graph canvas"
        style={{
          background: 'var(--surface-app)',
          backgroundImage:
            'radial-gradient(ellipse at 50% 30%, var(--surface-radial), transparent 70%)',
        }}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {/* Node Palette for drag-and-drop */}
        <NodePalette />
        <ReactFlow
          nodes={nodesForRender}
          edges={edgesForRender}
          nodeTypes={canvasNodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDoubleClick={(_, node) => {
            openNodeModal(node.id, 'commit');
          }}
          panOnDrag={isPanMode}
          selectionOnDrag={!isPanMode}
          snapToGrid
          snapGrid={[GRID_SIZE, GRID_SIZE]}
          proOptions={{ hideAttribution: true }}
          fitView
          fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          minZoom={0.25}
          maxZoom={2}
          deleteKeyCode={['Backspace', 'Delete']}
          selectNodesOnDrag={false}
          colorMode={colorMode}
          defaultEdgeOptions={{
            type: 'animated',
            style: { strokeWidth: 2 },
          }}
        >
          <MiniMap
            nodeStrokeWidth={3}
            pannable
            zoomable
            className={cn('!rounded-xl', glass.cardBase, glass.highlight)}
            style={{
              backgroundColor: 'transparent',
            }}
            maskColor={colorMode === 'dark' ? 'rgba(15, 23, 42, 0.7)' : 'rgba(255, 255, 255, 0.7)'}
          />
          <ZoomSlider position="bottom-left" />
          <Background
            variant={BackgroundVariant.Dots}
            gap={32}
            size={1}
            color={colorMode === 'dark' ? 'var(--stroke-grid)' : '#cbd5e1'}
          />
        </ReactFlow>

        {/* Empty state overlay - guided 3-step card */}
        {nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <Card className="border-dashed border-2 border-border/60 bg-card/80 backdrop-blur-sm px-10 py-8 max-w-lg">
              <p className="text-lg font-semibold text-foreground mb-6">Get started with T3X</p>
              <div className="flex flex-col gap-5">
                {/* Step 1 */}
                <div className="flex items-start gap-4 text-left">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                    1
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <MessageSquare className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Add Conversation</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Start by adding a conversation to extract knowledge from
                      </p>
                    </div>
                  </div>
                </div>
                {/* Step 2 */}
                <div className="flex items-start gap-4 text-left">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                    2
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <GitCommitHorizontal className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Extract Knowledge</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Commit semantic content from your conversations
                      </p>
                    </div>
                  </div>
                </div>
                {/* Step 3 */}
                <div className="flex items-start gap-4 text-left">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                    3
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <FileOutput className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Create Outputs</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Generate outputs for different platforms
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
      {modalNode && (
        <NodeModal
          node={modalNode}
          onClose={closeNodeModal}
          onUpdate={(patch) => updateNode(modalNode.id, patch)}
          viewMode={modalViewMode || 'commit'}
          onConvertDraft={
            modalNode.data.kind === 'unit' &&
            modalNode.data.commitStatus === 'staging' &&
            pendingCommitBranchMode !== 'blocked'
              ? () => {
                  commitPendingCommit(modalNode.id);
                  closeNodeModal();
                  notify?.('Unit committed successfully', 'success');
                }
              : undefined
          }
          draftBranchMode={pendingCommitBranchMode}
          onBranchChange={
            modalNode.data.kind === 'unit' && modalNode.data.commitStatus === 'staging'
              ? (branch) => updateNode(modalNode.id, { pendingBranch: branch })
              : undefined
          }
          onBranchNameChange={
            modalNode.data.kind === 'unit' && modalNode.data.commitStatus === 'staging'
              ? (name) => updateNode(modalNode.id, { pendingBranchName: name })
              : undefined
          }
          quickActions={modalQuickActions}
          onSaveConstraints={
            modalNode.data.kind === 'unit'
              ? (constraints) => saveConversationConstraints(modalNode.id, constraints)
              : undefined
          }
          effectiveConstraints={effectiveConstraints}
          onUpdateConstraintOverrides={
            modalNode.data.kind === 'unit' && modalNode.data.commitStatus === 'staging'
              ? (overrides) => updatePendingCommitConstraintOverrides(modalNode.id, overrides)
              : undefined
          }
          isConversationLocked={isConversationLocked}
        />
      )}
      <LeafPanel />
      <MergePanel />
      <DeletionConfirmDialog />
      {projectId && (
        <MemoryContextModal
          open={showMemoryModal}
          onClose={() => setShowMemoryModal(false)}
          projectId={projectId}
        />
      )}

      {/* Keyboard shortcuts help button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setShowShortcuts(true)}
        title="Keyboard Shortcuts (?)"
        className="absolute bottom-4 right-4 z-10 h-8 w-8 rounded-full border border-border/50 bg-background/80 backdrop-blur-sm text-muted-foreground hover:text-foreground"
      >
        <HelpCircle className="h-4 w-4" />
      </Button>

      {/* Keyboard shortcuts dialog */}
      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Show this help</span>
              <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs font-mono">?</kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Delete selected node</span>
              <div className="flex items-center gap-1">
                <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs font-mono">
                  Backspace
                </kbd>
                <span className="text-xs text-muted-foreground">/</span>
                <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs font-mono">
                  Delete
                </kbd>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Deselect all</span>
              <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs font-mono">Escape</kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Select all</span>
              <div className="flex items-center gap-1">
                <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs font-mono">
                  Ctrl+A
                </kbd>
                <span className="text-xs text-muted-foreground">/</span>
                <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs font-mono">Cmd+A</kbd>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
