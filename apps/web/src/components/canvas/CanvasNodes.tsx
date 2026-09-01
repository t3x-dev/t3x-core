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
  Plus,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { memo, useEffect, useRef, useState } from 'react';
import { SealAnimation } from '@/components/canvas/SealAnimation';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { commitHashLabel } from '@/domain/format/formatters';
import { useCanvasLeafActions } from '@/hooks/canvas/useCanvasLeafActions';
import { useConversationContext } from '@/hooks/conversations/useConversationContext';
import { leafContextMenuHandlerRef } from '@/hooks/shared/useContextMenu';
import { useReducedMotion } from '@/hooks/shared/useReducedMotion';
import { useTerminology } from '@/hooks/shared/useTerminology';
import { useCanvasStore } from '@/store/canvasStore';
import { usePinsStore } from '@/store/pinsStore';
import { useProjectStore } from '@/store/projectStore';
import type { CanvasNodeData } from '@/types/nodes';
import { cn } from '@/utils/cn';
import { nodeEnter, reducedMotion } from '@/utils/motion';
import { glass, toneAccent, toneGlow } from '@/utils/theme';

import { constellationColors, useSemanticZoom } from './CanvasNodeUtils';
import { NodeLeavesSection } from './NodeLeavesSection';
import {
  getNextStep,
  NodeDetailsSection,
  NodeKindIcon,
  type NodeSemanticKind,
  NodeSourcesHeader,
} from './node-parts';

// Re-export LEAF_TYPES for backward compatibility
export { LEAF_TYPES } from './CanvasNodeUtils';

// Define custom node type for React Flow v12
type CanvasNode = Node<CanvasNodeData, 'canvas'>;

type Props = NodeProps<CanvasNode>;

// Handle styles - uses CSS variables for theming
const targetHandleStyle = {
  width: 1,
  height: 1,
  background: 'transparent',
  border: '0',
  opacity: 0,
  top: '50%',
  transform: 'translateY(-50%)',
  left: 0,
};

const sourceHandleStyle = {
  width: 1,
  height: 1,
  background: 'transparent',
  border: '0',
  opacity: 0,
  top: '50%',
  transform: 'translateY(-50%)',
  right: 0,
};

function formatBranchLabel(branchType: CanvasNodeData['branchType'], branchName?: string): string {
  if (branchType !== 'branch') return 'MAIN';
  const raw = branchName?.trim();
  if (!raw) return 'branch';
  return /^branch\b/i.test(raw) ? raw : `branch ${raw}`;
}

type TreeSummaryNode = {
  children?: TreeSummaryNode[];
  key?: string;
  slots?: Record<string, unknown>;
};

function flattenTrees(trees: TreeSummaryNode[] = []): TreeSummaryNode[] {
  const flattened: TreeSummaryNode[] = [];
  const visit = (tree: TreeSummaryNode) => {
    flattened.push(tree);
    for (const child of tree.children ?? []) visit(child);
  };
  for (const tree of trees) visit(tree);
  return flattened;
}

function findTree(trees: TreeSummaryNode[], key: string): TreeSummaryNode | undefined {
  return flattenTrees(trees).find((tree) => tree.key === key);
}

function inferSemanticSummary(data: CanvasNodeData): { label: string; meta: string } | null {
  const trees = (data.commit?.content?.trees ?? []) as TreeSummaryNode[];
  if (trees.length === 0) return null;

  const rootKey = trees[0]?.key ?? 'state tree';
  const nodeCount = flattenTrees(trees).length;
  const destination = trees[0]?.slots?.destination;
  if (
    data.branchType === 'branch' &&
    typeof destination === 'string' &&
    destination.toLowerCase().includes('hawaii')
  ) {
    return { label: 'destination adds Hawaii', meta: '~1' };
  }
  if (findTree(trees, 'food_ideas')) {
    return { label: '+ food_ideas subtree', meta: '+1' };
  }
  return {
    label: `initial ${rootKey} tree`,
    meta: `${nodeCount} node${nodeCount === 1 ? '' : 's'}`,
  };
}

// Unit Node - 3-Section Layout: Sources → Commit → Leaves
const UnitNode = memo(function UnitNode(props: Props) {
  const { data, selected, id } = props;
  const [leavesExpanded, setLeavesExpanded] = useState(false);
  const [contentExpandedManual, setContentExpandedManual] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const params = useParams();
  const routeProjectId = params?.projectId as string | undefined;
  const canvasProjectId = useCanvasStore((state) => state.projectId);
  const projectId = routeProjectId || canvasProjectId || undefined;
  const prefersReducedMotion = useReducedMotion();
  const zoomTier = useSemanticZoom();
  const isConstellation = zoomTier === 'overview';
  // Detail expansion is user-initiated only (click "Details"), not zoom-driven
  const isDetail = false;
  const contentExpanded = contentExpandedManual;

  const { t } = useTerminology();
  const openLeafPanel = useCanvasStore((state) => state.openLeafPanel);
  const { remove: removeLeafFromNode } = useCanvasLeafActions();
  // Read from module-level ref to avoid Zustand re-renders on every callback update
  const leafContextMenuHandler = leafContextMenuHandlerRef.current;
  const openNodeModal = useCanvasStore((state) => state.openNodeModal);
  const notify = useProjectStore((state) => state.notifyCallback);
  const projectName = useProjectStore((state) =>
    projectId ? state.getProject(projectId)?.name : undefined
  );

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
  const semanticKind: NodeSemanticKind = isCommitted ? 'committed' : 'pending';

  const branchLabel = formatBranchLabel(data.branchType, data.branchName);
  const semanticSummary = inferSemanticSummary(data);
  const commitHash = data.commit?.hash || data.commitHash || '';
  const hashDisplay = commitHash ? commitHashLabel(commitHash) : '';

  // Dark mode semantic glow (CSS uses .dark ancestor selector)
  const nodeGlowClass = isCommitted ? 'node-glow-committed' : isStaging ? 'node-glow-pending' : '';

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

  // B-4: Next Step button logic
  const nextStep = getNextStep({
    isStaging,
    isCommitted,
    conversationId: data.conversationId,
    nodeId: id,
    t,
    icons: { MessageSquarePlus, GitCommit, Plus },
    actions: {
      navigateToConversation: () => openNodeModal(id, 'commit'),
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
  const nodeCount = data.commit ? (data.commit.content?.trees?.length ?? 0) : 0;

  // Constellation mode — render minified dot at low zoom
  if (isConstellation) {
    const dotType = isStaging ? 'staging' : isCommitted ? 'committed' : 'conversation';
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
          // Hover
          'hover:shadow-[var(--fx-shadow-hover)]',
          // Selected state
          selected && cn('ring-2', toneAccent.commit.ring),
          // Highlight overrides
          data.highlightMode === 'main' && 'ring-2 ring-[var(--accent-commit)]/50',
          data.highlightMode === 'branch' && 'ring-2 ring-[var(--accent-commit)]/35',
          data.highlightMode === 'node' && 'ring-2 ring-[var(--accent-commit)]/50',
          nodeGlowClass
        )}
        style={{
          willChange: 'transform',
          ...(selected ? { boxShadow: toneGlow.commit } : {}),
          ...(data.dimmed
            ? { opacity: 0.3, transition: 'opacity 200ms ease' }
            : { transition: 'opacity 200ms ease' }),
        }}
        role="treeitem"
        aria-label={`${data.title} — ${isStaging ? t('draft') : t('committed')} on ${branchLabel}${nodeCount > 0 ? `, ${nodeCount} trees` : ''}`}
        aria-selected={selected}
        data-node-type={isStaging ? 'conversation' : 'commit'}
        data-node-semantic-kind={semanticKind}
        data-intro-target={
          isCommitted
            ? data.leaves && data.leaves.length > 0
              ? 'canvas-commit-node-with-leaf'
              : 'canvas-commit-node'
            : isStaging
              ? 'canvas-pending-node'
              : undefined
        }
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
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <NodeKindIcon kind={semanticKind} />
              <h4 className="m-0 text-sm font-semibold text-[var(--text-primary)] leading-snug flex-1 min-w-0 truncate">
                {data.title}
              </h4>
            </div>
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
                    {data.branchType === 'main' ? <GitCommit size={10} /> : <GitBranch size={10} />}
                    {branchLabel}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {branchLabel}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Row 2: Commit identity (committed only, intentionally non-interactive) */}
          {isCommitted && commitHash && (
            <span
              className="nodrag mb-1 inline-flex max-w-full items-center gap-1 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] px-1.5 py-0.5 text-[11px] text-[var(--text-tertiary)]"
              title={`Commit ${hashDisplay}`}
            >
              <span className="truncate font-mono">{hashDisplay}</span>
            </span>
          )}

          {/* B-8: Stats line (always visible in collapsed view) */}
          {semanticSummary ? (
            <div className="mb-[var(--space-item)] flex items-center justify-between gap-2 rounded-md bg-[var(--surface-muted)] px-2 py-1.5 text-xs text-[var(--text-secondary)]">
              <span className="min-w-0 truncate">{semanticSummary.label}</span>
              <span className="shrink-0 font-mono text-[11px] text-[var(--text-tertiary)]">
                {semanticSummary.meta}
              </span>
            </div>
          ) : (
            nodeCount > 0 && (
              <div className="mb-[var(--space-item)] text-xs text-[var(--text-secondary)]">
                {nodeCount} tree{nodeCount !== 1 ? 's' : ''}
              </div>
            )
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

          {/* B-4: Next Step button */}
          {nextStep && !isCommitted && (
            <button
              type="button"
              data-action="next-step"
              data-intro-target={!isCommitted ? 'canvas-create-commit' : undefined}
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
          {(data.commit || data.commitHash) && !isCommitted && (
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
              hashDisplay={
                hashDisplay ||
                (data.commit?.hash || data.commitHash || data.entryId
                  ? commitHashLabel(data.commit?.hash || data.commitHash || data.entryId || '')
                  : '')
              }
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
            projectName={projectName}
            nodeId={id}
            onCreateLeaf={() => openLeafPanel(id)}
            leafContextMenuHandler={leafContextMenuHandler}
            removeLeafFromNode={removeLeafFromNode}
          />
        )}
        {isCommitted && (!data.leaves || data.leaves.length === 0) && (
          <div className="flex items-center border-t border-[var(--stroke-divider)] px-3 py-2 text-[11px] text-[var(--text-tertiary)]">
            <span>No leaf yet</span>
          </div>
        )}
      </motion.div>

      <Handle type="source" position={Position.Right} style={sourceHandleStyle} />

      {/* Node actions are shown by CanvasWorkspace after a committed node is selected. */}
    </>
  );
});

export const canvasNodeTypes = {
  unit: UnitNode,
};
