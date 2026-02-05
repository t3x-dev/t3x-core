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
  Trash2,
  Twitter,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { type ConversationContext, getConversationContext } from '@/lib/api';
import { nodeEnter, springConfig } from '@/lib/motion';
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

// Tone-based style configurations - Pro design with refined shadows and gradients
const toneStyles = {
  'main-latest': {
    border: 'border-blue-400/50',
    shadow: 'shadow-[0_4px_20px_-4px_rgba(59,130,246,0.25),0_0_0_1px_rgba(59,130,246,0.08)]',
    accent: 'text-blue-600 dark:text-blue-400',
    badgeBg: 'bg-gradient-to-r from-blue-600 to-indigo-600',
    zIndex: 'z-[4]',
  },
  'main-history': {
    border: 'border-blue-300/40 dark:border-blue-700/40',
    shadow: 'shadow-[0_2px_12px_-4px_rgba(59,130,246,0.15),0_0_0_1px_rgba(59,130,246,0.05)]',
    accent: 'text-blue-500 dark:text-blue-400',
    badgeBg: 'bg-blue-500',
    zIndex: 'z-[2]',
  },
  'branch-latest': {
    border: 'border-amber-400/50',
    shadow: 'shadow-[0_4px_20px_-4px_rgba(245,158,11,0.25),0_0_0_1px_rgba(245,158,11,0.08)]',
    accent: 'text-amber-600 dark:text-amber-400',
    badgeBg: 'bg-gradient-to-r from-amber-500 to-orange-500',
    zIndex: 'z-[4]',
  },
  'branch-history': {
    border: 'border-amber-300/40 dark:border-amber-700/40',
    shadow: 'shadow-[0_2px_12px_-4px_rgba(245,158,11,0.15),0_0_0_1px_rgba(245,158,11,0.05)]',
    accent: 'text-amber-500 dark:text-amber-400',
    badgeBg: 'bg-amber-500',
    zIndex: 'z-[2]',
  },
  staging: {
    border: 'border-slate-300/60 border-dashed dark:border-slate-700/60',
    shadow: 'shadow-[0_2px_12px_-4px_rgba(100,116,139,0.12),0_0_0_1px_rgba(100,116,139,0.06)]',
    accent: 'text-slate-500 dark:text-slate-400',
    badgeBg: 'bg-transparent border border-dashed border-slate-400 dark:border-slate-600',
    zIndex: 'z-[3]',
  },
  default: {
    border: 'border-slate-200 dark:border-slate-800',
    shadow: 'shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)]',
    accent: 'text-blue-600 dark:text-blue-400',
    badgeBg: 'bg-blue-600',
    zIndex: 'z-[2]',
  },
};

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
          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
          : 'bg-gray-100 dark:bg-gray-900/30 text-gray-600 dark:text-gray-400'
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
          ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
          : 'bg-gray-100 dark:bg-gray-900/30 text-gray-600 dark:text-gray-400'
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
          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700'
          : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700 line-through'
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
    <div className="commit-v3-content mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
      {/* Author badge */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-xs text-slate-400">by</span>
        <AuthorBadgeV3 author={commit.author} />
      </div>

      {/* Sentences - use TruncatedCommitView if source context available */}
      <div>
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
          Sentences ({commit.sentences.length})
        </div>
        {commit.sentences.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No sentences</p>
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
              <li key={s.id} className="text-xs text-slate-700 dark:text-slate-300 line-clamp-1">
                • {s.text}
              </li>
            ))}
            {remainingSentences > 0 && (
              <li className="text-xs text-slate-400">+{remainingSentences} more</li>
            )}
          </ul>
        )}
      </div>

      {/* Constraints (preview) */}
      {commit.constraints.length > 0 && (
        <div className="mt-2">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
            Constraints ({commit.constraints.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {displayConstraints.map((c) => (
              <ConstraintBadge key={c.id} constraint={c} />
            ))}
            {remainingConstraints > 0 && (
              <span className="text-xs text-slate-400 px-1 py-0.5">+{remainingConstraints}</span>
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
    <div className="commit-v4-content mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
      {/* Author badge */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-xs text-slate-400">by</span>
        <AuthorBadgeV4 author={commit.author} />
        {/* V4 badge */}
        <span className="text-[0.55rem] font-semibold px-1 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
          V4
        </span>
      </div>

      {/* Sentences (preview) */}
      <div>
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Sentences ({sentences.length})
        </div>
        {sentences.length === 0 ? (
          <p className="mt-1 text-xs text-slate-400 italic">No sentences</p>
        ) : (
          <>
            <ul className="mt-1 space-y-0.5">
              {displaySentences.map((s) => (
                <li key={s.id} className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2">
                  <span className="text-slate-400 font-mono text-xs mr-1">{s.id}</span>
                  {s.text}
                </li>
              ))}
            </ul>
            {/* Footer with +N more and View full */}
            <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800">
              {remainingSentences > 0 ? (
                <span className="text-xs text-slate-400">
                  +{remainingSentences} sentence{remainingSentences !== 1 ? 's' : ''}
                </span>
              ) : (
                <span />
              )}
              {onViewFull && (
                <button
                  type="button"
                  onClick={onViewFull}
                  className="inline-flex items-center gap-0.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
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
      <div className="mt-2 px-2 py-1.5 bg-amber-50 dark:bg-amber-950/30 rounded border border-amber-200 dark:border-amber-800">
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Constraints are defined in Leaves
        </p>
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

  // Get tone-based styles
  const toneKey = isStaging ? 'staging' : tone || 'default';
  const styles = toneStyles[toneKey as keyof typeof toneStyles] || toneStyles.default;

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

  const handleOpenLeafPanel = () => {
    openLeafPanel(id);
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
      const terminalStatuses = new Set(['passed', 'failed', 'stopped', 'error']);
      const hasOutput = firstLeaf.status ? terminalStatuses.has(firstLeaf.status) : false;
      return {
        label: hasOutput ? 'View Results' : 'Preview Output',
        icon: hasOutput ? Eye : ArrowRight,
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
  const constraintCount = data.commitV4
    ? 0 // V4: constraints are in leaves
    : data.commitV3
      ? data.commitV3.constraints.length
      : (data.mustHave?.length || 0) + (data.mustntHave?.length || 0);

  return (
    <>
      <Handle type="target" position={Position.Left} style={targetHandleStyle} />

      <motion.div
        variants={nodeEnter}
        initial="initial"
        animate="animate"
        exit="exit"
        whileHover={{ scale: 1.01, transition: springConfig.smooth }}
        whileTap={{ scale: 0.995 }}
        className={cn(
          'group w-72 rounded-xl border overflow-visible text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900',
          styles.border,
          styles.shadow,
          styles.zIndex,
          selected && 'shadow-[0_0_0_2px_rgba(79,70,229,0.5),0_0_16px_rgba(79,70,229,0.1)]',
          data.highlightMode === 'main' &&
            'shadow-[0_0_0_2px_rgba(59,130,246,0.5),0_0_16px_rgba(59,130,246,0.1)]',
          data.highlightMode === 'branch' &&
            'shadow-[0_0_0_2px_rgba(245,158,11,0.5),0_0_16px_rgba(245,158,11,0.1)]'
        )}
        style={{ willChange: 'transform' }}
      >
        {/* ═══════════════════════════════════════════
            SECTION 1: SOURCES (if any)
            ═══════════════════════════════════════════ */}
        {data.sources && data.sources.length > 0 && (
          <div
            className="px-3 py-2 bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-700 rounded-t-[11px] cursor-pointer hover:bg-slate-100/80 dark:hover:bg-slate-700/80 transition-colors nodrag"
            onClick={(e) => {
              e.stopPropagation();
              openNodeModal(id, 'conversation');
            }}
          >
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-400 uppercase tracking-wider">Sources</span>
              {/* Context indicator */}
              {(() => {
                const ctxLabel = getContextLabel();
                return ctxLabel ? (
                  <>
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <span className="text-slate-400 font-medium">{ctxLabel}</span>
                  </>
                ) : null;
              })()}
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <TooltipProvider delayDuration={200}>
                {data.sources.map((source, idx) => {
                  const Icon = SOURCE_ICONS[source.type] || FileText;
                  const sourceIsPinned =
                    source.type === 'conversation' && isPinned('conversation', source.id);
                  return (
                    <span key={source.id} className="inline-flex items-center gap-0.5">
                      {idx > 0 && (
                        <span className="text-slate-300 dark:text-slate-600 mx-0.5">·</span>
                      )}
                      {sourceIsPinned && (
                        <Pin
                          size={10}
                          className="text-amber-500 dark:text-amber-400 fill-amber-500 dark:fill-amber-400"
                        />
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-0.5">
                            <Icon size={10} className="text-slate-400" />
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
          <div className="flex items-start justify-between gap-2 mb-2">
            <h4 className="m-0 text-sm font-semibold text-slate-800 dark:text-slate-200 leading-snug flex-1 min-w-0">
              {data.title}
            </h4>
            <span
              className={cn(
                'flex-shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded',
                data.branchType === 'main'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
              )}
            >
              {branchLabel}
            </span>
          </div>

          {/* B-8: Stats line (always visible in collapsed view) */}
          {(sentenceCount > 0 || constraintCount > 0) && (
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              {sentenceCount} sentence{sentenceCount !== 1 ? 's' : ''}
              {constraintCount > 0 && (
                <>
                  <span className="text-slate-300 dark:text-slate-600 mx-1">·</span>
                  {constraintCount} constraint{constraintCount !== 1 ? 's' : ''}
                </>
              )}
            </div>
          )}

          {/* B-4: Next Step button */}
          {nextStep && (
            <button
              type="button"
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 mb-2 rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors nodrag"
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
              className="w-full flex items-center justify-center gap-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-400 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors nodrag"
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
              <div className="flex items-center gap-1.5 text-[0.7rem] text-slate-400 mb-2 mt-2 nodrag">
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={handleCopyHash}
                        className="inline-flex items-center gap-1 font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-1.5 py-0.5 rounded text-xs transition-colors cursor-pointer"
                      >
                        {data.commitV4?.hash
                          ? data.commitV4.hash.slice(0, 7)
                          : data.commitV3?.hash
                            ? data.commitV3.hash.slice(0, 7)
                            : data.commitHash
                              ? data.commitHash.slice(0, 7)
                              : data.entryId?.slice(0, 7)}
                        {copiedHash ? (
                          <CheckCircle size={10} className="text-green-500 dark:text-green-400" />
                        ) : (
                          <Copy size={10} className="text-slate-400" />
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
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <span className="text-purple-600 dark:text-purple-400 font-medium">merge</span>
                  </>
                )}
              </div>

              {/* Status indicator */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  {isStaging ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <PenSquare size={12} className="text-amber-500 dark:text-amber-400" />
                      <span>Draft</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                      <GitCommit
                        size={12}
                        className={
                          data.branchType === 'main'
                            ? 'text-blue-500 dark:text-blue-400'
                            : 'text-amber-500 dark:text-amber-400'
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
                      <span className="text-green-600 dark:text-green-400">
                        {data.mustHave?.length || 0}✓
                      </span>{' '}
                      <span className="text-red-500 dark:text-red-400">
                        {data.mustntHave?.length || 0}✗
                      </span>
                    </span>
                  )}
                {!data.commitV3 && !isStaging && data.summary && (
                  <span className="text-xs text-slate-400 truncate max-w-[100px]">
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
          <div className="border-t border-slate-100 dark:border-slate-700">
            <button
              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors"
              onClick={() => setLeavesExpanded((prev) => !prev)}
              type="button"
            >
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Leaves ({data.leaves.length})
                {totalAssertions > 0 && (
                  <span className="ml-1.5 normal-case font-normal">
                    <span className="text-green-600 dark:text-green-400">{totalPassed}</span>
                    <span className="text-slate-300 dark:text-slate-600">/</span>
                    <span className="text-slate-500 dark:text-slate-400">{totalAssertions}</span>
                  </span>
                )}
              </span>
              <ChevronRight
                size={12}
                className={cn(
                  'text-slate-400 transition-transform duration-200',
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
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  <div className="px-3 pb-2 space-y-1 nodrag">
                    {data.leaves.map((leaf) => {
                      const LeafIcon = getLeafIcon(leaf.type);
                      const leafHref = getLeafHref(leaf);
                      const leafContent = (
                        <>
                          <div className="w-5 h-5 rounded flex items-center justify-center bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                            <LeafIcon size={12} />
                          </div>
                          <span className="text-xs text-slate-700 dark:text-slate-300 flex-1 truncate">
                            {leaf.title}
                          </span>
                        </>
                      );
                      return (
                        <div key={leaf.id} className="group/leaf flex items-center gap-1">
                          {leafHref ? (
                            <Link
                              href={leafHref}
                              className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-100/80 dark:hover:bg-slate-700/80 transition-colors cursor-pointer flex-1 min-w-0"
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
                            className="opacity-0 group-hover/leaf:opacity-100 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 transition-all shrink-0"
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

        {/* Add Leaf button for committed units */}
        {isCommitted && (
          <div className="border-t border-slate-100 dark:border-slate-700 px-3 py-2">
            <button
              className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-400 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              onClick={handleOpenLeafPanel}
              type="button"
            >
              <Plus size={12} />
              <span>Add output</span>
            </button>
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
                className="rounded-full hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950 dark:hover:border-blue-500 dark:hover:text-blue-400"
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
                  className="rounded-full hover:border-orange-400 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-950 dark:hover:border-orange-500 dark:hover:text-orange-400 disabled:opacity-40 disabled:cursor-not-allowed"
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
