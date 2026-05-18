import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  FileText,
  GitBranch,
  GitCommit,
  Globe,
  MessageSquare,
  MessageSquarePlus,
  Pencil,
  PenSquare,
  Plus,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AutoDraftBadge } from '@/components/canvas/AutoDraftBadge';
import { SealAnimation } from '@/components/canvas/SealAnimation';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCanvasCommitActions } from '@/hooks/canvas/useCanvasCommitActions';
import { useCanvasLeafActions } from '@/hooks/canvas/useCanvasLeafActions';
import { useCanvasNodeActions } from '@/hooks/canvas/useCanvasNodeActions';
import { useConversationContext } from '@/hooks/conversations/useConversationContext';
import { leafContextMenuHandlerRef } from '@/hooks/shared/useContextMenu';
import { useReducedMotion } from '@/hooks/shared/useReducedMotion';
import { useTerminology } from '@/hooks/shared/useTerminology';
import { useCanvasStore } from '@/store/canvasStore';
import { usePinsStore } from '@/store/pinsStore';
import { useProjectStore } from '@/store/projectStore';
import type { CanvasNodeData, EmbeddedLeaf } from '@/types/nodes';
import { cn } from '@/utils/cn';
import { nodeEnter, reducedMotion } from '@/utils/motion';
import { glass, toneAccent, toneGlow } from '@/utils/theme';

import { constellationColors, getToneAccentKey, useSemanticZoom } from './CanvasNodeUtils';
import { NodeLeavesSection } from './NodeLeavesSection';
import { getNextStep, NodeDetailsSection, NodeSourcesHeader, NodeToolbar } from './node-parts';

// Re-export LEAF_TYPES for backward compatibility
export { LEAF_TYPES } from './CanvasNodeUtils';

// Define custom node type for React Flow v12
type CanvasNode = Node<CanvasNodeData, 'canvas'>;

type Props = NodeProps<CanvasNode>;

// Handle styles - uses CSS variables for theming
const targetHandleStyle = {
  width: 22,
  height: 14,
  borderRadius: 8,
  background: 'var(--surface-card)',
  border: '3px solid var(--text-tertiary)',
  top: '50%',
  transform: 'translateY(-50%)',
  left: -6,
};

const sourceHandleStyle = {
  width: 18,
  height: 18,
  borderRadius: 999,
  background: 'var(--surface-card)',
  border: '3px solid var(--text-tertiary)',
  top: '50%',
  transform: 'translateY(-50%)',
  right: -9,
};

// Unit Node - 3-Section Layout: Sources → Commit → Leaves
const UnitNode = memo(function UnitNode(props: Props) {
  const { data, selected, id } = props;
  const [leavesExpanded, setLeavesExpanded] = useState(false);
  const [contentExpandedManual, setContentExpandedManual] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const router = useRouter();
  const params = useParams();
  const projectId = params?.projectId as string | undefined;
  const prefersReducedMotion = useReducedMotion();
  const zoomTier = useSemanticZoom();
  const isConstellation = zoomTier === 'overview';
  // Detail expansion is user-initiated only (click "Details"), not zoom-driven
  const isDetail = false;
  const contentExpanded = contentExpandedManual;

  const { t } = useTerminology();
  const tone = useCanvasStore((state) => state.getCommitTone(id));
  const {
    addConversationFromCommit,
    startMerge: startMergeFromCommit,
    renameCommit,
  } = useCanvasCommitActions();
  const hasMainCommit = useCanvasStore((state) => state.hasMainCommit);
  const openLeafPanel = useCanvasStore((state) => state.openLeafPanel);
  const { remove: removeLeafFromNode } = useCanvasLeafActions();
  // Read from module-level ref to avoid Zustand re-renders on every callback update
  const leafContextMenuHandler = leafContextMenuHandlerRef.current;
  const openNodeModal = useCanvasStore((state) => state.openNodeModal);
  const { load: loadProjectData } = useCanvasNodeActions();
  const updateNode = useCanvasStore((state) => state.updateNode);
  const notify = useProjectStore((state) => state.notifyCallback);

  // Pin store
  const { isPinned } = usePinsStore();

  // Context config — loaded per-conversation (skipped for virtual orphan conversations)
  const { contextConfig } = useConversationContext(data.conversationId, {
    enabled: !!data.conversationId && !data.conversationId.startsWith('orphan-'),
  });

  // Context label helper
  const getContextLabel = (): string | null => {
    if (!contextConfig) return null;
    if (contextConfig.selected_pin_ids === null) return '[all]';
    if (contextConfig.selected_pin_ids.length === 0) return '[none]';
    return `[${contextConfig.selected_pin_ids.length} context]`;
  };

  // Assertion totals for leaves header
  const totalPassed = data.leaves?.reduce((sum, l) => sum + (l.passedCount || 0), 0) || 0;
  const totalFailed = data.leaves?.reduce((sum, l) => sum + (l.failedCount || 0), 0) || 0;
  const totalAssertions = totalPassed + totalFailed;

  // Check if commit is in staging state
  const isStaging = data.commitStatus === 'staging';
  const isCommitted = data.commitStatus === 'committed';
  const isDraft = data.commitStatus === 'draft';

  const branchLabel = data.branchType === 'branch' ? data.branchName?.trim() || 'branch' : 'MAIN';

  // Map tone to accent system
  const toneKey = isStaging || isDraft ? 'staging' : tone || 'default';
  const accentKey = getToneAccentKey(toneKey);

  // Dark mode semantic glow (CSS uses .dark ancestor selector)
  const nodeGlowClass = isCommitted
    ? 'node-glow-committed'
    : isStaging || isDraft
      ? 'node-glow-pending'
      : '';

  // Seal animation — triggers on staging → committed transition
  const prevStatusRef = useRef(data.commitStatus);
  const [sealing, setSealing] = useState(false);
  const nodeRef = useRef<HTMLDivElement>(null);
  const [nodeHeight, setNodeHeight] = useState(160);

  useEffect(() => {
    if (prevStatusRef.current === 'staging' && data.commitStatus === 'committed') {
      setSealing(true);
    }
    prevStatusRef.current = data.commitStatus;
  }, [data.commitStatus]);

  useEffect(() => {
    if (!nodeRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setNodeHeight(entry.contentRect.height);
    });
    ro.observe(nodeRef.current);
    return () => ro.disconnect();
  }, []);

  const handleAddUnit = async () => {
    try {
      await addConversationFromCommit(id);
      // Find the newly created node and navigate to chat
      const nodes = useCanvasStore.getState().nodes;
      const newNode = nodes.find(
        (n) =>
          n.data.kind === 'unit' &&
          n.data.commitStatus === 'staging' &&
          n.data.sourceCommitHash === data.commitHash
      );
      if (newNode?.data.conversationId) {
        router.push(`/chat/${newNode.data.conversationId}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create unit';
      notify?.(message, 'error');
    }
  };

  const canTriggerMerge = data.branchType === 'branch' && tone === 'branch-latest' && hasMainCommit;
  const handleMerge = async () => {
    if (!canTriggerMerge || !projectId) {
      return;
    }
    const draftId = await startMergeFromCommit(id);
    if (draftId) {
      // Navigate to Merge Workspace
      router.push(`/project/${projectId}/merge/${draftId}`);
    }
  };

  // Copy commit hash to clipboard
  const handleCopyHash = (e: React.MouseEvent) => {
    e.stopPropagation();
    const hash = data.commit?.hash || data.commitHash || data.entryId || '';
    navigator.clipboard
      .writeText(hash)
      .then(() => {
        setCopiedHash(true);
        setTimeout(() => setCopiedHash(false), 2000);
      })
      .catch(() => {}); // Silently fail on clipboard permission denial
  };

  const handleTitleSave = useCallback(async () => {
    const newTitle = editTitle.trim();
    if (!newTitle || newTitle === data.title) {
      setIsEditingTitle(false);
      return;
    }
    updateNode(id, { title: newTitle });
    setIsEditingTitle(false);
    if (data.commitHash) {
      try {
        await renameCommit(data.commitHash, newTitle);
      } catch {
        updateNode(id, { title: data.title });
      }
    }
  }, [editTitle, data.title, data.commitHash, id, updateNode, renameCommit]);

  // Navigate to leaf detail page
  const _getLeafHref = (leaf: EmbeddedLeaf): string | undefined => {
    if (!projectId || !leaf.id) return undefined;
    return `/project/${projectId}/leaf/${leaf.id}`;
  };

  // B-4: Next Step button logic
  const nextStep = getNextStep({
    isDraft,
    isStaging,
    isCommitted,
    draftId: data.draftId,
    projectId,
    conversationId: data.conversationId,
    nodeId: id,
    t,
    icons: { PenSquare, MessageSquarePlus, GitCommit, Plus },
    actions: {
      navigateToDraft: (pId, dId) => router.push(`/project/${pId}/draft/${dId}`),
      openNodeModal,
      openLeafPanel,
    },
  });
  const nextStepToneClass = isCommitted
    ? 'bg-[var(--accent-leaf-soft)] text-[var(--accent-leaf)] hover:bg-[var(--accent-leaf)]/15'
    : isStaging && data.conversationId
      ? 'bg-[var(--accent-commit-soft)] text-[var(--accent-commit)] hover:bg-[var(--accent-commit)]/15'
      : isStaging
        ? 'bg-[var(--accent-conversation-soft)] text-[var(--accent-conversation)] hover:bg-[var(--accent-conversation)]/15'
        : 'bg-[var(--accent-pending-soft)] text-[var(--accent-pending)] hover:bg-[var(--accent-pending)]/15';

  // B-8: Compute stats for collapsed view
  const nodeCount = isDraft
    ? 0 // Draft shows its own summary in title area
    : data.commit
      ? (data.commit.content?.trees?.length ?? 0)
      : 0;

  // Constellation mode — render minified dot at low zoom
  if (isConstellation) {
    const dotType = isDraft
      ? 'staging'
      : isStaging
        ? 'staging'
        : isCommitted
          ? 'committed'
          : 'conversation';
    const color = constellationColors[dotType] || constellationColors.committed;
    return (
      <>
        <Handle
          type="target"
          position={Position.Left}
          style={{ opacity: 0, width: 1, height: 1 }}
        />
        <div
          className="constellation-dot"
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            backgroundColor: color,
            boxShadow: `0 0 8px color-mix(in srgb, ${color} 28%, transparent), 0 0 2px color-mix(in srgb, ${color} 55%, transparent)`,
            transition: 'box-shadow 0.3s ease',
          }}
          role="treeitem"
          tabIndex={0}
          aria-label={`${data.title} (minified)`}
          aria-selected={selected}
        />
        <Handle
          type="source"
          position={Position.Right}
          style={{ opacity: 0, width: 1, height: 1 }}
        />
      </>
    );
  }

  return (
    <>
      <Handle type="target" position={Position.Left} style={targetHandleStyle} />

      <motion.div
        ref={nodeRef}
        variants={prefersReducedMotion ? reducedMotion.scaleIn : nodeEnter}
        initial="initial"
        animate={sealing && !prefersReducedMotion ? { scale: [1, 1.06, 1] } : 'animate'}
        exit="exit"
        transition={
          sealing && !prefersReducedMotion
            ? {
                duration: 0.4,
                times: [0, 0.35, 1],
                ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number],
              }
            : undefined
        }
        whileHover={
          prefersReducedMotion
            ? undefined
            : { y: -1, transition: { duration: 0.15, ease: [0.16, 1, 0.3, 1] } }
        }
        whileTap={prefersReducedMotion ? undefined : { scale: 0.995 }}
        className={cn(
          'relative group w-72 rounded-xl overflow-visible elevation-1',
          glass.cardNode,
          glass.highlight,
          // Draft: dashed amber border
          isDraft && 'border-dashed border-2 border-[var(--accent-pending)]/70',
          // Left accent line (non-draft)
          !isDraft && 'border-l-2',
          isStaging && !isDraft && 'border-t-transparent border-r-transparent border-b-transparent',
          accentKey === 'commit' && 'border-l-[var(--accent-commit)]',
          accentKey === 'branch' && 'border-l-[var(--accent-branch)]',
          accentKey === 'pending' && 'border-l-[var(--accent-pending)]',
          // Hover
          'hover:shadow-[var(--fx-shadow-hover)]',
          // Selected state
          selected && cn('ring-2', toneAccent[accentKey].ring),
          // Highlight overrides
          data.highlightMode === 'main' && 'ring-2 ring-[var(--accent-commit)]/50',
          data.highlightMode === 'branch' && 'ring-2 ring-[var(--accent-branch)]/50',
          data.highlightMode === 'node' && 'ring-2 ring-[var(--accent-commit)]/50',
          nodeGlowClass
        )}
        style={{
          willChange: 'transform',
          ...(selected ? { boxShadow: toneGlow[accentKey as keyof typeof toneGlow] } : {}),
          ...(data.dimmed
            ? { opacity: 0.3, transition: 'opacity 200ms ease' }
            : { transition: 'opacity 200ms ease' }),
        }}
        role="treeitem"
        aria-label={`${data.title} — ${isDraft ? t('draft') : isStaging ? t('draft') : t('committed')} on ${branchLabel}${nodeCount > 0 ? `, ${nodeCount} trees` : ''}`}
        aria-selected={selected}
        data-node-type={isDraft ? 'draft' : isStaging ? 'conversation' : 'commit'}
        tabIndex={0}
      >
        {/* Staging border — static dashed outline */}
        {isStaging && (
          <div
            className="pointer-events-none absolute inset-0 rounded-[16px] border-2 border-dashed border-[var(--accent-pending)]/60"
            style={{ zIndex: 1 }}
          />
        )}

        {/* Seal animation overlay */}
        <SealAnimation
          width={288}
          height={nodeHeight}
          borderRadius={16}
          isActive={sealing}
          onComplete={() => setSealing(false)}
        />

        {/* ═══════════════════════════════════════════
            SECTION 1: SOURCES (if any)
            ═══════════════════════════════════════════ */}
        {data.sources && data.sources.length > 0 && (
          <NodeSourcesHeader
            sources={data.sources}
            contextLabel={getContextLabel()}
            isPinned={isPinned}
            onOpenModal={() => openNodeModal(id, 'conversation')}
          />
        )}

        {/* ═══════════════════════════════════════════
            SECTION 2: COMMIT (main content)
            ═══════════════════════════════════════════ */}
        <div className="px-3 py-3">
          {/* Row 1: Title + Branch Badge */}
          <div className="flex items-start justify-between gap-2 mb-[var(--space-item)]">
            {isEditingTitle ? (
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleTitleSave();
                  if (e.key === 'Escape') setIsEditingTitle(false);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onBlur={handleTitleSave}
                className="noDrag nowheel m-0 text-sm font-semibold text-[var(--text-primary)] leading-snug flex-1 min-w-0 bg-transparent border-b border-[var(--commit)] outline-none"
                data-title-editable
                // biome-ignore lint/a11y/noAutofocus: intentional — user just entered edit mode
                autoFocus
              />
            ) : (
              <div className="flex items-center gap-1 flex-1 min-w-0 group/title">
                <h4 className="m-0 text-sm font-semibold text-[var(--text-primary)] leading-snug flex-1 min-w-0 truncate">
                  {data.title}
                </h4>
                {isCommitted && (
                  <button
                    type="button"
                    data-title-editable
                    className="shrink-0 p-0.5 rounded opacity-0 group-hover/title:opacity-60 hover:!opacity-100 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditTitle(data.title);
                      setIsEditingTitle(true);
                    }}
                    title="Rename commit"
                  >
                    <Pencil size={10} />
                  </button>
                )}
              </div>
            )}
            {isDraft ? (
              <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-[var(--accent-pending)]/50 text-[var(--accent-pending)] bg-[var(--accent-pending-soft)] inline-flex items-center gap-0.5">
                <PenSquare size={10} aria-hidden="true" />
                DRAFT
                <span className="sr-only">Status: draft</span>
              </span>
            ) : (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        'flex-shrink-0 max-w-[80px] truncate text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-transparent inline-flex items-center gap-0.5',
                        data.branchType === 'main'
                          ? cn(toneAccent.commit.border, toneAccent.commit.text)
                          : cn(toneAccent.branch.border, toneAccent.branch.text)
                      )}
                    >
                      {data.branchType === 'main' ? (
                        <GitCommit size={10} />
                      ) : (
                        <GitBranch size={10} />
                      )}
                      {branchLabel}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {branchLabel}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          {/* Row 2: Self hash (committed only) */}
          {isCommitted && (data.commit?.hash || data.commitHash) && (
            <div className="font-mono text-[11px] text-[var(--text-tertiary)] mb-1">
              {(data.commit?.hash || data.commitHash || '').replace('sha256:', 'sha:').slice(0, 11)}
            </div>
          )}

          {/* B-8: Stats line (always visible in collapsed view) */}
          {nodeCount > 0 && (
            <div className="text-xs text-[var(--text-secondary)] mb-[var(--space-item)]">
              {nodeCount} tree{nodeCount !== 1 ? 's' : ''}
            </div>
          )}

          {/* Import source badge */}
          {data.importSource && (
            <div className="flex items-center gap-1 mb-[var(--space-item)]">
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-[var(--status-info)]/30 text-[var(--status-info)] bg-[var(--status-info-muted)]">
                {data.importSource.source_type === 'url' ? (
                  <Globe size={10} />
                ) : data.importSource.source_type === 'platform' ? (
                  <MessageSquare size={10} />
                ) : (
                  <FileText size={10} />
                )}
                {data.importSource.source_type === 'platform' && data.importSource.platform
                  ? data.importSource.platform
                  : data.importSource.source_type === 'url'
                    ? 'URL Import'
                    : 'Doc Import'}
              </span>
            </div>
          )}

          {/* Auto-draft badge (conversation nodes with available auto-draft) */}
          {isStaging && data.autoDraftId && (
            <div className="flex items-center gap-1 mb-[var(--space-item)]">
              <AutoDraftBadge
                autoDraftId={data.autoDraftId}
                onPromoted={() => {
                  if (projectId) loadProjectData(projectId);
                }}
              />
            </div>
          )}

          {/* B-4: Next Step button */}
          {nextStep && (
            <button
              type="button"
              data-action="next-step"
              className={cn(
                'w-full flex items-center justify-center gap-1.5 px-3 py-1.5 mb-[var(--space-item)] rounded-md text-xs font-medium transition-colors nodrag',
                nextStepToneClass
              )}
              onClick={(e) => {
                e.stopPropagation();
                nextStep.action();
              }}
            >
              <nextStep.icon size={12} />
              <span>{nextStep.label}</span>
              <ArrowRight size={10} />
            </button>
          )}

          {/* B-8: Details toggle */}
          {(data.commit || data.commitHash) && (
            <button
              type="button"
              className="w-full flex items-center justify-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] py-1 rounded hover:bg-[var(--hover-bg)] transition-colors nodrag"
              onClick={(e) => {
                e.stopPropagation();
                setContentExpandedManual((prev) => !prev);
              }}
            >
              <span>Details</span>
              {contentExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          )}

          {/* B-8: Expandable detail content */}
          {contentExpanded && (
            <NodeDetailsSection
              hashDisplay={(data.commit?.hash || data.commitHash || data.entryId || '')
                .replace('sha256:', 'sha:')
                .slice(0, 11)}
              copiedHash={copiedHash}
              onCopyHash={handleCopyHash}
              isMergeCommit={data.isMergeCommit}
              mergeSummary={data.commit?.merge_summary}
              isStaging={isStaging}
              branchType={data.branchType}
              summary={data.summary}
              mustHaveCount={data.mustHave?.length || 0}
              mustntHaveCount={data.mustntHave?.length || 0}
              commit={data.commit}
              isDetail={isDetail}
              projectId={projectId}
              onViewFull={() => openNodeModal(id, 'commit')}
              t={t}
              notify={notify}
            />
          )}
        </div>

        {/* ═══════════════════════════════════════════
            SECTION 3: LEAVES (if any)
            ═══════════════════════════════════════════ */}
        {data.leaves && data.leaves.length > 0 && (
          <NodeLeavesSection
            leaves={data.leaves}
            totalPassed={totalPassed}
            totalAssertions={totalAssertions}
            leavesExpanded={leavesExpanded}
            setLeavesExpanded={setLeavesExpanded}
            isDetail={isDetail}
            prefersReducedMotion={prefersReducedMotion}
            projectId={projectId}
            nodeId={id}
            leafContextMenuHandler={leafContextMenuHandler}
            removeLeafFromNode={removeLeafFromNode}
          />
        )}
      </motion.div>

      <Handle type="source" position={Position.Right} style={sourceHandleStyle} />

      {/* NodeToolbar - appears on hover/selection */}
      <NodeToolbar
        branchType={data.branchType}
        canTriggerMerge={canTriggerMerge}
        onAddUnit={handleAddUnit}
        onMerge={handleMerge}
        t={t}
      />
    </>
  );
});

export const canvasNodeTypes = {
  unit: UnitNode,
};
