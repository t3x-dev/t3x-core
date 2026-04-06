import type { ColorMode } from '@xyflow/react';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import { motion } from 'framer-motion';
import {
  FileOutput,
  GitCommit,
  GitCommitHorizontal,
  HelpCircle,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useContextMenu } from '@/hooks/useContextMenu';
import { usePathHighlight } from '@/hooks/usePathHighlight';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTerminology } from '@/hooks/useTerminology';
import '@xyflow/react/dist/style.css';
import { useTheme } from 'next-themes';
import { AnimatedEdge } from './AnimatedEdge';
import { useCanvasKeyboardShortcuts } from './CanvasKeyboardShortcuts';
import { canvasNodeTypes } from './CanvasNodes';
import { CanvasStatusBar } from './CanvasStatusBar';
import { CanvasToolbar } from './CanvasToolbar';
import { useCanvasHandlers } from './CanvasWorkspaceHandlers';
import { NodeContextMenu } from './NodeContextMenu';
import { NodePalette } from './NodePalette';

// Custom edge types for xyflow
const edgeTypes = {
  animated: AnimatedEdge,
};

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ZoomSlider } from '@/components/ui/zoom-slider';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';
import { useProjectStore } from '@/store/projectStore';
import { DraftQuickSheet } from '../draft/DraftQuickSheet';
import { ImportDialog } from '../import/ImportDialog';
import { MemoryContextModal } from '../memory/MemoryContextModal';
import { MergePanel } from '../merge/MergePanel';
import { CommitConflictBanner } from '../merge/CommitConflictBanner';
import { CommitConflictPanel } from '../merge/CommitConflictPanel';
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
  const [branchFilter, setBranchFilter] = useState<'all' | string>('all');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, getNodes, getEdges, setNodes, fitView, setCenter } = useReactFlow();
  const { resolvedTheme } = useTheme();
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [isLayouting, setIsLayouting] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const { t, isDeveloperMode } = useTerminology();

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

  const branchNames = useMemo(() => {
    const names = new Set<string>();
    for (const node of nodes) {
      if (node.data.kind === 'unit' && node.data.branchType === 'branch' && node.data.branchName) {
        names.add(node.data.branchName);
      }
    }
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
      // Use queueMicrotask to batch state updates after current render cycle
      queueMicrotask(() => {
        setBranchFilter('all');
        setHighlight((current) => (current?.mode === 'branch' ? null : current));
      });
    }
  }, [branchFilter, branchNames, setHighlight]);

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
        onShowMemoryModal={() => setShowMemoryModal(true)}
        onShowImportDialog={() => setShowImportDialog(true)}
        onAutoLayout={handleAutoLayout}
        onAddNode={() => handleAddNode('unit')}
        isLayouting={isLayouting}
        isPending={isAdding}
        nodeCount={nodes.length}
      />

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
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <Card
              className={cn(
                'pointer-events-auto border-dashed border-2 border-[var(--stroke-default)]/60 px-10 py-8 max-w-lg',
                glass.cardBase,
                glass.highlight
              )}
            >
              <p className="text-lg font-semibold text-[var(--text-primary)] mb-[var(--space-section)]">
                Get started with T3X
              </p>
              <div className="flex flex-col gap-5">
                {[
                  {
                    icon: MessageSquare,
                    title: 'Add Conversation',
                    desc: 'Start by adding a conversation to extract knowledge from',
                  },
                  {
                    icon: GitCommitHorizontal,
                    title: 'Extract Knowledge',
                    desc: `${t('commitAction')} semantic content from your conversations`,
                  },
                  {
                    icon: FileOutput,
                    title: 'Create Outputs',
                    desc: 'Generate outputs for different platforms',
                  },
                ].map((step, i) => (
                  <div key={step.title} className="flex items-start gap-4 text-left">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-commit)] text-white text-sm font-bold">
                      {i + 1}
                    </div>
                    <div className="flex items-start gap-3">
                      <motion.div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-commit)]/10"
                        animate={prefersReducedMotion ? undefined : { y: [0, -2, 0] }}
                        transition={
                          prefersReducedMotion
                            ? undefined
                            : {
                                duration: 3,
                                delay: i * 0.5,
                                ease: 'easeInOut',
                              }
                        }
                      >
                        <step.icon className="h-5 w-5 text-[var(--accent-commit)]" />
                      </motion.div>
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {step.title}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">{step.desc}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex items-center justify-center gap-3">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => handleAddNode('unit')}
                  disabled={isAdding}
                  className="gap-1.5"
                >
                  {isAdding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MessageSquarePlus className="h-4 w-4" />
                  )}
                  Create Your First Conversation
                </Button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOnboardingDismissed(true);
                  localStorage.setItem('t3x_onboarded', 'true');
                }}
                className="mt-3 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
              >
                Don&apos;t show again
              </button>
            </Card>
          </div>
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
      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className={cn('sm:max-w-md rounded-2xl', glass.cardBase, glass.highlight)}>
          <DialogHeader>
            <DialogTitle className="text-[var(--text-primary)]">Keyboard Shortcuts</DialogTitle>
          </DialogHeader>
          <div className="space-y-[var(--space-group)] py-2">
            {/* Navigation */}
            <div>
              <h4 className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-[var(--space-item)]">
                Navigation
              </h4>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-secondary)]">Show this help</span>
                  <kbd className="rounded border border-[var(--stroke-divider)] bg-[var(--hover-bg)] px-1.5 py-0.5 text-xs font-mono text-[var(--text-secondary)]">
                    ?
                  </kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-secondary)]">Command palette</span>
                  <kbd className="rounded border border-[var(--stroke-divider)] bg-[var(--hover-bg)] px-1.5 py-0.5 text-xs font-mono text-[var(--text-secondary)]">
                    {'\u2318'}K
                  </kbd>
                </div>
              </div>
            </div>
            <div className="h-px bg-[var(--stroke-divider)]" />
            {/* Canvas */}
            <div>
              <h4 className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-[var(--space-item)]">
                Canvas
              </h4>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-secondary)]">Select all</span>
                  <div className="flex items-center gap-1">
                    <kbd className="rounded border border-[var(--stroke-divider)] bg-[var(--hover-bg)] px-1.5 py-0.5 text-xs font-mono text-[var(--text-secondary)]">
                      {'\u2318'}A
                    </kbd>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-secondary)]">Deselect all</span>
                  <kbd className="rounded border border-[var(--stroke-divider)] bg-[var(--hover-bg)] px-1.5 py-0.5 text-xs font-mono text-[var(--text-secondary)]">
                    Escape
                  </kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-secondary)]">Cycle nodes</span>
                  <div className="flex items-center gap-1">
                    <kbd className="rounded border border-[var(--stroke-divider)] bg-[var(--hover-bg)] px-1.5 py-0.5 text-xs font-mono text-[var(--text-secondary)]">
                      Tab
                    </kbd>
                    <span className="text-[10px] text-[var(--text-tertiary)]">/</span>
                    <kbd className="rounded border border-[var(--stroke-divider)] bg-[var(--hover-bg)] px-1.5 py-0.5 text-xs font-mono text-[var(--text-secondary)]">
                      {'\u21E7'}Tab
                    </kbd>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-secondary)]">Navigate nodes</span>
                  <kbd className="rounded border border-[var(--stroke-divider)] bg-[var(--hover-bg)] px-1.5 py-0.5 text-xs font-mono text-[var(--text-secondary)]">
                    Arrow keys
                  </kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-secondary)]">Open node</span>
                  <kbd className="rounded border border-[var(--stroke-divider)] bg-[var(--hover-bg)] px-1.5 py-0.5 text-xs font-mono text-[var(--text-secondary)]">
                    Enter
                  </kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-secondary)]">Toggle pan mode</span>
                  <kbd className="rounded border border-[var(--stroke-divider)] bg-[var(--hover-bg)] px-1.5 py-0.5 text-xs font-mono text-[var(--text-secondary)]">
                    Space
                  </kbd>
                </div>
              </div>
            </div>
            <div className="h-px bg-[var(--stroke-divider)]" />
            {/* Actions */}
            <div>
              <h4 className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-[var(--space-item)]">
                Actions
              </h4>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-secondary)]">Delete selected node</span>
                  <div className="flex items-center gap-1">
                    <kbd className="rounded border border-[var(--stroke-divider)] bg-[var(--hover-bg)] px-1.5 py-0.5 text-xs font-mono text-[var(--text-secondary)]">
                      {'\u232B'}
                    </kbd>
                    <span className="text-[10px] text-[var(--text-tertiary)]">/</span>
                    <kbd className="rounded border border-[var(--stroke-divider)] bg-[var(--hover-bg)] px-1.5 py-0.5 text-xs font-mono text-[var(--text-secondary)]">
                      Del
                    </kbd>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-secondary)]">Toggle sidebar</span>
                  <kbd className="rounded border border-[var(--stroke-divider)] bg-[var(--hover-bg)] px-1.5 py-0.5 text-xs font-mono text-[var(--text-secondary)]">
                    {'\u2318'}\
                  </kbd>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
