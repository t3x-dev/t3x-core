import type { ColorMode } from '@xyflow/react';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import { GitCommit, HelpCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useContextMenu } from '@/hooks/useContextMenu';
import { usePathHighlight } from '@/hooks/usePathHighlight';
import { getLayoutedElements } from '@/lib/elkLayout';
import { saveNodePosition } from '@/store/canvasStoreUtils';
import { useTerminology } from '@/hooks/useTerminology';
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
import { NodeContextMenu } from './NodeContextMenu';
import { NodePalette } from './NodePalette';
import { useBranchFilter } from './useBranchFilter';

// Custom edge types for xyflow
const edgeTypes = {
  animated: AnimatedEdge,
};

import { Button } from '@/components/ui/button';
import { ZoomSlider } from '@/components/ui/zoom-slider';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';
import { useProjectStore } from '@/store/projectStore';
import { DraftQuickSheet } from '../draft/DraftQuickSheet';
import { ImportDialog } from '../import/ImportDialog';
import { MemoryContextModal } from '../memory/MemoryContextModal';
import { CommitConflictBanner } from '../merge/CommitConflictBanner';
import { CommitConflictPanel } from '../merge/CommitConflictPanel';
import { MergePanel } from '../merge/MergePanel';
import { DeletionConfirmDialog } from './DeletionConfirmDialog';
import { LeafPanel } from './LeafPanel';
import { NodeModal, type NodeQuickAction } from './NodeModal';

const GRID_SIZE = 16;

interface CanvasWorkspaceProps {
  projectName: string;
  mode: 'editor' | 'execution';
  onModeChange: (mode: 'editor' | 'execution') => void;
  /** Initial viewport from URL params */
  initialViewport?: { x: number; y: number; zoom: number };
  /** Called when viewport changes (debounced externally) */
  onViewportChange?: (viewport: { x: number; y: number; zoom: number }) => void;
  /** Optional view switcher element rendered in the toolbar */
  viewSwitcher?: React.ReactNode;
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
  mode,
  onModeChange,
  initialViewport,
  onViewportChange,
  viewSwitcher,
}: CanvasWorkspaceProps) {
  const [isPanMode, setIsPanMode] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, getNodes, getEdges, setNodes, fitView, setCenter } = useReactFlow();
  const { resolvedTheme } = useTheme();
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [isLayouting, setIsLayouting] = useState(false);
  const { isDeveloperMode } = useTerminology();

  // Map next-themes to xyflow colorMode
  const colorMode: ColorMode = resolvedTheme === 'dark' ? 'dark' : 'light';
  const {
    nodes,
    edges,
    projectId,
    loading: canvasLoading,
    addNode,
    addDraftNode,
    updateNode,
    commitPendingCommit,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addPendingCommitFromCommit,
    addConversationFromCommit,
    saveConversationConstraints,
    getPendingCommitEffectiveConstraints,
    updatePendingCommitConstraintOverrides,
    hasDownstreamPendingCommits,
    openNodeId,
    modalViewMode,
    openNodeModal,
    closeNodeModal,
  } = useCanvasStore();
  const commitConflicts = useCanvasStore((s) => s.commitConflicts);
  const dismissedConflicts = useCanvasStore((s) => s.dismissedConflicts);
  const showConflictPanel = useCanvasStore((s) => s.showConflictPanel);
  const dismissConflict = useCanvasStore((s) => s.dismissConflict);
  const openConflictPanel = useCanvasStore((s) => s.openConflictPanel);
  const closeConflictPanel = useCanvasStore((s) => s.closeConflictPanel);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  // Sync from localStorage after mount (avoids SSR hydration mismatch)
  useEffect(() => {
    if (localStorage.getItem('t3x_onboarded') === 'true') {
      setOnboardingDismissed(true);
    }
  }, []);
  const notify = useProjectStore((state) => state.notifyCallback);

  // Extracted handlers
  const {
    handleAutoLayout,
    handleAutoExtract,
    handleAddNode,
    onDragOver,
    onDrop,
    selectAllNodes,
    deselectAllNodes,
    navigateToNode,
  } = useCanvasHandlers({
    getNodes,
    getEdges,
    setNodes,
    fitView,
    setCenter,
    screenToFlowPosition,
    canvasRef,
    projectId,
    notify,
    router,
    addNode,
    addDraftNode,
    setIsAdding,
    setIsLayouting,
  });

  // Context menu (extracted hook)
  const { contextMenu, closeContextMenu, handleNodeContextMenu, handlePaneContextMenu } =
    useContextMenu({
      addNode,
      isDeveloperMode,
      notify,
      getNodes,
      projectId,
      fitView,
      handleAutoLayout,
      onAutoExtract: handleAutoExtract,
      onNavigate: (url: string) => router.push(url),
    });

  // Path highlight (extracted hook)
  const {
    highlight,
    setHighlight,
    toggleHighlight,
    nodesForRender,
    edgesForRender,
    hasMainCommits,
    hasBranchCommits,
  } = usePathHighlight({ nodes, edges });

  // DAG auto-layout: compute topology fingerprint from node IDs + edge connections.
  // Position changes don't alter this, so ELK only runs when the graph structure changes.
  const topoFingerprint = useMemo(() => {
    const nIds = nodes.map((n) => n.id).sort().join(',');
    const eKeys = edges.map((e) => `${e.source}->${e.target}`).sort().join(',');
    return `${nIds}|${eKeys}`;
  }, [nodes, edges]);

  const hasDbPositions = useCanvasStore((s) => s.hasDbPositions);
  const [initialLayoutDone, setInitialLayoutDone] = useState(false);
  // Track the fingerprint from the previous render to detect topology changes vs initial load
  const prevTopoRef = useRef<string | null>(null);

  // DAG auto-layout:
  // - Initial load with DB positions → skip ELK, use saved positions
  // - Initial load without DB positions → run ELK + save to DB
  // - Topology change (new node/edge/delete) → always re-run ELK + save to DB
  useEffect(() => {
    const currentNodes = getNodes();
    if (currentNodes.length === 0) return;

    const isInitialLoad = prevTopoRef.current === null;
    const topoChanged = prevTopoRef.current !== null && prevTopoRef.current !== topoFingerprint;
    prevTopoRef.current = topoFingerprint;

    // Initial load with DB positions → skip ELK, just mark done
    if (isInitialLoad && hasDbPositions) {
      setInitialLayoutDone(true);
      return;
    }

    // Initial load without DB positions OR topology changed → run ELK
    let cancelled = false;
    (async () => {
      try {
        const layouted = await getLayoutedElements(currentNodes, getEdges(), {
          direction: 'DOWN',
          nodeSpacing: 80,
          rankSpacing: 120,
        });
        if (cancelled) return;
        setNodes(layouted);
        // Save ELK-computed positions to DB so next reload uses them
        for (const node of layouted) {
          saveNodePosition(node.id, (node.data as import('@/types/nodes').CanvasNodeData).kind, node.position);
        }
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            fitView({ padding: 0.2, duration: 300 });
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topoFingerprint]);

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

  const activeConflictEntry = Object.entries(commitConflicts).find(
    ([hash, report]) => report && report.conflicts.length > 0 && !dismissedConflicts[hash]
  );

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

  const { branchNames, branchFilter, setBranchFilter } = useBranchFilter({
    nodes,
    setHighlight,
  });

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <CanvasToolbar
        projectName={projectName}
        projectId={projectId}
        mode={mode}
        onModeChange={onModeChange}
        viewSwitcher={viewSwitcher}
        highlight={highlight}
        toggleHighlight={toggleHighlight}
        setHighlight={setHighlight}
        branchFilter={branchFilter}
        setBranchFilter={setBranchFilter}
        branchNames={branchNames}
        hasMainCommits={hasMainCommits}
        hasBranchCommits={hasBranchCommits}
        onAutoLayout={handleAutoLayout}
        onAddNode={() => handleAddNode('unit')}
        isLayouting={isLayouting}
        isPending={isAdding}
        nodeCount={nodes.length}
      />

      <div
        ref={canvasRef}
        className={cn(
          'relative flex-1 transition-opacity duration-300',
          isPanMode && 'cursor-grab active:cursor-grabbing',
          !initialLayoutDone && nodes.length > 0 && 'opacity-0'
        )}
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
          onNodeClick={(_, node) => {
            const data = node.data as import('@/types/nodes').CanvasNodeData;
            // Leaf nodes -> navigate to leaf detail page
            if (data.kind === 'leaf' && data.leafId && projectId) {
              router.push(`/project/${projectId}/leaf/${data.leafId}`);
              return;
            }
            // Committed commits -> navigate to full-page commit detail view
            if (data.commitStatus === 'committed' && data.commitHash && projectId) {
              router.push(`/project/${projectId}/commit/${encodeURIComponent(data.commitHash)}`);
              return;
            }
            // Staging/pending units -> navigate to chat page
            if (data.conversationId) {
              router.push(`/chat/${data.conversationId}`);
              return;
            }
            // Fallback for nodes without conversation
            openNodeModal(node.id, 'commit');
          }}
          onNodeContextMenu={handleNodeContextMenu}
          onPaneContextMenu={handlePaneContextMenu}
          onPaneClick={() => {
            // Clear node highlight and close context menu when clicking empty canvas
            if (highlight?.mode === 'node') {
              setHighlight(null);
            }
            closeContextMenu();
          }}
          panOnDrag={isPanMode}
          selectionOnDrag={!isPanMode}
          snapToGrid
          snapGrid={[GRID_SIZE, GRID_SIZE]}
          proOptions={{ hideAttribution: true }}
          fitView={!initialViewport}
          fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
          defaultViewport={initialViewport ?? { x: 0, y: 0, zoom: 1 }}
          onMoveEnd={(_event, viewport) => onViewportChange?.(viewport)}
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

        {/* Conflict detection banner */}
        {activeConflictEntry && (
          <CommitConflictBanner
            conflicts={activeConflictEntry[1]!.conflicts}
            onDismiss={() => dismissConflict(activeConflictEntry[0])}
            onViewDetails={() => openConflictPanel(activeConflictEntry[0])}
          />
        )}
      </div>

      {/* Conflict detail panel */}
      {showConflictPanel && commitConflicts[showConflictPanel] && (
        <CommitConflictPanel
          conflicts={commitConflicts[showConflictPanel]!.conflicts}
          onClose={closeConflictPanel}
        />
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          groups={contextMenu.groups}
          onClose={closeContextMenu}
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
            useCanvasStore
              .getState()
              .loadProjectData(projectId)
              .catch((err) => {
                const message = err instanceof Error ? err.message : 'Failed to refresh canvas';
                notify?.(message, 'error');
              });
          }}
        />
      )}

      {/* Keyboard shortcuts help button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setShowShortcuts(true)}
        title="Keyboard Shortcuts (?)"
        className={cn(
          'absolute bottom-11 right-4 z-10 h-8 w-8 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]',
          glass.cardBase
        )}
      >
        <HelpCircle className="h-4 w-4" />
      </Button>

      {/* Keyboard shortcuts dialog */}
      <CanvasShortcutsDialog open={showShortcuts} onOpenChange={setShowShortcuts} />
    </div>
  );
}
