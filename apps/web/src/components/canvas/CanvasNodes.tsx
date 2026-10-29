import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileText,
  GitBranch,
  GitCommit,
  Globe,
  MessageSquare,
  MessageSquarePlus,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { memo, useEffect, useRef, useState } from 'react';
import { SealAnimation } from '@/components/canvas/SealAnimation';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  getBranchCssVariables,
  getBranchVisual,
  getCanvasNodeBranch,
} from '@/domain/canvas/branchVisuals';
import { commitHashLabel, shortHash } from '@/domain/format/formatters';
import { getProjectIdWorkspacePath } from '@/domain/project/repoPath';
import { useConversationContext } from '@/hooks/conversations/useConversationContext';
import { useReducedMotion } from '@/hooks/shared/useReducedMotion';
import { useTerminology } from '@/hooks/shared/useTerminology';
import { useCanvasStore } from '@/store/canvasStore';
import { usePinsStore } from '@/store/pinsStore';
import { useProjectStore } from '@/store/projectStore';
import type { CanvasNodeData } from '@/types/nodes';
import { cn } from '@/utils/cn';
import { nodeEnter, reducedMotion } from '@/utils/motion';
import { toneAccent } from '@/utils/theme';

import { constellationColors, useSemanticZoom } from './CanvasNodeUtils';
import { NodeLeavesSection } from './NodeLeavesSection';
import {
  getNextStep,
  NodeDetailsSection,
  NodeKindIcon,
  type NodeSemanticKind,
  NodeSourcesHeader,
} from './node-parts';
import vividStyles from './StateCanvasVivid.module.css';

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
  const openNodeModal = useCanvasStore((state) => state.openNodeModal);
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
  const semanticKind: NodeSemanticKind = isCommitted ? 'committed' : 'pending';

  const branchLabel = formatBranchLabel(data.branchType, data.branchName);
  const branchName = getCanvasNodeBranch(data);
  const branchCssVariables = isCommitted ? getBranchCssVariables(branchName) : undefined;
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
    const dotType =
      isStaging || data.pendingConversationGroup
        ? 'staging'
        : isCommitted
          ? 'committed'
          : 'conversation';
    const color = isCommitted
      ? getBranchVisual(branchName).accent
      : constellationColors[dotType] || constellationColors.committed;
    const constellationLabel = commitHash
      ? shortHash(commitHash)
      : data.pendingConversationGroup
        ? `${data.pendingConversationGroup.conversations.length} pending`
        : (data.entryId?.slice(0, 7) ?? 'pending');
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
            width: 50,
            height: 50,
            borderRadius: '50%',
            backgroundColor: color,
            boxShadow: `0 0 0 4px var(--surface-card), 0 0 0 8px ${color}, 0 0 16px color-mix(in srgb, ${color} 32%, transparent)`,
            position: 'relative',
            transition: 'box-shadow 0.3s ease',
          }}
          role="treeitem"
          tabIndex={0}
          aria-label={`${data.title} (minified)`}
          aria-selected={selected}
        >
          <span
            aria-hidden="true"
            style={{
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 28,
              fontWeight: 700,
              left: '50%',
              lineHeight: 1,
              position: 'absolute',
              textShadow: '0 1px 3px var(--surface-card), 0 -1px 3px var(--surface-card)',
              top: 68,
              transform: 'translateX(-50%)',
              whiteSpace: 'nowrap',
            }}
          >
            {constellationLabel}
          </span>
        </div>
        <Handle
          type="source"
          position={Position.Right}
          style={{ opacity: 0, width: 1, height: 1 }}
        />
      </>
    );
  }

  if (data.pendingConversationGroup) {
    const { branch, conversations } = data.pendingConversationGroup;
    const pendingBranchLabel = branch.toUpperCase();
    return (
      <>
        <Handle type="target" position={Position.Left} style={targetHandleStyle} />
        <motion.div
          variants={prefersReducedMotion ? reducedMotion.scaleIn : nodeEnter}
          initial="initial"
          animate="animate"
          whileHover={
            prefersReducedMotion
              ? undefined
              : { y: -1, transition: { duration: 0.15, ease: [0.16, 1, 0.3, 1] } }
          }
          className={cn(
            'relative group w-72 overflow-hidden border border-[var(--stroke-default)] elevation-1',
            vividStyles.commitCard,
            vividStyles.pendingCard,
            vividStyles.pendingGroupCard,
            selected && 'ring-2 ring-[var(--accent-pending)]/45'
          )}
          role="treeitem"
          aria-label={`${conversations.length} pending conversation${conversations.length === 1 ? '' : 's'} on ${branch}`}
          aria-selected={selected}
          data-node-type="pending-group"
          data-node-semantic-kind="pending"
          data-branch-color="pending"
          tabIndex={0}
        >
          <div className={vividStyles.nodeBody}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className={vividStyles.pendingGroupIcon}>
                  <Clock3 size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <h4 className={vividStyles.nodeMessage}>
                    {conversations.length} pending conversation
                    {conversations.length === 1 ? '' : 's'}
                  </h4>
                  <span className={vividStyles.nodeSubtitle}>Waiting on {branch}</span>
                </div>
              </div>
              <span
                className={cn(vividStyles.pendingGroupBranch, 'nodrag cursor-pointer')}
                data-branch-highlight={branch}
                title={`Highlight ${branch} branch`}
              >
                {pendingBranchLabel}
              </span>
            </div>

            <div className={vividStyles.pendingConversationList}>
              {conversations.map((conversation) => {
                const content = (
                  <>
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {conversation.title}
                    </span>
                    <span className="shrink-0 text-[10px] text-[var(--text-tertiary)]">
                      {conversation.turnsCount} turn{conversation.turnsCount === 1 ? '' : 's'}
                    </span>
                  </>
                );
                return projectId ? (
                  <Link
                    className={vividStyles.pendingConversationRow}
                    href={getProjectIdWorkspacePath(projectId, {
                      branch,
                      sourceConversationId: conversation.conversationId,
                    })}
                    key={conversation.conversationId}
                  >
                    {content}
                  </Link>
                ) : (
                  <div
                    className={vividStyles.pendingConversationRow}
                    key={conversation.conversationId}
                  >
                    {content}
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
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
          'relative group w-72 overflow-visible border border-[var(--stroke-default)] elevation-1',
          vividStyles.commitCard,
          isStaging && vividStyles.pendingCard,
          // Selected state
          selected && cn(vividStyles.commitCardSelected, 'ring-2', toneAccent.commit.ring),
          // Highlight overrides
          data.highlightMode === 'main' && 'ring-2 ring-[var(--accent-commit)]/50',
          data.highlightMode === 'branch' && 'ring-2 ring-[var(--accent-commit)]/35',
          nodeGlowClass
        )}
        style={{
          ...branchCssVariables,
          willChange: 'transform',
          ...(data.dimmed
            ? { opacity: 0.3, transition: 'opacity 200ms ease' }
            : { transition: 'opacity 200ms ease' }),
        }}
        role="treeitem"
        aria-label={`${data.title} — ${isStaging ? t('draft') : t('committed')} on ${branchLabel}${nodeCount > 0 ? `, ${nodeCount} trees` : ''}`}
        aria-selected={selected}
        data-node-type={isStaging ? 'conversation' : 'commit'}
        data-node-semantic-kind={semanticKind}
        data-branch-color={isCommitted ? branchName.toLowerCase() : 'pending'}
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
        <div className={vividStyles.nodeBody}>
          {/* Row 1: Title + Branch Badge */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span
                data-kind-shape={isCommitted ? 'solid-circle' : undefined}
                data-testid={isCommitted ? 'node-kind-committed' : undefined}
                title={isCommitted ? 'Commit marker' : undefined}
                className={cn(isCommitted && vividStyles.nodeIcon)}
              >
                {isCommitted ? <GitCommit size={20} /> : <NodeKindIcon kind={semanticKind} />}
              </span>
              <div className="min-w-0 flex-1">
                <h4 className={vividStyles.nodeMessage}>{data.title}</h4>
                {isCommitted ? (
                  <span className={vividStyles.nodeSubtitle}>Committed to {branchLabel}</span>
                ) : null}
              </div>
            </div>
            {!isCommitted ? (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        'nodrag cursor-pointer flex-shrink-0 max-w-[80px] truncate text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-transparent inline-flex items-center gap-0.5',
                        data.branchType === 'main'
                          ? cn(toneAccent.commit.border, toneAccent.commit.text)
                          : cn(toneAccent.branch.border, toneAccent.branch.text)
                      )}
                      data-branch-highlight={branchName}
                      title={`Highlight ${branchName} branch`}
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
            ) : null}
          </div>

          {/* Row 2: Commit identity (committed only, intentionally non-interactive) */}
          {isCommitted && commitHash && (
            <div className="nodrag flex items-center justify-between gap-3">
              <span className={vividStyles.hash} title={`Commit ${hashDisplay}`}>
                <span className="truncate font-mono font-semibold">{hashDisplay}</span>
              </span>
              <span
                className={cn(vividStyles.branchBadge, 'nodrag cursor-pointer')}
                data-branch-highlight={branchName}
                title={`Highlight ${branchName} branch`}
              >
                <span className="size-2 rounded-full bg-current" /> {branchLabel}
              </span>
            </div>
          )}

          {/* Import source badge */}
          {data.importSource && (
            <div className="flex items-center gap-1">
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
                'w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors nodrag',
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
          />
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
