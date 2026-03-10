import type { Node, NodeProps } from '@xyflow/react';
import { Handle, NodeToolbar, Position, useStore } from '@xyflow/react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Copy,
  FileOutput,
  FilePlus,
  FileText,
  GitBranch,
  GitCommit,
  GitMerge,
  Globe,
  Loader2,
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
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import type { ComponentType } from 'react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AutoDraftBadge } from '@/components/canvas/AutoDraftBadge';
import { SealAnimation } from '@/components/canvas/SealAnimation';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { leafContextMenuHandlerRef } from '@/hooks/useContextMenu';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTerminology } from '@/hooks/useTerminology';
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
// Must match @t3x-dev/core LeafType from V4 schema
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
const CommitV3Content = memo(function CommitV3Content({
  commit,
  onViewFull,
  projectId,
  maxSentences = PREVIEW_MAX_SENTENCES,
}: {
  commit: CommitV3Display;
  onViewFull?: () => void;
  projectId?: string;
  maxSentences?: number;
}) {
  // Check if we have source context for truncated view
  const sentencesWithSource = commit.sentences.filter((s) => s.source?.turn_hash);
  const hasSourceContext = sentencesWithSource.length > 0;

  // Preview mode: limit sentences and constraints
  const displaySentences = commit.sentences.slice(0, maxSentences);
  const remainingSentences = commit.sentences.length - maxSentences;
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
});

/**
 * CommitV4 content section - shows sentences only (constraints are in Leaves)
 * Header (title, branch, hash, status) is rendered by parent UnitNode
 *
 * Note: V4 sentences use source_ref (conversation_id + turn_hash) without
 * character positions, so we show a compact list with View full link.
 */
const CommitV4Content = memo(function CommitV4Content({
  commit,
  onViewFull,
  projectId: _projectId, // Reserved for future TruncatedCommitView integration
  maxSentences = PREVIEW_MAX_SENTENCES,
}: {
  commit: CommitV4Display;
  onViewFull?: () => void;
  projectId?: string;
  maxSentences?: number;
}) {
  const sentences = commit.content.sentences;
  const displaySentences = sentences.slice(0, maxSentences);
  const remainingSentences = sentences.length - maxSentences;

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
                <li
                  key={s.id}
                  className="flex items-start gap-1 text-xs text-[var(--text-secondary)]"
                >
                  {s.confidence !== undefined && (
                    <span
                      className={cn(
                        'inline-block w-1.5 h-1.5 rounded-full mt-1 shrink-0',
                        s.confidence >= 0.8
                          ? 'bg-[var(--status-success)]'
                          : s.confidence >= 0.5
                            ? 'bg-amber-500'
                            : 'bg-[var(--status-error)]'
                      )}
                      title={`${Math.round(s.confidence * 100)}%`}
                    />
                  )}
                  <span className="text-[var(--text-tertiary)] font-mono text-[11px] shrink-0">
                    {s.id}
                  </span>
                  <span className="line-clamp-2">{s.text}</span>
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
});

// Semantic zoom — 3-tier with hysteresis
// overview (dots) at very low zoom, default (cards), detail (expanded) at high zoom
type ZoomTier = 'overview' | 'default' | 'detail';

const OVERVIEW_ENTER = 0.35;
const OVERVIEW_EXIT = 0.45;
const DETAIL_ENTER = 1.2;
const DETAIL_EXIT = 1.0;

const constellationColors: Record<string, string> = {
  committed: '#3b82f6',
  staging: '#f97316',
  conversation: '#818cf8',
  leaf: '#10b981',
};

function useSemanticZoom(): ZoomTier {
  const zoom = useStore((s) => s.transform[2]);
  const tierRef = useRef<ZoomTier>('default');

  if (tierRef.current === 'overview' && zoom > OVERVIEW_EXIT) {
    tierRef.current = zoom > DETAIL_ENTER ? 'detail' : 'default';
  } else if (tierRef.current === 'default') {
    if (zoom < OVERVIEW_ENTER) tierRef.current = 'overview';
    else if (zoom > DETAIL_ENTER) tierRef.current = 'detail';
  } else if (tierRef.current === 'detail' && zoom < DETAIL_EXIT) {
    tierRef.current = zoom < OVERVIEW_ENTER ? 'overview' : 'default';
  }

  return tierRef.current;
}

/**
 * NodeLeavesSection - Renders the expandable leaves list for a commit node.
 * Extracted and memoized to avoid re-rendering the leaf list when unrelated
 * node state (e.g. content expansion, hover lineage) changes.
 */
const NodeLeavesSection = memo(function NodeLeavesSection({
  leaves,
  totalPassed,
  totalAssertions,
  leavesExpanded,
  setLeavesExpanded,
  isDetail,
  prefersReducedMotion,
  projectId,
  nodeId,
  leafContextMenuHandler,
  removeLeafFromNode,
}: {
  leaves: EmbeddedLeaf[];
  totalPassed: number;
  totalAssertions: number;
  leavesExpanded: boolean;
  setLeavesExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  isDetail: boolean;
  prefersReducedMotion: boolean;
  projectId?: string;
  nodeId: string;
  leafContextMenuHandler:
    | ((e: React.MouseEvent, leafId: string, nodeId: string) => void)
    | null
    | undefined;
  removeLeafFromNode: (nodeId: string, leafId: string) => void;
}) {
  const getLeafHref = (leaf: EmbeddedLeaf): string | undefined => {
    if (!projectId || !leaf.id) return undefined;
    return `/project/${projectId}/leaf/${leaf.id}`;
  };

  return (
    <div className="border-t border-[var(--stroke-divider)]">
      <button
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[var(--hover-bg)] transition-colors"
        onClick={() => setLeavesExpanded((prev) => !prev)}
        type="button"
      >
        <span className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
          Leaves ({leaves.length})
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
            (leavesExpanded || isDetail) && 'rotate-90'
          )}
        />
      </button>
      <AnimatePresence>
        {(leavesExpanded || isDetail) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2 space-y-1 nodrag">
              {leaves.map((leaf) => {
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
                          'inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded',
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
                        {leaf.status === 'running' && (
                          <Loader2 size={10} className="animate-spin" />
                        )}
                        {leaf.status === 'passed' && <Check size={10} />}
                        {leaf.status === 'failed' && <X size={10} />}
                        {leaf.status === 'pending' && <Clock size={10} />}
                        {leaf.status === 'idle' && <Circle size={10} />}
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
                    onContextMenu={(e) => leafContextMenuHandler?.(e, leaf.id, nodeId)}
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
                        removeLeafFromNode(nodeId, leaf.id);
                      }}
                      aria-label={`Remove leaf ${leaf.title || leaf.id}`}
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
  );
});

// Unit Node - 3-Section Layout: Sources → Commit → Leaves
const UnitNode = memo(function UnitNode(props: Props) {
  const { data, selected, id } = props;
  const [leavesExpanded, setLeavesExpanded] = useState(false);
  const [contentExpandedManual, setContentExpandedManual] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const [showLineage, setShowLineage] = useState(false);
  const lineageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const params = useParams();
  const projectId = params?.projectId as string | undefined;
  const prefersReducedMotion = useReducedMotion();
  const zoomTier = useSemanticZoom();
  const isConstellation = zoomTier === 'overview';
  const isDetail = zoomTier === 'detail';
  // Detail zoom tier auto-expands content and leaves
  const contentExpanded = contentExpandedManual || isDetail;

  const { t } = useTerminology();
  const tone = useCanvasStore((state) => state.getCommitTone(id));
  const addUnitFromUnit = useCanvasStore((state) => state.addUnitFromUnit);
  const startMergeFromCommit = useCanvasStore((state) => state.createMergePendingCommit);
  const hasMainCommit = useCanvasStore((state) => state.hasMainCommit);
  const openLeafPanel = useCanvasStore((state) => state.openLeafPanel);
  const removeLeafFromNode = useCanvasStore((state) => state.removeLeafFromNode);
  // Read from module-level ref to avoid Zustand re-renders on every callback update
  const leafContextMenuHandler = leafContextMenuHandlerRef.current;
  const openNodeModal = useCanvasStore((state) => state.openNodeModal);
  const loadProjectData = useCanvasStore((state) => state.loadProjectData);
  const notify = useProjectStore((state) => state.notifyCallback);

  // Pin store
  const { isPinned } = usePinsStore();

  // Context config state
  const [contextConfig, setContextConfig] = useState<ConversationContext | null>(null);

  // Fetch context config on mount (skip virtual orphan conversations)
  useEffect(() => {
    if (!data.conversationId || data.conversationId.startsWith('orphan-')) return;

    let cancelled = false;
    getConversationContext(data.conversationId)
      .then((ctx) => {
        if (!cancelled) setContextConfig(ctx);
      })
      .catch(() => {}); // Silent fail - context indicator just won't show
    return () => {
      cancelled = true;
    };
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

  // Cleanup lineage hover timer on unmount
  useEffect(() => {
    return () => {
      if (lineageTimerRef.current) clearTimeout(lineageTimerRef.current);
    };
  }, []);

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
    navigator.clipboard
      .writeText(hash)
      .then(() => {
        setCopiedHash(true);
        setTimeout(() => setCopiedHash(false), 2000);
      })
      .catch(() => {}); // Silently fail on clipboard permission denial
  };

  // Lineage card hover handlers (400ms open delay, immediate close)
  const handleNodeMouseEnter = useCallback(() => {
    lineageTimerRef.current = setTimeout(() => setShowLineage(true), 400);
  }, []);
  const handleNodeMouseLeave = useCallback(() => {
    if (lineageTimerRef.current) {
      clearTimeout(lineageTimerRef.current);
      lineageTimerRef.current = null;
    }
    setShowLineage(false);
  }, []);

  // Navigate to leaf detail page
  const getLeafHref = (leaf: EmbeddedLeaf): string | undefined => {
    if (!projectId || !leaf.id) return undefined;
    return `/project/${projectId}/leaf/${leaf.id}`;
  };

  // B-4: Next Step button logic
  const getNextStep = (): { label: string; icon: typeof ArrowRight; action: () => void } | null => {
    // Draft nodes: navigate to draft workspace
    if (isDraft && data.draftId && projectId) {
      return {
        label: 'Open Draft',
        icon: PenSquare,
        action: () => router.push(`/project/${projectId}/draft/${data.draftId}`),
      };
    }
    if (isStaging && !data.conversationId) {
      return {
        label: 'Start Conversation',
        icon: MessageSquarePlus,
        action: () => openNodeModal(id, 'conversation'),
      };
    }
    if (isStaging && data.conversationId) {
      return {
        label: t('create_commit'),
        icon: GitCommit,
        action: () => openNodeModal(id, 'commit'),
      };
    }
    if (isCommitted) {
      return {
        label: 'Create Output',
        icon: Plus,
        action: () => openLeafPanel(id),
      };
    }
    return null;
  };

  const nextStep = getNextStep();

  // B-8: Compute stats for collapsed view
  const sentenceCount = isDraft
    ? 0 // Draft shows its own summary in title area
    : data.commitV4
      ? data.commitV4.content.sentences.length
      : data.commitV3
        ? data.commitV3.sentences.length
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
            boxShadow: `0 0 8px ${color}40, 0 0 2px ${color}80`,
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
        onMouseEnter={handleNodeMouseEnter}
        onMouseLeave={handleNodeMouseLeave}
        className={cn(
          'relative group w-72 rounded-xl overflow-visible elevation-1',
          glass.cardNode,
          glass.highlight,
          // Draft: dashed amber border
          isDraft && 'border-dashed border-2 border-amber-500/70',
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
        aria-label={`${data.title} — ${isDraft ? t('draft') : isStaging ? t('draft') : t('committed')} on ${branchLabel}${sentenceCount > 0 ? `, ${sentenceCount} sentences` : ''}`}
        aria-selected={selected}
        data-node-type={isDraft ? 'draft' : isStaging ? 'conversation' : 'commit'}
        tabIndex={0}
      >
        {/* Staging border — static dashed outline */}
        {isStaging && (
          <div
            className="pointer-events-none absolute inset-0 rounded-[16px] border-2 border-dashed border-orange-500/60"
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

        {/* Lineage summary card — appears on hover after 400ms */}
        {showLineage && isCommitted && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 pointer-events-none">
            <div
              className={cn(
                'rounded-lg px-3 py-2 text-xs min-w-[200px] max-w-[260px] shadow-lg border border-[var(--stroke-divider)]',
                glass.cardNode
              )}
            >
              {/* Branch + hash */}
              <div className="flex items-center gap-1.5 mb-1.5">
                {data.branchType === 'main' ? (
                  <GitCommit size={11} className={toneAccent.commit.text} />
                ) : (
                  <GitBranch size={11} className={toneAccent.branch.text} />
                )}
                <span className="font-medium text-[var(--text-primary)]">{branchLabel}</span>
                {(data.commitV4?.hash || data.commitV3?.hash || data.commitHash) && (
                  <span className="font-mono text-[var(--text-tertiary)] text-[10px]">
                    {(data.commitV4?.hash || data.commitV3?.hash || data.commitHash || '')
                      .replace('sha256:', '')
                      .slice(0, 7)}
                  </span>
                )}
              </div>
              {/* Stats rows */}
              <div className="space-y-0.5 text-[var(--text-secondary)]">
                {data.isMergeCommit && (
                  <div className="flex items-center gap-1.5">
                    <GitMerge size={10} className="text-[var(--text-tertiary)]" />
                    <span>Merge commit</span>
                  </div>
                )}
                {data.sources && data.sources.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <MessageCircle size={10} className="text-[var(--text-tertiary)]" />
                    <span>
                      {data.sources.length} source{data.sources.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
                {sentenceCount > 0 && (
                  <div className="flex items-center gap-1.5">
                    <FileText size={10} className="text-[var(--text-tertiary)]" />
                    <span>
                      {sentenceCount} sentence{sentenceCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
                {data.leaves && data.leaves.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Rocket size={10} className="text-[var(--text-tertiary)]" />
                    <span>
                      {data.leaves.length} {data.leaves.length === 1 ? 'leaf' : 'leaves'}
                      {totalAssertions > 0 && (
                        <span className="ml-1">
                          (<span className="text-[var(--status-success)]">{totalPassed}</span>
                          <span className="text-[var(--text-tertiary)]">/</span>
                          <span>{totalAssertions}</span>)
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

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
            {isDraft ? (
              <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 inline-flex items-center gap-0.5">
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

          {/* Import source badge */}
          {data.importSource && (
            <div className="flex items-center gap-1 mb-[var(--space-item)]">
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30">
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
                setContentExpandedManual((prev) => !prev);
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
                    <span className={cn('font-medium', toneAccent.conversation.text)}>
                      {t('merge').toLowerCase()}
                    </span>
                  </>
                )}
              </div>

              {/* Merge summary one-liner */}
              {data.isMergeCommit &&
                data.commitV4?.merge_summary &&
                (() => {
                  const ms = data.commitV4.merge_summary;
                  const parts = [
                    `${ms.total_sentences} kept`,
                    `${ms.resolved_conflicts} ${t('resolved').toLowerCase()}`,
                  ];
                  if (ms.discarded > 0) parts.push(`${ms.discarded} discarded`);
                  return (
                    <div className="text-[10px] text-[var(--text-tertiary)] mb-1 flex items-center gap-1.5">
                      <span className="truncate">{parts.join(' · ')}</span>
                      {ms.release_note && (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="shrink-0 p-0.5 rounded hover:bg-[var(--hover-bg)] text-[var(--text-tertiary)] hover:text-[var(--accent-commit)] transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const note = ms.release_note!;
                                  const md = [
                                    `# ${note.title}`,
                                    '',
                                    `**Summary:** ${note.summary}`,
                                    '',
                                  ];
                                  for (const sec of note.sections) {
                                    md.push(`## ${sec.heading}`, '');
                                    for (const item of sec.items) md.push(`- ${item}`);
                                    md.push('');
                                  }
                                  navigator.clipboard.writeText(md.join('\n')).then(
                                    () => notify?.('Release note copied', 'success'),
                                    () => notify?.('Failed to copy', 'error')
                                  );
                                }}
                              >
                                <FileOutput size={10} />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              Copy release note
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  );
                })()}

              {/* Status indicator */}
              <div className="flex items-center justify-between mb-[var(--space-item)]">
                <div className="flex items-center gap-1.5">
                  {isStaging ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                      <PenSquare size={12} className={toneAccent.pending.text} />
                      <span>{t('draft')}</span>
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
                      <span>{t('committed')}</span>
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
                  maxSentences={isDetail ? Number.MAX_SAFE_INTEGER : PREVIEW_MAX_SENTENCES}
                />
              )}
              {data.commitV3 && !data.commitV4 && (
                <CommitV3Content
                  commit={data.commitV3}
                  onViewFull={() => openNodeModal(id, 'commit')}
                  projectId={projectId}
                  maxSentences={isDetail ? Number.MAX_SAFE_INTEGER : PREVIEW_MAX_SENTENCES}
                />
              )}
            </>
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
                  {canTriggerMerge
                    ? `${t('merge')} ${t('branch')} to main`
                    : `${t('merge')} requires main ${t('branch')} ${t('commit')}`}
                </p>
              </TooltipContent>
            </Tooltip>
          )}
        </TooltipProvider>
      </NodeToolbar>
    </>
  );
});

export const canvasNodeTypes = {
  unit: UnitNode,
};
