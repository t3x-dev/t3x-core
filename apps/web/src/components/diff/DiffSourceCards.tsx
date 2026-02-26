'use client';

/**
 * DiffSourceCards — Layer 1 provenance: macro-level source overview.
 *
 * Shows all contributing source conversations as horizontal cards.
 * Cards are clickable to scroll to the first sentence from that source.
 */

import { ChevronDown, ChevronRight, Leaf, MessageSquare } from 'lucide-react';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';
import type { SourceInfo } from './DiffPage';

// ============================================================================
// Types
// ============================================================================

interface DiffSourceCardsProps {
  sourceMap: Map<string, SourceInfo>;
  collapsed: boolean;
  onToggle: () => void;
  onScrollToSource: (conversationId: string) => void;
}

// ============================================================================
// Component
// ============================================================================

export function DiffSourceCards({
  sourceMap,
  collapsed,
  onToggle,
  onScrollToSource,
}: DiffSourceCardsProps) {
  const sources = Array.from(sourceMap.values());

  if (sources.length === 0) return null;

  return (
    <div className="border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] shrink-0">
      {/* Section toggle */}
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 px-6 py-2 w-full text-left hover:bg-[var(--hover-bg)] transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
        )}
        <span className="text-xs font-medium text-[var(--text-secondary)]">Sources</span>
        <span className="text-xs text-[var(--text-tertiary)]">({sources.length})</span>
      </button>

      {/* Cards row */}
      {!collapsed && (
        <div className="px-6 pb-3 flex gap-3 overflow-x-auto">
          {sources.map((source) => (
            <SourceCard
              key={source.conversationId}
              source={source}
              onClick={() => onScrollToSource(source.conversationId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SourceCard
// ============================================================================

function SourceCard({ source, onClick }: { source: SourceInfo; onClick: () => void }) {
  const Icon = source.type === 'leaf' ? Leaf : MessageSquare;
  const totalSentences = Math.max(source.baseSentenceCount, source.targetSentenceCount);
  const delta = source.targetSentenceCount - source.baseSentenceCount;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col gap-1.5 min-w-[180px] max-w-[240px] px-4 py-3 rounded-lg text-left transition-all cursor-pointer',
        glass.cardBase,
        'hover:border-[var(--accent-commit)]/40'
      )}
    >
      {/* Title row */}
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--accent-conversation)]" />
        <span className="text-sm font-medium text-[var(--text-primary)] truncate">
          {source.title || source.conversationId.slice(0, 12)}
        </span>
        {source.isNew && (
          <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--diff-added-line)]/15 text-[var(--diff-added-line)]">
            NEW
          </span>
        )}
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
        <span>
          {totalSentences} sentence{totalSentences !== 1 ? 's' : ''}
        </span>
        {source.branch && (
          <>
            <span className="text-[var(--stroke-divider)]">·</span>
            <span className="truncate">{source.branch}</span>
          </>
        )}
      </div>

      {/* Delta summary */}
      {delta !== 0 && !source.isNew && (
        <div className="text-[10px] text-[var(--text-tertiary)]">
          {delta > 0 ? (
            <span className="text-[var(--diff-added-line)]">+{delta} new</span>
          ) : (
            <span className="text-[var(--diff-removed-line)]">{delta} removed</span>
          )}
        </div>
      )}
    </button>
  );
}
