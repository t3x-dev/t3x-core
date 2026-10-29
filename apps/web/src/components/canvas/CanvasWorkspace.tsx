import type { ColorMode, MarkerType, Node } from '@xyflow/react';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import { Download, Hand, HelpCircle, MousePointer2, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getLayoutedElements } from '@/components/canvas/elkLayout';
import { getBranchVisual } from '@/domain/canvas/branchVisuals';
import { buildStateCanvasSvg } from '@/domain/canvas/stateCanvasExport';
import { downloadTextFile } from '@/domain/history/historyCanvasExport';
import {
  getProjectIdCanvasCommitPath,
  getProjectIdHistoryPath,
  getProjectIdWorkspacePath,
} from '@/domain/project/repoPath';
import { useCanvasNodeActions } from '@/hooks/canvas/useCanvasNodeActions';
import { useCanvasPositionPersist } from '@/hooks/canvas/useCanvasPositionPersist';
import { LEAF_CHANGED_EVENT, type LeafChangedDetail } from '@/hooks/leaves/leafEvents';
import {
  CONVERSATION_DELETED_EVENT,
  type ConversationDeletedDetail,
  PROJECT_DELETED_EVENT,
  type ProjectDeletedDetail,
} from '@/hooks/shared/deleteEvents';
import { useCompactViewport } from '@/hooks/shared/useChatCompactViewport';
import { useContextMenu } from '@/hooks/shared/useContextMenu';
import { useNodePositionSaver } from '@/hooks/shared/useNodePositionSaver';
import { usePathHighlight } from '@/hooks/shared/usePathHighlight';
import { useTerminology } from '@/hooks/shared/useTerminology';
import { useCommitTransitionView } from '@/hooks/workspaces/useCommitTransitionView';
import '@xyflow/react/dist/style.css';
import { useTheme } from 'next-themes';
import { AnimatedEdge } from './AnimatedEdge';
import { useCanvasKeyboardShortcuts } from './CanvasKeyboardShortcuts';
import { canvasNodeTypes } from './CanvasNodes';
import { CanvasOnboarding } from './CanvasOnboarding';
import { CanvasShortcutsDialog } from './CanvasShortcutsContent';
import { CanvasStatusBar } from './CanvasStatusBar';
import { CanvasToolbar } from './CanvasToolbar';
import { useCanvasHandlers } from './CanvasWorkspaceHandlers';
import { buildCommitActions, CommitActionPanel } from './CommitActionPanel';
import { NodeContextMenu } from './NodeContextMenu';

// Custom edge types for xyflow
const edgeTypes = {
  animated: AnimatedEdge,
};

import { Button } from '@/components/ui/button';
import { ZoomSlider } from '@/components/ui/zoom-slider';
import { formatUserFacingError } from '@/domain/format/errors';
import { useCanvasStore } from '@/store/canvasStore';
import { useProjectStore } from '@/store/projectStore';
import type { Conversation } from '@/types/api';
import type { CanvasNodeData } from '@/types/nodes';
import { cn } from '@/utils/cn';
import { glass } from '@/utils/theme';
import { ImportDialog } from '../import/ImportDialog';
import { MemoryContextModal } from '../memory/MemoryContextModal';
import { MergePanel } from '../merge/MergePanel';
import { CanvasSelectionPanel } from './CanvasSelectionPanel';
import { DeletionConfirmDialog } from './DeletionConfirmDialog';
import { NodeModal } from './NodeModal';
import vividStyles from './StateCanvasVivid.module.css';

const GRID_SIZE = 16;
const CANVAS_MINIMAP_WIDTH = 176;
const CANVAS_MINIMAP_HEIGHT = 96;
const VIRTUALIZE_AFTER = 40;
type CanvasUnitNode = Node<CanvasNodeData, 'unit'>;

function nodeBranch(node: Node<CanvasNodeData>): string {
  if (node.data.commitStatus === 'committed') {
    return (
      node.data.commit?.branch ||
      (node.data.branchType === 'branch' ? node.data.branchName || 'branch' : 'main')
    );
  }
  return node.data.pendingBranch === 'branch'
    ? node.data.pendingBranchName || node.data.branchName || 'branch'
    : 'main';
}

interface CanvasWorkspaceProps {
  embedded?: boolean;
  focusedBranch?: string;
  focusedCommitHash?: string;
  projectName: string;
  stateHref?: string;
  /** Initial viewport from URL params */
  initialViewport?: { x: number; y: number; zoom: number };
  /** Called when viewport changes (debounced externally) */
  onViewportChange?: (viewport: { x: number; y: number; zoom: number }) => void;
}

// Wrapper component to provide ReactFlow context
export default function CanvasWorkspace(props: CanvasWorkspaceProps) {
  return (
    <ReactFlowProvider>
      <CanvasWorkspaceInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasWorkspaceInner({
  embedded = false,
  focusedBranch,
  focusedCommitHash,
  projectName,
  stateHref,
  initialViewport,
  onViewportChange,
}: CanvasWorkspaceProps) {
  const { save: saveNodePosition } = useNodePositionSaver();
  // Subscribe-based persistence of drag-induced position changes.
  // Canvas store stays pure per v2 §2.5.
  useCanvasPositionPersist();
  const router = useRouter();
  const [isPanMode, setIsPanMode] = useState(false);
  const [branchFilter, setBranchFilter] = useState('all');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [actionPanel, setActionPanel] = useState<{
    x: number;
    y: number;
    nodeId: string;
  } | null>(null);
  const reopenActionPanelNodeRef = useRef<string | null>(null);
  const focusedCommitAppliedRef = useRef<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, getNodes, getEdges, setNodes, fitView, setCenter } = useReactFlow();
  const { resolvedTheme } = useTheme();
  const [isAdding, setIsAdding] = useState(false);
  const { isDeveloperMode } = useTerminology();
  const compactViewport = useCompactViewport();
  const selectionPanelVisible = useCompactViewport('(min-width: 1280px)');
  const canvasMinZoom = compactViewport ? 0.55 : 0.25;
  // Map next-themes to xyflow colorMode
  const colorMode: ColorMode = resolvedTheme === 'dark' ? 'dark' : 'light';
  const {
    nodes,
    edges,
    projectId,
    loading: canvasLoading,
    updateNode,
    onNodesChange,
    onEdgesChange,
    onConnect,
    openNodeId,
    modalViewMode,
    openNodeModal,
    closeNodeModal,
  } = useCanvasStore();
  const pendingConversations = useCanvasStore((state) => state.pendingConversations);
  const { load: loadCanvas, refresh: refreshCanvasLeaves, add: addNode } = useCanvasNodeActions();
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  // Sync from localStorage after mount (avoids SSR hydration mismatch)
  useEffect(() => {
    if (localStorage.getItem('t3x_onboarded') === 'true') {
      setOnboardingDismissed(true);
    }
  }, []);
  useEffect(() => {
    if (!projectId) return;

    const handleLeafChanged = (event: Event) => {
      const detail = (event as CustomEvent<LeafChangedDetail>).detail;
      if (detail?.projectId !== projectId) return;
      void refreshCanvasLeaves(projectId);
    };

    window.addEventListener(LEAF_CHANGED_EVENT, handleLeafChanged);
    return () => window.removeEventListener(LEAF_CHANGED_EVENT, handleLeafChanged);
  }, [projectId, refreshCanvasLeaves]);

  useEffect(() => {
    if (!projectId) return;

    const handleConversationDeleted = (event: Event) => {
      const detail = (event as CustomEvent<ConversationDeletedDetail>).detail;
      if (detail?.projectId !== projectId || !detail.conversationId) return;
      useCanvasStore.setState((state) => {
        if (state.projectId !== projectId) return {};
        const nodesToRemove = new Set(
          state.nodes
            .filter(
              (node) =>
                node.data.kind === 'unit' &&
                node.data.conversationId === detail.conversationId &&
                node.data.commitStatus !== 'committed'
            )
            .map((node) => node.id)
        );
        if (nodesToRemove.size === 0) return {};
        return {
          nodes: state.nodes.filter((node) => !nodesToRemove.has(node.id)),
          pendingConversations: state.pendingConversations.filter(
            (conversation) => conversation.conversationId !== detail.conversationId
          ),
          edges: state.edges.filter(
            (edge) => !nodesToRemove.has(edge.source) && !nodesToRemove.has(edge.target)
          ),
          openNodeId:
            state.openNodeId && nodesToRemove.has(state.openNodeId) ? null : state.openNodeId,
          modalViewMode:
            state.openNodeId && nodesToRemove.has(state.openNodeId) ? null : state.modalViewMode,
        };
      });
    };

    const handleProjectDeleted = (event: Event) => {
      const detail = (event as CustomEvent<ProjectDeletedDetail>).detail;
      if (detail?.projectId !== projectId) return;
      useCanvasStore.getState().clearCanvas();
    };

    window.addEventListener(CONVERSATION_DELETED_EVENT, handleConversationDeleted);
    window.addEventListener(PROJECT_DELETED_EVENT, handleProjectDeleted);
    return () => {
      window.removeEventListener(CONVERSATION_DELETED_EVENT, handleConversationDeleted);
      window.removeEventListener(PROJECT_DELETED_EVENT, handleProjectDeleted);
    };
  }, [projectId]);

  const notify = useProjectStore((state) => state.notifyCallback);

  const openCreatedConversation = useCallback(
    (conversation: Conversation) => {
      const targetProjectId = projectId || conversation.project_id;
      if (!targetProjectId) return;
      router.push(
        getProjectIdWorkspacePath(targetProjectId, {
          branch: 'main',
          sourceConversationId: conversation.conversation_id,
        })
      );
    },
    [projectId, router]
  );

  // Extracted handlers
  const { handleAddNode, selectAllNodes, deselectAllNodes, navigateToNode } = useCanvasHandlers({
    getNodes,
    setNodes,
    setCenter,
    screenToFlowPosition,
    canvasRef,
    notify,
    addNode,
    setIsAdding,
  });

  // Context menu (extracted hook)
  const { contextMenu, closeContextMenu, handleNodeContextMenu, handlePaneContextMenu } =
    useContextMenu({
      addNode,
      isDeveloperMode,
      notify,
      fitView,
      onConversationCreated: openCreatedConversation,
    });

  // Path highlight (extracted hook)
  const { highlight, setHighlight, nodesForRender, edgesForRender } = usePathHighlight({
    nodes,
    edges,
  });

  const branchOptions = useMemo(
    () =>
      [...new Set(nodes.filter((node) => node.data.kind === 'unit').map(nodeBranch))].sort(
        (left, right) =>
          Number(right === 'main') - Number(left === 'main') || left.localeCompare(right)
      ),
    [nodes]
  );
  const visibleNodeIds = useMemo(
    () =>
      new Set(
        nodes
          .filter((node) => branchFilter === 'all' || nodeBranch(node) === branchFilter)
          .map((node) => node.id)
      ),
    [branchFilter, nodes]
  );
  const visibleNodes = useMemo(
    () => nodesForRender.filter((node) => visibleNodeIds.has(node.id)),
    [nodesForRender, visibleNodeIds]
  );
  const visibleEdges = useMemo(
    () =>
      edgesForRender.filter(
        (edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
      ),
    [edgesForRender, visibleNodeIds]
  );

  const changeBranchFilter = useCallback(
    (branch: string) => {
      setBranchFilter(branch);
      setActionPanel(null);
      requestAnimationFrame(() => {
        void fitView({ padding: compactViewport ? 0.12 : 0.24, maxZoom: 1, duration: 240 });
      });
    },
    [compactViewport, fitView]
  );

  // DAG auto-layout: compute topology fingerprint from node IDs + edge connections.
  // Position changes don't alter this, so ELK only runs when the graph structure changes.
  const topoFingerprint = useMemo(() => {
    const nIds = nodes
      .map((n) => n.id)
      .sort()
      .join(',');
    const eKeys = edges
      .map((e) => `${e.source}->${e.target}`)
      .sort()
      .join(',');
    return `${nIds}|${eKeys}`;
  }, [nodes, edges]);

  const hasDbPositions = useCanvasStore((s) => s.hasDbPositions);
  const [initialLayoutDone, setInitialLayoutDone] = useState(false);
  // Track the fingerprint from the previous render to detect topology changes vs initial load
  const prevTopoRef = useRef<string | null>(null);
  const useVersionPathLayout = useMemo(
    () =>
      nodes.length > 1 &&
      nodes.every((node) => node.data.kind === 'unit') &&
      nodes.some((node) => node.data.commitStatus === 'committed'),
    [nodes]
  );

  // DAG auto-layout:
  // - Initial load with DB positions → skip ELK, use saved positions
  // - Initial load without DB positions → run ELK + save to DB
  // - Topology change (new node/edge/delete) → always re-run ELK + save to DB
  useEffect(() => {
    // Use ReactFlow's internal nodes (includes measured dimensions for ELK).
    // Fall back to Zustand store nodes if ReactFlow hasn't synced yet — avoids
    // a race where getNodes() returns [] on the first effect run, causing
    // initialLayoutDone to never be set and the canvas to stay opacity-0.
    const rfNodes = getNodes();
    const currentNodes = rfNodes.length > 0 ? rfNodes : nodes;
    if (currentNodes.length === 0) return;

    const isInitialLoad = prevTopoRef.current === null;
    const topoChanged = prevTopoRef.current !== null && prevTopoRef.current !== topoFingerprint;
    prevTopoRef.current = topoFingerprint;

    // Initial load with DB positions → skip ELK, except for committed version paths.
    // Version paths should read left-to-right like a commit lineage instead of
    // inheriting stale free-canvas positions from earlier experiments.
    if (isInitialLoad && hasDbPositions && !useVersionPathLayout) {
      setInitialLayoutDone(true);
      return;
    }

    // Not initial load and no topology change → nothing to do
    if (!isInitialLoad && !topoChanged) {
      return;
    }

    // Initial load without DB positions OR topology changed → run ELK
    let cancelled = false;
    (async () => {
      try {
        const layouted = await getLayoutedElements(currentNodes, getEdges(), {
          direction: useVersionPathLayout ? 'RIGHT' : 'DOWN',
          nodeSpacing: useVersionPathLayout ? 96 : 80,
          rankSpacing: useVersionPathLayout ? 132 : 120,
        });
        if (cancelled) return;
        setNodes(layouted);
        // Save ELK-computed positions to DB so next reload uses them
        for (const node of layouted) {
          if ((node.data as CanvasNodeData).pendingConversationGroup) continue;
          saveNodePosition(
            node.id,
            (node.data as import('@/types/nodes').CanvasNodeData).kind,
            node.position
          );
        }
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            fitView({ padding: compactViewport ? 0.12 : 0.3, maxZoom: 1, duration: 300 });
          });
        });
      } catch {
        // Layout failure is non-critical — nodes keep their current positions
      } finally {
        if (!cancelled) setInitialLayoutDone(true);
      }
    })();
    return () => {
      cancelled = true;
      // Reset prevTopoRef so that React StrictMode re-mount (or any remount)
      // treats the next effect run as an initial load instead of "no change".
      prevTopoRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topoFingerprint, useVersionPathLayout]);

  useEffect(() => {
    if (!focusedCommitHash) {
      focusedCommitAppliedRef.current = null;
      return;
    }
    if (!initialLayoutDone) return;

    const targetNode = nodes.find(
      (node) =>
        node.id === focusedCommitHash ||
        node.data.commitHash === focusedCommitHash ||
        node.data.commit?.hash === focusedCommitHash
    );
    if (!targetNode) return;

    const focusKey = `${projectId ?? 'project'}:${focusedCommitHash}:${targetNode.id}`;
    if (focusedCommitAppliedRef.current === focusKey) return;
    focusedCommitAppliedRef.current = focusKey;

    setHighlight({ mode: 'node', nodeId: targetNode.id });
    const currentNodes = getNodes();
    setNodes(
      currentNodes.map((node) => ({
        ...node,
        selected: node.id === targetNode.id,
      }))
    );

    const measuredTarget = currentNodes.find((node) => node.id === targetNode.id) ?? targetNode;
    const width = measuredTarget.measured?.width ?? measuredTarget.width ?? 288;
    const height = measuredTarget.measured?.height ?? measuredTarget.height ?? 160;
    const frame = requestAnimationFrame(() => {
      setCenter(measuredTarget.position.x + width / 2, measuredTarget.position.y + height / 2, {
        duration: 300,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [
    focusedCommitHash,
    getNodes,
    initialLayoutDone,
    nodes,
    projectId,
    setCenter,
    setHighlight,
    setNodes,
  ]);

  const modalNode = nodes.find((node) => node.id === openNodeId);

  useEffect(() => {
    if (modalNode?.data.commitStatus === 'committed' && modalViewMode !== 'conversation') {
      closeNodeModal();
    }
  }, [closeNodeModal, modalNode, modalViewMode]);

  const selectedUnitNode = useMemo<CanvasUnitNode | null>(() => {
    const actionNode = actionPanel
      ? nodes.find((node) => node.id === actionPanel.nodeId && visibleNodeIds.has(node.id))
      : undefined;
    const selectedNode = nodes.find(
      (node) =>
        visibleNodeIds.has(node.id) &&
        node.selected &&
        node.data.kind === 'unit' &&
        node.data.commitStatus === 'committed'
    );
    const node = actionNode ?? selectedNode;
    if (!node || node.data.kind !== 'unit' || node.data.commitStatus !== 'committed') {
      return null;
    }
    return node as CanvasUnitNode;
  }, [actionPanel, nodes, visibleNodeIds]);

  const buildNodeActionModel = (node: CanvasUnitNode | null) => {
    if (!node) {
      return { actions: [], canMerge: false, parentHash: undefined };
    }
    const parentEdge = edges.find((edge) => edge.target === node.id);
    const parentNode = parentEdge
      ? (nodes.find((candidate) => candidate.id === parentEdge.source) as
          | CanvasUnitNode
          | undefined)
      : undefined;
    const parentHash =
      parentNode?.data.commitHash ??
      parentNode?.data.commit?.hash ??
      (parentEdge?.source?.startsWith('sha') ? parentEdge.source : undefined);

    const commitHash = node.data.commitHash ?? node.data.commit?.hash;
    const branch = node.data.commit?.branch || nodeBranch(node);
    return {
      actions: buildCommitActions({
        onViewDiff:
          projectId && commitHash
            ? () =>
                router.push(
                  getProjectIdHistoryPath(projectId, {
                    branch,
                    commit: commitHash,
                    returnTo: getProjectIdCanvasCommitPath(projectId, commitHash),
                  })
                )
            : undefined,
      }),
      canMerge: false,
      parentHash,
    };
  };

  const selectionActionModel = buildNodeActionModel(selectedUnitNode);
  const selectedParentNodes = useMemo(() => {
    if (!selectedUnitNode) return [];
    const parentHashes = new Set(
      selectedUnitNode.data.commit?.parents ??
        edges.filter((edge) => edge.target === selectedUnitNode.id).map((edge) => edge.source)
    );
    return nodes.filter(
      (node): node is CanvasUnitNode =>
        node.data.kind === 'unit' &&
        (parentHashes.has(node.id) ||
          Boolean(node.data.commitHash && parentHashes.has(node.data.commitHash)))
    );
  }, [edges, nodes, selectedUnitNode]);
  const selectedCommitHash =
    selectedUnitNode?.data.commitHash ?? selectedUnitNode?.data.commit?.hash ?? null;
  const selectedCommitBranch = selectedUnitNode
    ? selectedUnitNode.data.commit?.branch || nodeBranch(selectedUnitNode)
    : focusedBranch || 'main';
  const transitionState = useCommitTransitionView(
    projectId ?? '',
    selectedCommitBranch,
    selectedCommitHash
  );

  const downloadCanvas = useCallback(() => {
    const internalNodes = getNodes() as Node<CanvasNodeData>[];
    const positioned = visibleNodes.map(
      (node) => internalNodes.find((candidate) => candidate.id === node.id) ?? node
    );
    downloadTextFile(
      `state-evolution-${branchFilter === 'all' ? 'all-branches' : branchFilter}.svg`,
      buildStateCanvasSvg(positioned, visibleEdges),
      'image/svg+xml;charset=utf-8'
    );
  }, [branchFilter, getNodes, visibleEdges, visibleNodes]);

  const closeInspector = useCallback(() => {
    setActionPanel(null);
    setHighlight(null);
    setNodes(getNodes().map((node) => ({ ...node, selected: false })));
  }, [getNodes, setHighlight, setNodes]);

  const showActionPanelForNode = useCallback(
    (event: React.MouseEvent | MouseEvent, nodeId: string) => {
      const rect = (event.target as HTMLElement)
        .closest('.react-flow__node')
        ?.getBoundingClientRect();
      const px = rect ? rect.left + rect.width / 2 : event.clientX;
      const py = rect ? rect.bottom + 8 : event.clientY;
      setActionPanel({
        x: px,
        y: py,
        nodeId,
      });
    },
    []
  );

  // Keyboard shortcuts (extracted hook)
  useCanvasKeyboardShortcuts({
    selectAllNodes,
    deselectAllNodes,
    navigateToNode,
    getNodes,
    setNodes,
    openNodeModal,
    openNodeId,
    showShortcuts,
    setIsPanMode,
    setShowShortcuts,
  });

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      <div
        className={cn('flex min-h-0 flex-1', vividStyles.workspaceSplit)}
        data-testid="canvas-inspector-layout"
      >
        <div className={vividStyles.canvasColumn} data-testid="canvas-column">
          <CanvasToolbar
            embedded={embedded}
            branchFilter={branchFilter}
            branchOptions={branchOptions}
            focusedBranch={focusedBranch}
            onBranchFilterChange={changeBranchFilter}
            projectName={projectName}
            stateHref={stateHref}
            onFitView={() =>
              fitView({ padding: compactViewport ? 0.12 : 0.3, maxZoom: 1, duration: 300 })
            }
          />

          <div
            ref={canvasRef}
            data-intro-target="project-canvas"
            className={cn(
              'relative min-w-0 flex-1 transition-opacity duration-300',
              vividStyles.canvasPane,
              isPanMode && 'cursor-grab active:cursor-grabbing',
              !initialLayoutDone && nodes.length > 0 && 'opacity-0'
            )}
            role="tree"
            aria-label="State graph canvas"
            style={{
              backgroundColor: 'var(--surface-canvas)',
            }}
          >
            <ReactFlow
              nodes={visibleNodes}
              edges={visibleEdges}
              nodeTypes={canvasNodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(event, node) => {
                // Skip node click logic when user is interacting with editable title
                const target = event.target as HTMLElement;
                if (target.tagName === 'INPUT' || target.closest('[data-title-editable]')) {
                  return;
                }

                const data = node.data as CanvasNodeData;

                if (data.kind === 'leaf') return;

                const branchHighlightTarget =
                  target.closest<HTMLElement>('[data-branch-highlight]');
                const requestedBranch = branchHighlightTarget?.dataset.branchHighlight?.trim();
                if (!compactViewport && requestedBranch) {
                  setHighlight(
                    requestedBranch === 'main' || requestedBranch === 'master'
                      ? { mode: 'main' }
                      : { branch: requestedBranch, mode: 'branch' }
                  );
                  return;
                }

                // Every node uses the same causal rule: highlight the selected version,
                // then recursively follow all parents back to the graph roots.
                if (!compactViewport) {
                  setHighlight({ mode: 'node', nodeId: node.id });
                }

                // Pending nodes stay on the canvas when selected. Their incoming pending
                // edge is now part of the highlighted causal path, but no commit action
                // panel is opened for them.
                if (data.commitStatus !== 'committed') {
                  return;
                }

                showActionPanelForNode(event, node.id);
              }}
              onNodeDragStart={(_event, node) => {
                const data = node.data as CanvasNodeData;
                reopenActionPanelNodeRef.current =
                  (actionPanel?.nodeId === node.id || selectedUnitNode?.id === node.id) &&
                  data.kind === 'unit' &&
                  data.commitStatus === 'committed'
                    ? node.id
                    : null;
                setActionPanel(null);
              }}
              onNodeDragStop={(event, node) => {
                if (reopenActionPanelNodeRef.current === node.id) {
                  showActionPanelForNode(event, node.id);
                }
                reopenActionPanelNodeRef.current = null;
              }}
              onNodeContextMenu={handleNodeContextMenu}
              onPaneContextMenu={handlePaneContextMenu}
              onPaneClick={() => {
                // Clear active path highlight and close transient canvas overlays.
                if (highlight) {
                  setHighlight(null);
                }
                closeContextMenu();
                setActionPanel(null);
              }}
              panOnDrag={isPanMode}
              selectionOnDrag={!isPanMode}
              snapToGrid
              snapGrid={[GRID_SIZE, GRID_SIZE]}
              proOptions={{ hideAttribution: true }}
              fitView={!initialViewport}
              fitViewOptions={{ padding: compactViewport ? 0.12 : 0.3, maxZoom: 1 }}
              defaultViewport={initialViewport ?? { x: 0, y: 0, zoom: 1 }}
              onMoveStart={() => setActionPanel(null)}
              onMoveEnd={(_event, viewport) => onViewportChange?.(viewport)}
              minZoom={canvasMinZoom}
              maxZoom={2}
              onlyRenderVisibleElements={visibleNodes.length > VIRTUALIZE_AFTER}
              deleteKeyCode={['Backspace', 'Delete']}
              selectNodesOnDrag={false}
              colorMode={colorMode}
              defaultEdgeOptions={{
                type: 'animated',
                style: { strokeWidth: 2.8 },
                markerEnd: { type: 'arrowclosed' as MarkerType, width: 22, height: 22 },
              }}
            >
              {!compactViewport && (
                <MiniMap
                  nodeStrokeWidth={3}
                  nodeColor="var(--surface-card)"
                  nodeStrokeColor={(node) =>
                    node.data.commitStatus === 'staging' || node.data.pendingConversationGroup
                      ? 'var(--accent-pending)'
                      : getBranchVisual(nodeBranch(node as Node<CanvasNodeData>)).accent
                  }
                  pannable
                  zoomable
                  className={cn(
                    '!bottom-11 !right-16 !overflow-hidden !rounded-xl !border-[var(--stroke-default)] !bg-[var(--surface-elevated)] shadow-[var(--fx-shadow-sm)]'
                  )}
                  style={{
                    width: CANVAS_MINIMAP_WIDTH,
                    height: CANVAS_MINIMAP_HEIGHT,
                    backgroundColor: 'var(--surface-elevated)',
                  }}
                  maskColor={
                    colorMode === 'dark' ? 'rgba(15, 23, 42, 0.7)' : 'rgba(255, 255, 255, 0.7)'
                  }
                />
              )}
              <ZoomSlider
                compact={compactViewport}
                position="bottom-left"
                className="!bottom-11 !left-4 !rounded-xl !border-[var(--stroke-default)] !bg-[var(--surface-elevated)]/95"
              />
              <Background
                variant={BackgroundVariant.Dots}
                gap={24}
                size={1.5}
                color={colorMode === 'dark' ? 'var(--stroke-grid)' : 'var(--stroke-grid)'}
              />
            </ReactFlow>

            {/* Empty state overlay - guided 3-step onboarding card */}
            {nodes.length === 0 &&
              pendingConversations.length === 0 &&
              !canvasLoading &&
              !onboardingDismissed && (
                <CanvasOnboarding
                  onAddNode={() => {
                    void handleAddNode('unit').then((conversation) => {
                      if (conversation) openCreatedConversation(conversation);
                    });
                  }}
                  onDismiss={() => {
                    setOnboardingDismissed(true);
                    localStorage.setItem('t3x_onboarded', 'true');
                  }}
                  isAdding={isAdding}
                />
              )}
            {nodes.length === 0 && pendingConversations.length > 0 && !canvasLoading ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="rounded-xl border border-[var(--stroke-default)] bg-[var(--surface-card)]/90 px-5 py-4 text-center shadow-[var(--fx-shadow-sm)] backdrop-blur-sm">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">No commits yet</p>
                  <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                    {pendingConversations.length} pending conversation
                    {pendingConversations.length === 1 ? '' : 's'} · open the pending list above to
                    continue.
                  </p>
                </div>
              </div>
            ) : null}
            {visibleNodes.length > 0 && (
              <div className="pointer-events-none absolute left-8 top-8 z-10 hidden items-center gap-2 text-xs text-[var(--text-tertiary)] md:flex">
                <span className="font-semibold text-[var(--text-secondary)]">Version Path</span>
                <span>
                  {selectedUnitNode
                    ? 'selected commit shows source, diff, leaves, and next actions'
                    : 'select a commit on the canvas to inspect source, diff, leaves, and next actions'}
                </span>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowShortcuts(true)}
              title="Keyboard Shortcuts (?)"
              className={cn(
                'absolute bottom-10 right-4 z-20 h-8 w-8 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]',
                glass.cardBase
              )}
            >
              <HelpCircle className="h-4 w-4" />
            </Button>
            <div
              aria-label="Canvas tools"
              role="toolbar"
              className={cn(
                'absolute bottom-10 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-[var(--stroke-default)] p-1 shadow-[var(--fx-shadow-hover)]',
                glass.cardBase
              )}
            >
              <Button
                aria-label="Select tool"
                aria-pressed={!isPanMode}
                className={cn(!isPanMode && 'bg-[var(--accent-commit)] text-[var(--on-accent)]')}
                onClick={() => setIsPanMode(false)}
                size="icon-sm"
                variant="ghost"
              >
                <MousePointer2 className="size-4" />
              </Button>
              <Button
                aria-label="Pan tool"
                aria-pressed={isPanMode}
                className={cn(isPanMode && 'bg-[var(--accent-commit)] text-[var(--on-accent)]')}
                onClick={() => setIsPanMode(true)}
                size="icon-sm"
                variant="ghost"
              >
                <Hand className="size-4" />
              </Button>
              <span className="mx-0.5 h-5 w-px bg-[var(--stroke-divider)]" />
              <Button
                aria-label="Reset canvas view"
                onClick={() =>
                  void fitView({
                    padding: compactViewport ? 0.12 : 0.24,
                    maxZoom: 1,
                    duration: 240,
                  })
                }
                size="icon-sm"
                variant="ghost"
              >
                <RotateCcw className="size-4" />
              </Button>
              <Button
                aria-label="Download canvas"
                onClick={downloadCanvas}
                size="icon-sm"
                variant="ghost"
              >
                <Download className="size-4" />
              </Button>
            </div>
          </div>
          <CanvasStatusBar />
        </div>
        <CanvasSelectionPanel
          actions={selectionActionModel.actions}
          node={selectedUnitNode}
          onClose={closeInspector}
          parentNodes={selectedParentNodes}
          transitionState={transitionState}
        />
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          groups={contextMenu.groups}
          onClose={closeContextMenu}
        />
      )}
      {actionPanel && selectedUnitNode && !selectionPanelVisible && (
        <CommitActionPanel
          x={actionPanel.x}
          y={actionPanel.y}
          actions={selectionActionModel.actions}
          onClose={() => setActionPanel(null)}
        />
      )}
      {modalNode &&
        (modalNode.data.commitStatus !== 'committed' || modalViewMode === 'conversation') && (
          <NodeModal
            node={modalNode}
            onClose={closeNodeModal}
            onUpdate={(patch) => updateNode(modalNode.id, patch)}
            viewMode={modalViewMode || 'commit'}
          />
        )}
      <MergePanel />
      <DeletionConfirmDialog />
      {projectId && (
        <MemoryContextModal
          open={showMemoryModal}
          onClose={() => setShowMemoryModal(false)}
          projectId={projectId}
        />
      )}
      {projectId && (
        <ImportDialog
          open={showImportDialog}
          onOpenChange={setShowImportDialog}
          projectId={projectId}
          onImported={() => {
            setShowImportDialog(false);
            loadCanvas(projectId).catch((err) => {
              const message = formatUserFacingError(err, 'Failed to refresh canvas.');
              notify?.(message, 'error');
            });
          }}
        />
      )}

      {/* Keyboard shortcuts dialog */}
      <CanvasShortcutsDialog open={showShortcuts} onOpenChange={setShowShortcuts} />
    </div>
  );
}
