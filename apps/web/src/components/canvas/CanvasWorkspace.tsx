import type { ColorMode, Node } from '@xyflow/react';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import { GitCommit, HelpCircle } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getLayoutedElements } from '@/components/canvas/elkLayout';
import { useCanvasCommitActions } from '@/hooks/canvas/useCanvasCommitActions';
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
import type { CanvasNodeData } from '@/types/nodes';
import { cn } from '@/utils/cn';
import { buildReturnTo, withReturnTo } from '@/utils/navigationReturn';
import { glass } from '@/utils/theme';
import { DraftQuickSheet } from '../draft/DraftQuickSheet';
import { ImportDialog } from '../import/ImportDialog';
import { MemoryContextModal } from '../memory/MemoryContextModal';
import { MergePanel } from '../merge/MergePanel';
import { CanvasSelectionPanel } from './CanvasSelectionPanel';
import { DeletionConfirmDialog } from './DeletionConfirmDialog';
import { LeafPanel } from './LeafPanel';
import { NodeModal, type NodeQuickAction } from './NodeModal';

const GRID_SIZE = 16;
const CANVAS_MINIMAP_WIDTH = 176;
const CANVAS_MINIMAP_HEIGHT = 96;
type CanvasUnitNode = Node<CanvasNodeData, 'unit'>;

interface CanvasWorkspaceProps {
  projectName: string;
  showChatSidebarToggle?: boolean;
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
  projectName,
  showChatSidebarToggle,
  initialViewport,
  onViewportChange,
}: CanvasWorkspaceProps) {
  const { save: saveNodePosition } = useNodePositionSaver();
  // Subscribe-based persistence of drag-induced position changes.
  // Canvas store stays pure per v2 §2.5.
  useCanvasPositionPersist();
  const [isPanMode, setIsPanMode] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [actionPanel, setActionPanel] = useState<{
    x: number;
    y: number;
    nodeId: string;
  } | null>(null);
  const reopenActionPanelNodeRef = useRef<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, getNodes, getEdges, setNodes, fitView, setCenter } = useReactFlow();
  const { resolvedTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isAdding, setIsAdding] = useState(false);
  const { isDeveloperMode } = useTerminology();
  const compactViewport = useCompactViewport();
  const selectionPanelVisible = useCompactViewport('(min-width: 1280px)');
  const canvasMinZoom = compactViewport ? 0.55 : 0.25;
  const currentReturnTo = useMemo(
    () => buildReturnTo(pathname, searchParams),
    [pathname, searchParams]
  );
  const introDemoActive = searchParams.get('introDemo') === '1';
  const introDemoLeafReturnTo = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('introDemo', '1');
    params.set('introDemoStage', 'leaf');
    return buildReturnTo(pathname, params);
  }, [pathname, searchParams]);
  const withIntroDemo = useCallback(
    (href: string) => {
      if (!introDemoActive) return href;
      return href.includes('?') ? `${href}&introDemo=1` : `${href}?introDemo=1`;
    },
    [introDemoActive]
  );

  // Map next-themes to xyflow colorMode
  const colorMode: ColorMode = resolvedTheme === 'dark' ? 'dark' : 'light';
  const {
    nodes,
    edges,
    projectId,
    loading: canvasLoading,
    updateNode,
    commitPendingCommit,
    onNodesChange,
    onEdgesChange,
    onConnect,
    saveConversationConstraints,
    getPendingCommitEffectiveConstraints,
    updatePendingCommitConstraintOverrides,
    hasDownstreamPendingCommits,
    openNodeId,
    modalViewMode,
    openNodeModal,
    closeNodeModal,
    openLeafPanel,
  } = useCanvasStore();
  const { load: loadCanvas, refresh: refreshCanvasLeaves, add: addNode } = useCanvasNodeActions();
  const { addConversationFromCommit, startMerge } = useCanvasCommitActions();
  const hasMainCommit = useCanvasStore((state) => state.hasMainCommit);
  const getCommitTone = useCanvasStore((state) => state.getCommitTone);
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
      projectId,
      fitView,
      onNavigate: (url: string) => router.push(url),
      returnTo: currentReturnTo,
    });

  // Path highlight (extracted hook)
  const { highlight, setHighlight, nodesForRender, edgesForRender } = usePathHighlight({
    nodes,
    edges,
  });

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
      nodes.every((node) => node.data.kind === 'unit' && node.data.commitStatus === 'committed'),
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
          onClick: async () => {
            await addConversationFromCommit(modalNode.id);
            // Find the newly created node (last node with staging status)
            const nodes = useCanvasStore.getState().nodes;
            const newNode = nodes.find(
              (n) =>
                n.data.kind === 'unit' &&
                n.data.commitStatus === 'staging' &&
                n.data.sourceCommitHash === modalNode.data.commitHash
            );
            if (newNode?.data.conversationId) {
              router.push(`/chat/${newNode.data.conversationId}`);
            }
          },
        },
      ];
    }
    return undefined;
  }, [modalNode, addConversationFromCommit, router]);

  const selectedUnitNode = useMemo<CanvasUnitNode | null>(() => {
    const actionNode = actionPanel
      ? nodes.find((node) => node.id === actionPanel.nodeId)
      : undefined;
    const selectedNode = nodes.find(
      (node) => node.selected && node.data.kind === 'unit' && node.data.commitStatus === 'committed'
    );
    const node = actionNode ?? selectedNode;
    if (!node || node.data.kind !== 'unit' || node.data.commitStatus !== 'committed') {
      return null;
    }
    return node as CanvasUnitNode;
  }, [actionPanel, nodes]);

  const buildNodeActionModel = (node: CanvasUnitNode | null) => {
    if (!node) {
      return { actions: [], canMerge: false, hash: '', parentHash: undefined };
    }
    const hash = node.data.commitHash ?? node.data.commit?.hash ?? '';
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
    const panelTone = getCommitTone(node.id);
    const firstLeaf = node.data.leaves?.[0];
    const canMerge =
      node.data.branchType === 'branch' &&
      node.data.commitStatus === 'committed' &&
      panelTone === 'branch-latest' &&
      hasMainCommit;

    return {
      actions: buildCommitActions({
        onViewDetails: () => {
          if (projectId && hash) {
            const detailHref = `/project/${projectId}/commit/${encodeURIComponent(hash)}`;
            router.push(
              introDemoActive
                ? withReturnTo(
                    `${detailHref}?introDemo=1&introDemoStage=commitDetails`,
                    introDemoLeafReturnTo
                  )
                : detailHref
            );
          }
        },
        onViewDiff:
          parentHash && projectId && hash
            ? () => {
                const query = new URLSearchParams({
                  base: parentHash,
                  target: hash,
                });
                router.push(
                  withIntroDemo(
                    withReturnTo(`/project/${projectId}/diff?${query.toString()}`, currentReturnTo)
                  )
                );
              }
            : undefined,
        onOpenLeaf:
          firstLeaf?.id && projectId
            ? () => {
                router.push(
                  withIntroDemo(
                    `/chat/project/${encodeURIComponent(projectId)}/leaf/${encodeURIComponent(
                      firstLeaf.id
                    )}`
                  )
                );
              }
            : undefined,
        onCreateLeaf: () => {
          openLeafPanel(node.id);
        },
        onMerge:
          canMerge && projectId
            ? () => {
                void (async () => {
                  const draftId = await startMerge(node.id);
                  if (draftId) {
                    router.push(
                      withReturnTo(`/project/${projectId}/merge/${draftId}`, currentReturnTo)
                    );
                  }
                })();
              }
            : undefined,
      }),
      canMerge,
      hash,
      parentHash,
    };
  };

  const selectionActionModel = buildNodeActionModel(selectedUnitNode);

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
    router,
    projectId,
    setIsPanMode,
    setShowShortcuts,
  });

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <CanvasToolbar
        projectName={projectName}
        showChatSidebarToggle={showChatSidebarToggle}
        onFitView={() =>
          fitView({ padding: compactViewport ? 0.12 : 0.3, maxZoom: 1, duration: 300 })
        }
      />

      <div className="flex min-h-0 flex-1">
        <div
          ref={canvasRef}
          data-intro-target="project-canvas"
          className={cn(
            'relative min-w-0 flex-1 transition-opacity duration-300',
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
            nodes={nodesForRender}
            edges={edgesForRender}
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

              // Leaf nodes -> navigate to leaf detail page (always single click)
              if (data.kind === 'leaf' && data.leafId && projectId) {
                router.push(
                  `/chat/project/${encodeURIComponent(projectId)}/leaf/${encodeURIComponent(
                    data.leafId
                  )}`
                );
                return;
              }

              // Staging/pending units -> navigate to chat page (always single click)
              if (data.commitStatus !== 'committed') {
                if (data.conversationId) {
                  router.push(`/chat/${data.conversationId}`);
                } else {
                  openNodeModal(node.id, 'commit');
                }
                return;
              }

              // Committed nodes: single click = action panel. Details opens the commit page.
              if (!compactViewport) {
                if (data.branchType === 'branch') {
                  setHighlight({ branch: data.branchName, mode: 'branch' });
                } else {
                  setHighlight({ mode: 'node', nodeId: node.id });
                }
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
            deleteKeyCode={['Backspace', 'Delete']}
            selectNodesOnDrag={false}
            colorMode={colorMode}
            defaultEdgeOptions={{
              type: 'animated',
              style: { strokeWidth: 2 },
            }}
          >
            {!compactViewport && (
              <MiniMap
                nodeStrokeWidth={3}
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
              variant={BackgroundVariant.Lines}
              gap={32}
              size={1}
              color={colorMode === 'dark' ? 'var(--stroke-grid)' : 'var(--stroke-grid)'}
            />
          </ReactFlow>

          {/* Empty state overlay - guided 3-step onboarding card */}
          {nodes.length === 0 && !canvasLoading && !onboardingDismissed && (
            <CanvasOnboarding
              onAddNode={() => handleAddNode('unit')}
              onDismiss={() => {
                setOnboardingDismissed(true);
                localStorage.setItem('t3x_onboarded', 'true');
              }}
              isAdding={isAdding}
            />
          )}
          {nodes.length > 0 && (
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
        </div>
        <CanvasSelectionPanel
          actions={selectionActionModel.actions}
          canMerge={selectionActionModel.canMerge}
          node={selectedUnitNode}
          parentHash={selectionActionModel.parentHash}
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
          actions={selectionActionModel.actions.filter((action) => action.label !== 'View Diff')}
          onClose={() => setActionPanel(null)}
        />
      )}
      <CanvasStatusBar />
      {modalNode &&
        modalNode.data.commitStatus === 'draft' &&
        modalNode.data.draftId &&
        projectId && (
          <DraftQuickSheet
            open
            onClose={closeNodeModal}
            draftId={modalNode.data.draftId}
            projectId={projectId}
          />
        )}
      {modalNode && modalNode.data.commitStatus !== 'draft' && (
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
