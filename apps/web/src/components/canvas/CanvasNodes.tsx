import type { Node, NodeProps } from '@xyflow/react';
import { Handle, NodeToolbar, Position } from '@xyflow/react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  FilePlus,
  FileText,
  GitCommit,
  GitMerge,
  Mail,
  MessageCircle,
  MessageSquare,
  MessageSquarePlus,
  PenSquare,
  Pin,
  Plus,
  Rocket,
  Trash2,
  Twitter,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import type { ComponentType } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { type ConversationContext, getConversationContext } from '@/lib/api';
import { nodeEnter, reducedMotion } from '@/lib/motion';
import { glass, toneAccent, toneGlow } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';
import { usePinsStore } from '@/store/pinsStore';
import { useProjectStore } from '@/store/projectStore';
import type {
  CanvasNodeData,
  CommitV3Display,
  CommitV4Display,
  ConstraintDisplay,
  EmbeddedLeaf,
  LeafType,
  SourceType,
} from '@/types/nodes';
import { TruncatedCommitView } from './TruncatedCommitView';

// Define custom node type for React Flow v12
type CanvasNode = Node<CanvasNodeData, 'canvas'>;

// Leaf type definitions with icons and labels
// Must match @t3x/core LeafType from V4 schema
export const LEAF_TYPES: {
  type: LeafType;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}[] = [
  { type: 'tweet', label: 'Twitter', icon: Twitter },
  {
    type: 'weibo',
    label: '微博',
    icon: ({ size, className }) => (
      <svg
        width={size || 16}
        height={size || 16}
        viewBox="0 0 24 24"
        fill="currentColor"
        className={className}
      >
        <path d="M10.098 20.323c-3.977.391-7.414-1.406-7.672-4.02-.259-2.609 2.759-5.047 6.74-5.441 3.979-.394 7.413 1.404 7.671 4.018.259 2.6-2.759 5.049-6.739 5.443zM9.05 17.219c-.384.616-1.208.884-1.829.602-.612-.279-.793-.991-.406-1.593.379-.595 1.176-.861 1.793-.601.622.263.82.972.442 1.592zm1.27-1.627c-.141.237-.449.353-.689.253-.236-.09-.313-.361-.177-.586.138-.227.436-.346.672-.24.239.09.315.36.194.573zm.176-2.719c-1.893-.493-4.033.45-4.857 2.118-.836 1.704-.026 3.591 1.886 4.21 1.983.64 4.318-.341 5.132-2.179.8-1.793-.201-3.642-2.161-4.149zm7.563-1.224c-.346-.105-.579-.18-.405-.649.381-1.017.422-1.896-.002-2.521-.789-1.161-2.948-1.098-5.418-.032 0 0-.776.34-.577-.277.379-1.207.324-2.218-.267-2.799-1.344-1.32-4.91.051-7.97 3.06C1.87 10.54.5 12.8.5 14.81c0 3.85 4.943 6.19 9.779 6.19 6.332 0 10.546-3.674 10.546-6.587 0-1.762-1.484-2.762-2.766-3.164z" />
      </svg>
    ),
  },
  { type: 'wechat', label: '朋友圈', icon: MessageCircle },
  { type: 'article', label: '文章', icon: FileText },
  { type: 'email', label: 'Email', icon: Mail },
  {
    type: 'slack',
    label: 'Slack',
    icon: ({ size, className }) => (
      <svg
        width={size || 16}
        height={size || 16}
        viewBox="0 0 24 24"
        fill="currentColor"
        className={className}
      >
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
      </svg>
    ),
  },
  { type: 'deploy_agent', label: 'Deploy Agent', icon: Rocket },
];

type Props = NodeProps<CanvasNode>;

// Handle styles - uses CSS variables for theming
const targetHandleStyle = {
  width: 22,
  height: 14,
  borderRadius: 8,
  background: 'var(--color-bg-white, #fff)',
  border: '3px solid var(--color-text-muted, #94a3b8)',
  top: '50%',
  transform: 'translateY(-50%)',
  left: -6,
};

const sourceHandleStyle = {
  width: 18,
  height: 18,
  borderRadius: 999,
  background: 'var(--color-bg-white, #fff)',
  border: '3px solid var(--color-text-muted, #94a3b8)',
  top: '50%',
  transform: 'translateY(-50%)',
  right: -9,
};

// Map canvas tone key to accent system key
function getToneAccentKey(toneKey: string): 'commit' | 'pending' | 'branch' {
  switch (toneKey) {
    case 'main-latest':
    case 'main-history':
    case 'default':
      return 'commit';
    case 'branch-latest':
    case 'branch-history':
      return 'branch';
    case 'staging':
      return 'pending';
    default:
      return 'commit';
  }
}

// Source type icon mapping
const SOURCE_ICONS: Record<SourceType, ComponentType<{ size?: number; className?: string }>> = {
  conversation: MessageSquare,
  meeting: Users,
  file: FileText,
  evidence: FilePlus,
};

// Get icon for leaf type
function getLeafIcon(type: LeafType) {
  const leafInfo = LEAF_TYPES.find((l) => l.type === type);
  return leafInfo?.icon || FileText;
}

// ============================================
// Commit Display Components (V3 and V4)
// ============================================

/**
 * Author badge for V3 commits (with verification status)
 */
function AuthorBadgeV3({ author }: { author: CommitV3Display['author'] }) {
  const isVerified = author.verification === 'verified';
  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded ${
        isVerified
          ? 'bg-[var(--status-success-muted)] text-[var(--status-success)]'
          : 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'
      }`}
    >
      {author.name}
      {isVerified && ' ✓'}
    </span>
  );
}

/**
 * Author badge for V4 commits (with type indicator)
 */
function AuthorBadgeV4({ author }: { author: CommitV4Display['author'] }) {
  const isAgent = author.type === 'agent';
  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${
        isAgent
          ? 'bg-[var(--accent-conversation)]/10 text-[var(--accent-conversation)]'
          : 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'
      }`}
    >
      {author.name || author.id || 'Unknown'}
      {isAgent && <span className="text-[0.5rem]">AI</span>}
    </span>
  );
}

function ConstraintBadge({ constraint }: { constraint: ConstraintDisplay }) {
  const isRequire = constraint.type === 'require';
  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded ${
        isRequire
          ? 'bg-[var(--status-success-muted)] text-[var(--status-success)] border border-[var(--status-success)]/20'
          : 'bg-[var(--status-error-muted)] text-[var(--status-error)] border border-[var(--status-error)]/20 line-through'
      }`}
    >
      {isRequire ? '✓' : '✗'} {constraint.value}
    </span>
  );
}

// Preview limits for UnitNode display
const PREVIEW_MAX_SENTENCES = 3;
const PREVIEW_MAX_CONSTRAINTS = 3;

/**
 * CommitV3 content section - shows sentences and constraints
 * Header (title, branch, hash, status) is rendered by parent UnitNode
 */
function CommitV3Content({
  commit,
  onViewFull,
  projectId,
}: {
  commit: CommitV3Display;
  onViewFull?: () => void;
  projectId?: string;
}) {
  // Check if we have source context for truncated view
  const sentencesWithSource = commit.sentences.filter((s) => s.source?.turn_hash);
  const hasSourceContext = sentencesWithSource.length > 0;

  // Preview mode: limit sentences and constraints
  const displaySentences = commit.sentences.slice(0, PREVIEW_MAX_SENTENCES);
  const remainingSentences = commit.sentences.length - PREVIEW_MAX_SENTENCES;
  const displayConstraints = commit.constraints.slice(0, PREVIEW_MAX_CONSTRAINTS);
  const remainingConstraints = commit.constraints.length - PREVIEW_MAX_CONSTRAINTS;

  return (
    <div className="commit-v3-content mt-2 pt-2 border-t border-[var(--stroke-divider)]">
      {/* Author badge */}
      <div className="flex items-center gap-1.5 mb-[var(--space-item)]">
        <span className="text-xs text-[var(--text-tertiary)]">by</span>
        <AuthorBadgeV3 author={commit.author} />
      </div>

      {/* Sentences - use TruncatedCommitView if source context available */}
      <div>
        <div className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-1">
          Sentences ({commit.sentences.length})
        </div>
        {commit.sentences.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)] italic">No sentences</p>
        ) : hasSourceContext ? (
          <TruncatedCommitView
            sentences={sentencesWithSource.map((s) => ({
              id: s.id,
              text: s.text,
              source: {
                turn_hash: s.source!.turn_hash,
                start_char: s.source!.start_char,
                end_char: s.source!.end_char,
              },
            }))}
            maxHighlights={2}
            contextChars={50}
            onViewFull={onViewFull}
            projectId={projectId}
          />
        ) : (
          <ul className="space-y-0.5">
            {displaySentences.map((s) => (
              <li key={s.id} className="text-xs text-[var(--text-secondary)] line-clamp-1">
                • {s.text}
              </li>
            ))}
            {remainingSentences > 0 && (
              <li className="text-xs text-[var(--text-tertiary)]">+{remainingSentences} more</li>
            )}
          </ul>
        )}
      </div>

      {/* Constraints (preview) */}
      {commit.constraints.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-1">
            Constraints ({commit.constraints.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {displayConstraints.map((c) => (
              <ConstraintBadge key={c.id} constraint={c} />
            ))}
            {remainingConstraints > 0 && (
              <span className="text-xs text-[var(--text-tertiary)] px-1 py-0.5">
                +{remainingConstraints}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * CommitV4 content section - shows sentences only (constraints are in Leaves)
 * Header (title, branch, hash, status) is rendered by parent UnitNode
 *
 * Note: V4 sentences use source_ref (conversation_id + turn_hash) without
 * character positions, so we show a compact list with View full link.
 */
function CommitV4Content({
  commit,
  onViewFull,
  projectId: _projectId, // Reserved for future TruncatedCommitView integration
}: {
  commit: CommitV4Display;
  onViewFull?: () => void;
  projectId?: string;
}) {
  const sentences = commit.content.sentences;
  const displaySentences = sentences.slice(0, PREVIEW_MAX_SENTENCES);
  const remainingSentences = sentences.length - PREVIEW_MAX_SENTENCES;

  return (
    <div className="commit-v4-content mt-2 pt-2 border-t border-[var(--stroke-divider)]">
      {/* Author badge */}
      <div className="flex items-center gap-1.5 mb-[var(--space-item)]">
        <span className="text-xs text-[var(--text-tertiary)]">by</span>
        <AuthorBadgeV4 author={commit.author} />
        {/* V4 badge */}
        <span
          className={cn(
            'text-[0.55rem] font-semibold px-1 py-0.5 rounded-full border bg-transparent',
            toneAccent.conversation.border,
            toneAccent.conversation.text
          )}
        >
          V4
        </span>
      </div>

      {/* Sentences (preview) */}
      <div>
        <div className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
          Sentences ({sentences.length})
        </div>
        {sentences.length === 0 ? (
          <p className="mt-1 text-xs text-[var(--text-tertiary)] italic">No sentences</p>
        ) : (
          <>
            <ul className="mt-1 space-y-0.5">
              {displaySentences.map((s) => (
                <li key={s.id} className="text-xs text-[var(--text-secondary)] line-clamp-2">
                  <span className="text-[var(--text-tertiary)] font-mono text-[11px] mr-1">
                    {s.id}
                  </span>
                  {s.text}
                </li>
              ))}
            </ul>
            {/* Footer with +N more and View full */}
            <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-[var(--stroke-divider)]">
              {remainingSentences > 0 ? (
                <span className="text-xs text-[var(--text-tertiary)]">
                  +{remainingSentences} sentence{remainingSentences !== 1 ? 's' : ''}
                </span>
              ) : (
                <span />
              )}
              {onViewFull && (
                <button
                  type="button"
                  onClick={onViewFull}
                  className={cn(
                    'inline-flex items-center gap-0.5 text-xs transition-colors hover:brightness-110',
                    toneAccent.commit.text
                  )}
                >
                  View full
                  <ChevronRight size={10} />
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* V4: Constraints notice */}
      <div className="mt-2 px-2 py-1.5 bg-[var(--hover-bg)] rounded border border-[var(--stroke-divider)]">
        <p className="text-xs text-[var(--text-tertiary)]">Constraints are defined in Leaves</p>
      </div>
    </div>
  );
}

// Unit Node - 3-Section Layout: Sources → Commit → Leaves
function UnitNode(props: Props) {
  const { data, selected, id } = props;
  const [leavesExpanded, setLeavesExpanded] = useState(false);
  const [contentExpanded, setContentExpanded] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const router = useRouter();
  const params = useParams();
  const projectId = params?.projectId as string | undefined;
  const prefersReducedMotion = useReducedMotion();

  const tone = useCanvasStore((state) => state.getCommitTone(id));
  const addUnitFromUnit = useCanvasStore((state) => state.addUnitFromUnit);
  const startMergeFromCommit = useCanvasStore((state) => state.createMergePendingCommit);
  const hasMainCommit = useCanvasStore((state) => state.hasMainCommit);
  const openLeafPanel = useCanvasStore((state) => state.openLeafPanel);
  const removeLeafFromNode = useCanvasStore((state) => state.removeLeafFromNode);
  const openNodeModal = useCanvasStore((state) => state.openNodeModal);
  const notify = useProjectStore((state) => state.notifyCallback);

  // Pin store
  const { isPinned } = usePinsStore();

  // Context config state
  const [contextConfig, setContextConfig] = useState<ConversationContext | null>(null);

  // Fetch context config on mount
  useEffect(() => {
    if (!data.conversationId) return;

    getConversationContext(data.conversationId)
      .then(setContextConfig)
      .catch(() => {}); // Silent fail - context indicator just won't show
  }, [data.conversationId]);

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

  const branchLabel = data.branchType === 'branch' ? data.branchName?.trim() || 'branch' : 'MAIN';

  // Map tone to accent system
  const toneKey = isStaging ? 'staging' : tone || 'default';
  const accentKey = getToneAccentKey(toneKey);

  // Commit celebration animation — triggers on staging → committed transition
  const prevStatusRef = useRef(data.commitStatus);
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    if (prevStatusRef.current === 'staging' && data.commitStatus === 'committed') {
      setCelebrating(true);
      const timer = setTimeout(() => setCelebrating(false), 500);
      return () => clearTimeout(timer);
    }
    prevStatusRef.current = data.commitStatus;
  }, [data.commitStatus]);

  const handleAddUnit = () => {
    try {
      addUnitFromUnit(id);
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

  // Copy commit hash to clipboard (V4/V3 hash takes priority)
  const handleCopyHash = (e: React.MouseEvent) => {
    e.stopPropagation();
    const hash =
      data.commitV4?.hash || data.commitV3?.hash || data.commitHash || data.entryId || '';
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  // Navigate to leaf detail page
  const getLeafHref = (leaf: EmbeddedLeaf): string | undefined => {
    if (!projectId || !leaf.id) return undefined;
    return `/project/${projectId}/leaf/${leaf.id}`;
  };

  // B-4: Next Step button logic
  const getNextStep = (): { label: string; icon: typeof ArrowRight; action: () => void } | null => {
    if (isStaging && !data.conversationId) {
      return {
        label: 'Start Conversation',
        icon: MessageSquarePlus,
        action: () => openNodeModal(id, 'conversation'),
      };
    }
    if (isStaging && data.conversationId) {
      return {
        label: 'Create Commit',
        icon: GitCommit,
        action: () => openNodeModal(id, 'commit'),
      };
    }
    if (isCommitted && (!data.leaves || data.leaves.length === 0)) {
      return {
        label: 'Create Output',
        icon: Plus,
        action: () => openLeafPanel(id),
      };
    }
    if (isCommitted && data.leaves && data.leaves.length > 0) {
      const firstLeaf = data.leaves[0];
      const leafHref = getLeafHref(firstLeaf);
      return {
        label: 'View Output',
        icon: Eye,
        action: () => {
          if (leafHref) router.push(leafHref);
        },
      };
    }
    return null;
  };

  const nextStep = getNextStep();

  // B-8: Compute stats for collapsed view
  const sentenceCount = data.commitV4
    ? data.commitV4.content.sentences.length
    : data.commitV3
      ? data.commitV3.sentences.length
      : 0;
  return (
    <>
      <Handle type="target" position={Position.Left} style={targetHandleStyle} />

      <motion.div
        variants={prefersReducedMotion ? reducedMotion.scaleIn : nodeEnter}
        initial="initial"
        animate={celebrating && !prefersReducedMotion ? { scale: [1, 1.06, 1] } : 'animate'}
        exit="exit"
        transition={
          celebrating && !prefersReducedMotion
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
          'group w-72 rounded-xl overflow-visible elevation-1',
          glass.cardNode,
          glass.highlight,
          // Left accent line
          'border-l-2',
          isStaging && 'border-dashed',
          accentKey === 'commit' && 'border-l-[var(--accent-commit)]',
          accentKey === 'branch' && 'border-l-[var(--accent-branch)]',
          accentKey === 'pending' && 'border-l-[var(--accent-pending)]',
          // Hover
          'hover:shadow-[var(--fx-shadow-hover)]',
          // Selected state
          selected && cn('ring-2', toneAccent[accentKey].ring),
          // Highlight overrides
          data.highlightMode === 'main' && 'ring-2 ring-[var(--accent-commit)]/50',
          data.highlightMode === 'branch' && 'ring-2 ring-[var(--accent-branch)]/50'
        )}
        style={{
          willChange: 'transform',
          ...(selected ? { boxShadow: toneGlow[accentKey as keyof typeof toneGlow] } : {}),
        }}
        role="treeitem"
        aria-label={`${data.title} — ${isStaging ? 'Draft' : 'Committed'} on ${branchLabel}${sentenceCount > 0 ? `, ${sentenceCount} sentences` : ''}`}
        aria-selected={selected}
        data-node-type={isStaging ? 'conversation' : 'commit'}
        tabIndex={0}
      >
        {/* ═══════════════════════════════════════════
            SECTION 1: SOURCES (if any)
            ═══════════════════════════════════════════ */}
        {data.sources && data.sources.length > 0 && (
          <div
            className="px-3 py-2 border-b border-[var(--stroke-divider)] rounded-t-[11px] cursor-pointer hover:bg-[var(--hover-bg)] transition-colors nodrag"
            onClick={(e) => {
              e.stopPropagation();
              openNodeModal(id, 'conversation');
            }}
          >
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
              <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                SOURCES
              </span>
              {/* Context indicator */}
              {(() => {
                const ctxLabel = getContextLabel();
                return ctxLabel ? (
                  <>
                    <span className="text-[var(--text-tertiary)]/50">·</span>
                    <span className="text-[var(--text-tertiary)] font-medium">{ctxLabel}</span>
                  </>
                ) : null;
              })()}
              <span className="text-[var(--text-tertiary)]/50">·</span>
              <TooltipProvider delayDuration={200}>
                {data.sources.map((source, idx) => {
                  const Icon = SOURCE_ICONS[source.type] || FileText;
                  const sourceIsPinned =
                    source.type === 'conversation' && isPinned('conversation', source.id);
                  return (
                    <span key={source.id} className="inline-flex items-center gap-0.5">
                      {idx > 0 && <span className="text-[var(--text-tertiary)]/50 mx-0.5">·</span>}
                      {sourceIsPinned && (
                        <Pin
                          size={10}
                          className="text-amber-500 dark:text-amber-400 fill-amber-500 dark:fill-amber-400"
                        />
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-0.5">
                            <Icon size={10} className="text-[var(--text-tertiary)]" />
                            <span>{source.label}</span>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          {source.title || source.label}
                        </TooltipContent>
                      </Tooltip>
                    </span>
                  );
                })}
              </TooltipProvider>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════
            SECTION 2: COMMIT (main content)
            ═══════════════════════════════════════════ */}
        <div className="px-3 py-3">
          {/* Row 1: Title + Branch Badge */}
          <div className="flex items-start justify-between gap-2 mb-[var(--space-item)]">
            <h4 className="m-0 text-sm font-semibold text-[var(--text-primary)] leading-snug flex-1 min-w-0">
              {data.title}
            </h4>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      'flex-shrink-0 max-w-[80px] truncate text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-transparent',
                      data.branchType === 'main'
                        ? cn(toneAccent.commit.border, toneAccent.commit.text)
                        : cn(toneAccent.branch.border, toneAccent.branch.text)
                    )}
                  >
                    {branchLabel}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {branchLabel}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Row 2: Self hash (committed only) */}
          {isCommitted && (data.commitV4?.hash || data.commitV3?.hash || data.commitHash) && (
            <div className="font-mono text-[11px] text-[var(--text-tertiary)] mb-1">
              {(data.commitV4?.hash || data.commitV3?.hash || data.commitHash || '')
                .replace('sha256:', 'sha:')
                .slice(0, 11)}
            </div>
          )}

          {/* B-8: Stats line (always visible in collapsed view) */}
          {sentenceCount > 0 && (
            <div className="text-xs text-[var(--text-secondary)] mb-[var(--space-item)]">
              {sentenceCount} sentence{sentenceCount !== 1 ? 's' : ''}
            </div>
          )}

          {/* B-4: Next Step button */}
          {nextStep && (
            <button
              type="button"
              data-action="next-step"
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 mb-[var(--space-item)] rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors nodrag"
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
          {(data.commitV3 || data.commitV4 || data.commitHash) && (
            <button
              type="button"
              className="w-full flex items-center justify-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] py-1 rounded hover:bg-[var(--hover-bg)] transition-colors nodrag"
              onClick={(e) => {
                e.stopPropagation();
                setContentExpanded((prev) => !prev);
              }}
            >
              <span>Details</span>
              {contentExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          )}

          {/* B-8: Expandable detail content */}
          {contentExpanded && (
            <>
              {/* Hash + copy button */}
              <div className="flex items-center gap-1.5 text-[0.7rem] text-[var(--text-tertiary)] mb-[var(--space-item)] mt-2 nodrag">
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={handleCopyHash}
                        className="inline-flex items-center gap-1 font-mono text-[var(--text-tertiary)] bg-[var(--hover-bg)] hover:bg-[var(--hover-bg-strong)] px-1.5 py-0.5 rounded text-xs transition-colors cursor-pointer"
                      >
                        {(
                          data.commitV4?.hash ||
                          data.commitV3?.hash ||
                          data.commitHash ||
                          data.entryId ||
                          ''
                        )
                          .replace('sha256:', 'sha:')
                          .slice(0, 11)}
                        {copiedHash ? (
                          <CheckCircle size={10} className="text-[var(--status-success)]" />
                        ) : (
                          <Copy size={10} className="text-[var(--text-tertiary)]" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {copiedHash ? 'Copied!' : 'Click to copy hash'}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {data.isMergeCommit && (
                  <>
                    <span className="text-[var(--text-tertiary)]/50">·</span>
                    <span className={cn('font-medium', toneAccent.conversation.text)}>merge</span>
                  </>
                )}
              </div>

              {/* Status indicator */}
              <div className="flex items-center justify-between mb-[var(--space-item)]">
                <div className="flex items-center gap-1.5">
                  {isStaging ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                      <PenSquare size={12} className={toneAccent.pending.text} />
                      <span>Draft</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                      <GitCommit
                        size={12}
                        className={
                          data.branchType === 'main'
                            ? toneAccent.commit.text
                            : toneAccent.branch.text
                        }
                      />
                      <span>Committed</span>
                    </span>
                  )}
                </div>
                {!data.commitV3 &&
                  isStaging &&
                  (data.mustHave?.length || 0) + (data.mustntHave?.length || 0) > 0 && (
                    <span className="text-xs font-medium">
                      <span className="text-[var(--status-success)]">
                        {data.mustHave?.length || 0}✓
                      </span>{' '}
                      <span className="text-[var(--status-error)]">
                        {data.mustntHave?.length || 0}✗
                      </span>
                    </span>
                  )}
                {!data.commitV3 && !isStaging && data.summary && (
                  <span className="text-xs text-[var(--text-tertiary)] truncate max-w-[100px]">
                    {data.summary}
                  </span>
                )}
              </div>

              {/* V3/V4: Sentences and Constraints content */}
              {data.commitV4 && (
                <CommitV4Content
                  commit={data.commitV4}
                  onViewFull={() => openNodeModal(id, 'commit')}
                  projectId={projectId}
                />
              )}
              {data.commitV3 && !data.commitV4 && (
                <CommitV3Content
                  commit={data.commitV3}
                  onViewFull={() => openNodeModal(id, 'commit')}
                  projectId={projectId}
                />
              )}
            </>
          )}
        </div>

        {/* ═══════════════════════════════════════════
            SECTION 3: LEAVES (if any)
            ═══════════════════════════════════════════ */}
        {data.leaves && data.leaves.length > 0 && (
          <div className="border-t border-[var(--stroke-divider)]">
            <button
              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[var(--hover-bg)] transition-colors"
              onClick={() => setLeavesExpanded((prev) => !prev)}
              type="button"
            >
              <span className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                Leaves ({data.leaves.length})
                {totalAssertions > 0 && (
                  <span className="ml-1.5 normal-case font-normal">
                    <span className="text-[var(--status-success)]">{totalPassed}</span>
                    <span className="text-[var(--text-tertiary)]/50">/</span>
                    <span className="text-[var(--text-tertiary)]">{totalAssertions}</span>
                  </span>
                )}
              </span>
              <ChevronRight
                size={12}
                className={cn(
                  'text-[var(--text-tertiary)] transition-transform duration-[var(--duration-normal)]',
                  leavesExpanded && 'rotate-90'
                )}
              />
            </button>
            <AnimatePresence>
              {leavesExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.15 }}
                  className="overflow-hidden"
                >
                  <div className="px-3 pb-2 space-y-1 nodrag">
                    {data.leaves.map((leaf) => {
                      const LeafIcon = getLeafIcon(leaf.type);
                      const leafHref = getLeafHref(leaf);
                      const leafContent = (
                        <>
                          <div className="w-5 h-5 rounded flex items-center justify-center bg-[var(--accent-conversation)]/10 text-[var(--accent-conversation)]">
                            <LeafIcon size={12} />
                          </div>
                          <span className="text-xs text-[var(--text-secondary)] flex-1 truncate">
                            {leaf.title}
                          </span>
                          {leaf.status && (
                            <span
                              className={cn(
                                'text-xs font-medium px-1.5 py-0.5 rounded',
                                leaf.status === 'running' &&
                                  'bg-[var(--status-info-muted)] text-[var(--status-info)]',
                                leaf.status === 'passed' &&
                                  'bg-[var(--status-success-muted)] text-[var(--status-success)]',
                                leaf.status === 'failed' &&
                                  'bg-[var(--status-error-muted)] text-[var(--status-error)]',
                                leaf.status === 'pending' &&
                                  'bg-[var(--status-warning-muted)] text-[var(--status-warning)]',
                                leaf.status === 'idle' &&
                                  'bg-[var(--hover-bg)] text-[var(--text-tertiary)]'
                              )}
                            >
                              {leaf.status === 'passed' && leaf.passedCount !== undefined
                                ? `${leaf.passedCount}/${(leaf.passedCount || 0) + (leaf.failedCount || 0)}`
                                : leaf.status}
                            </span>
                          )}
                        </>
                      );
                      return (
                        <div
                          key={leaf.id}
                          data-node-type="leaf"
                          className="group/leaf flex items-center gap-1"
                        >
                          {leafHref ? (
                            <Link
                              href={leafHref}
                              className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--hover-bg)] transition-colors cursor-pointer flex-1 min-w-0"
                            >
                              {leafContent}
                            </Link>
                          ) : (
                            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md flex-1 min-w-0">
                              {leafContent}
                            </div>
                          )}
                          <button
                            type="button"
                            className="opacity-0 group-hover/leaf:opacity-100 p-1 rounded hover:bg-[var(--status-error-muted)] text-[var(--text-tertiary)]/50 hover:text-[var(--status-error)] transition-all shrink-0"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              removeLeafFromNode(id, leaf.id);
                            }}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      <Handle type="source" position={Position.Right} style={sourceHandleStyle} />

      {/* NodeToolbar - appears on hover/selection */}
      <NodeToolbar position={Position.Right} offset={8} className="flex gap-1.5 nodrag">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="canvas-outline"
                size="icon-sm"
                className="rounded-full hover:border-[var(--status-info)]/60 hover:bg-[var(--status-info-muted)] hover:text-[var(--status-info)]"
                onClick={handleAddUnit}
                aria-label="Add Unit"
              >
                <MessageSquarePlus size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={4}>
              <p className="text-xs">Continue conversation</p>
            </TooltipContent>
          </Tooltip>
          {data.branchType === 'branch' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="canvas-outline"
                  size="icon-sm"
                  className="rounded-full hover:border-[var(--accent-pending)]/60 hover:bg-[var(--accent-pending)]/10 hover:text-[var(--accent-pending)] disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={handleMerge}
                  aria-label="Start Merge"
                  disabled={!canTriggerMerge}
                >
                  <GitMerge size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={4}>
                <p className="text-xs">
                  {canTriggerMerge ? 'Merge branch to main' : 'Merge requires main branch commit'}
                </p>
              </TooltipContent>
            </Tooltip>
          )}
        </TooltipProvider>
      </NodeToolbar>
    </>
  );
}

export const canvasNodeTypes = {
  unit: UnitNode,
};
