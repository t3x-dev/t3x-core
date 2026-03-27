'use client';

/**
 * TruncatedCommitView - Compact commit display with smart truncation
 *
 * Features:
 * - Prioritizes showing highlighted (selected) content
 * - Shows ~50 chars context around highlights
 * - Word-boundary aware truncation
 * - "+N more nodes" indicator when truncated
 * - "View full" action to expand
 *
 * Edge Case Handling (Issue #222):
 * - Legacy data (no source): Shows node text directly
 * - Source unavailable: Shows gray badge with fallback text
 *
 * @see https://github.com/t3x-dev/T3X/issues/219
 * @see https://github.com/t3x-dev/T3X/issues/222
 */

import { ChevronRight, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ViewSourceLink } from '@/components/shared/ViewSourceLink';
import type { TurnContextData } from '@/lib/api';
import * as api from '@/lib/api';
import { truncateWithHighlights } from '@/lib/truncationUtils';
import type { HighlightRange, NodeWithSource } from '@/types/sourceContext';

// ═══════════════════════════════════════════════════════════════════════════
// Types (using shared types)
// ═══════════════════════════════════════════════════════════════════════════

/** ContentNode from commit content - alias for NodeWithSource */
type CommitContentNode = NodeWithSource;

interface TruncatedCommitViewProps {
  /** ContentNodes from commit content */
  nodes: CommitContentNode[];
  /** Maximum number of highlights to show fully (default: 2) */
  maxHighlights?: number;
  /** Context chars around each highlight (default: 50) */
  contextChars?: number;
  /** Callback when "View full" is clicked */
  onViewFull?: () => void;
  /** Show loading state */
  loading?: boolean;
  /** Project ID for View Source links (optional) */
  projectId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Turn data with highlights and context
 */
interface TurnWithHighlights {
  turnHash: string;
  context: TurnContextData | null;
  highlights: HighlightRange[];
  loading: boolean;
  error: string | null;
}

/**
 * Group nodes by turn_hash, separating legacy data
 */
function groupNodesByTurn(nodes: CommitContentNode[]): {
  byTurn: Map<string, HighlightRange[]>;
  legacyNodes: CommitContentNode[];
} {
  const byTurn = new Map<string, HighlightRange[]>();
  const legacyNodes: CommitContentNode[] = [];

  for (const node of nodes) {
    // Handle legacy data without source field
    if (!node.source?.turn_hash) {
      legacyNodes.push(node);
      continue;
    }

    const turnHash = node.source.turn_hash;
    const highlights = byTurn.get(turnHash) || [];
    highlights.push({
      start: node.source.start_char,
      end: node.source.end_char,
    });
    byTurn.set(turnHash, highlights);
  }

  return { byTurn, legacyNodes };
}

export function TruncatedCommitView({
  nodes,
  maxHighlights = 2,
  contextChars = 50,
  onViewFull,
  loading: externalLoading,
  projectId,
}: TruncatedCommitViewProps) {
  const [turnData, setTurnData] = useState<Map<string, TurnWithHighlights>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  // Group nodes by turn, separating legacy data
  const { byTurn: nodesByTurn, legacyNodes } = useMemo(
    () => groupNodesByTurn(nodes),
    [nodes]
  );

  // Check if all nodes are legacy (no source info)
  const allLegacy = legacyNodes.length === nodes.length;

  // Get ordered list of unique turn hashes
  const turnHashes = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const node of nodes) {
      if (!node.source?.turn_hash) continue;
      const hash = node.source.turn_hash;
      if (!seen.has(hash)) {
        seen.add(hash);
        ordered.push(hash);
      }
    }
    return ordered;
  }, [nodes]);

  // Count total nodes for "+N more" indicator
  const totalHighlightsCount = useMemo(() => {
    return nodes.length;
  }, [nodes]);

  // Visible highlights count (across all turns, up to maxHighlights per turn)
  const visibleHighlightsCount = useMemo(() => {
    let count = 0;
    for (const turnHash of turnHashes.slice(0, 2)) {
      // Show max 2 turns
      const highlights = nodesByTurn.get(turnHash) || [];
      count += Math.min(highlights.length, maxHighlights);
    }
    // Include legacy nodes if we have room
    if (legacyNodes.length > 0 && turnHashes.length < 2) {
      count += Math.min(legacyNodes.length, maxHighlights);
    }
    return count;
  }, [turnHashes, nodesByTurn, maxHighlights, legacyNodes]);

  const hiddenCount = totalHighlightsCount - visibleHighlightsCount;

  // Create stable key for effect dependency (avoid re-fetching on every render)
  const turnHashesKey = useMemo(() => turnHashes.slice(0, 2).join(','), [turnHashes]);

  // Fetch context for first 2 turns only
  useEffect(() => {
    if (turnHashes.length === 0) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchContexts = async () => {
      setIsLoading(true);

      const newData = new Map<string, TurnWithHighlights>();
      const hashesToFetch = turnHashes.slice(0, 2); // Max 2 turns in compact view

      await Promise.all(
        hashesToFetch.map(async (turnHash) => {
          const highlights = nodesByTurn.get(turnHash) || [];

          try {
            const context = await api.fetchTurnContextCached(turnHash, {
              before: 0,
              after: 0,
            });

            newData.set(turnHash, {
              turnHash,
              context,
              highlights,
              loading: false,
              error: null,
            });
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Failed to load context';
            newData.set(turnHash, {
              turnHash,
              context: null,
              highlights,
              loading: false,
              error: errorMsg,
            });
          }
        })
      );

      // Only update state if component is still mounted
      if (!cancelled) {
        setTurnData(newData);
        setIsLoading(false);
      }
    };

    fetchContexts();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Use stable key instead of Map reference
  }, [turnHashesKey]);

  // Handle empty nodes
  if (nodes.length === 0) {
    return (
      <div className="px-2 py-1.5 text-xs text-[var(--color-text-muted)] italic">No nodes</div>
    );
  }

  // All legacy data - show simple node list with legacy badge
  if (allLegacy) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1 text-[0.65rem] text-[var(--color-text-muted)]">
          <span className="px-1 py-0.5 bg-[var(--hover-bg)] rounded text-[0.6rem]">Legacy</span>
        </div>
        {nodes.slice(0, maxHighlights).map((s) => (
          <div
            key={s.id}
            className="text-xs text-[var(--color-text-secondary)] bg-[var(--status-success-muted)] px-1.5 py-1 rounded line-clamp-2"
          >
            {s.text}
          </div>
        ))}
        {hiddenCount > 0 && (
          <div className="text-[0.65rem] text-[var(--color-text-muted)]">
            +{hiddenCount} more node{hiddenCount !== 1 ? 's' : ''}
          </div>
        )}
        {onViewFull && (
          <div className="pt-1 border-t border-[var(--color-border-light)]">
            <button
              type="button"
              onClick={onViewFull}
              className="inline-flex items-center gap-0.5 text-[0.65rem] text-[var(--status-info)] hover:text-[var(--status-info)] transition-colors"
            >
              View full
              <ChevronRight size={10} />
            </button>
          </div>
        )}
      </div>
    );
  }

  // Loading state
  if (isLoading || externalLoading) {
    return (
      <div className="flex items-center gap-2 px-2 py-2">
        <Loader2 className="h-3 w-3 animate-spin text-[var(--color-text-muted)]" />
        <span className="text-xs text-[var(--color-text-muted)]">Loading...</span>
      </div>
    );
  }

  // Check if any context was loaded
  const hasAnyContext = Array.from(turnData.values()).some((data) => data.context !== null);

  // Fallback to simple node list if no context loaded
  if (!hasAnyContext) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1 text-[0.65rem] text-[var(--color-text-muted)]">
          <span className="px-1 py-0.5 bg-[var(--color-border)] rounded text-[0.6rem]">
            Source unavailable
          </span>
        </div>
        {nodes.slice(0, maxHighlights).map((s) => (
          <div
            key={s.id}
            className="text-xs text-[var(--color-text-secondary)] bg-[var(--status-success-muted)] px-1.5 py-1 rounded line-clamp-2"
          >
            {s.text}
          </div>
        ))}
        {hiddenCount > 0 && (
          <div className="text-[0.65rem] text-[var(--color-text-muted)]">
            +{hiddenCount} more node{hiddenCount !== 1 ? 's' : ''}
          </div>
        )}
        {onViewFull && (
          <div className="pt-1 border-t border-[var(--color-border-light)]">
            <button
              type="button"
              onClick={onViewFull}
              className="inline-flex items-center gap-0.5 text-[0.65rem] text-[var(--status-info)] hover:text-[var(--status-info)] transition-colors"
            >
              View full
              <ChevronRight size={10} />
            </button>
          </div>
        )}
      </div>
    );
  }

  // Render truncated view
  return (
    <div className="space-y-2">
      {turnHashes.slice(0, 2).map((turnHash) => {
        const data = turnData.get(turnHash);
        if (!data || data.error || !data.context?.target_turn) {
          return null;
        }

        const turn = data.context.target_turn;
        const segments = truncateWithHighlights(turn.content, data.highlights, {
          contextChars,
          maxHighlights,
        });

        // Get first highlight for View Source link
        const firstHighlight = data.highlights[0];
        const conversationId = data.context.conversation_id;

        return (
          <div key={turnHash} className="text-xs leading-relaxed">
            {/* Role indicator + View Source link */}
            <div className="flex items-center justify-between">
              <span className="text-[0.6rem] font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
                {turn.role}
              </span>
              {projectId && conversationId && (
                <ViewSourceLink
                  projectId={projectId}
                  conversationId={conversationId}
                  turnHash={turnHash}
                  startChar={firstHighlight?.start}
                  endChar={firstHighlight?.end}
                  className="text-[0.6rem] text-[var(--status-info)] hover:text-[var(--status-info)]"
                >
                  View Source
                </ViewSourceLink>
              )}
            </div>
            {/* Truncated content with highlights */}
            <div className="mt-0.5 text-[var(--color-text-secondary)]">
              {segments.map((seg, idx) => {
                if (seg.type === 'ellipsis') {
                  return (
                    <span key={idx} className="text-[var(--color-text-muted)]">
                      {seg.content}
                    </span>
                  );
                }
                if (seg.type === 'highlight') {
                  return (
                    <mark
                      key={idx}
                      className="bg-green-200 dark:bg-green-700 text-green-900 dark:text-green-200 px-0.5 rounded-sm"
                    >
                      {seg.content}
                    </mark>
                  );
                }
                return <span key={idx}>{seg.content}</span>;
              })}
            </div>
          </div>
        );
      })}

      {/* Footer: +N more + View full */}
      <div className="flex items-center justify-between pt-1 border-t border-[var(--color-border-light)]">
        <span className="text-[0.65rem] text-[var(--color-text-muted)]">
          {hiddenCount > 0 && `+${hiddenCount} node${hiddenCount !== 1 ? 's' : ''}`}
        </span>
        {onViewFull && (
          <button
            type="button"
            onClick={onViewFull}
            className="inline-flex items-center gap-0.5 text-[0.65rem] text-[var(--status-info)] hover:text-[var(--status-info)] transition-colors"
          >
            View full
            <ChevronRight size={10} />
          </button>
        )}
      </div>
    </div>
  );
}
