'use client';

/**
 * SourceConversationPanel - Renders conversation turn sections with source context.
 *
 * Extracted from CommitSourceContext. Displays collapsible turn sections
 * with TurnBubble highlighting, content integrity warnings, and truncation
 * for long turns.
 */

import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import {
  adjustHighlightsForTruncation,
  DEFAULT_CONTEXT_CHARS,
  DEFAULT_MAX_LENGTH,
  truncateLongContent,
} from '@/lib/truncationUtils';
import type { TurnContextData } from '@/types/api';
import type { HighlightRange, NodeWithSource, TurnBubbleData } from '@/types/sourceContext';
import { SourceNodeList } from './SourceNodeList';
import { TurnBubble } from './TurnBubble';

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

/** Maximum turn content length before truncation */
const MAX_TURN_LENGTH = DEFAULT_MAX_LENGTH;
/** Context chars to show around highlights in long turns */
const TRUNCATION_CONTEXT = DEFAULT_CONTEXT_CHARS;

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ContentNode with source info and the expected text at that position.
 * Re-exported for consumers that need to build this data.
 */
export interface NodeWithHighlight {
  node: NodeWithSource;
  turnHash: string;
  highlight: HighlightRange;
}

/**
 * Turn data with fetched context and highlights.
 */
export interface TurnWithHighlights {
  turnHash: string;
  context: TurnContextData | null;
  highlights: HighlightRange[];
  nodes: NodeWithHighlight[];
  loading: boolean;
  error: string | null;
  /** Content integrity check results per node */
  integrityStatus: Map<string, 'valid' | 'mismatch' | 'unknown'>;
}

export interface SourceConversationPanelProps {
  /** Ordered list of turn hashes to render */
  turnHashes: string[];
  /** Turn data map (keyed by turn hash) */
  turnData: Map<string, TurnWithHighlights>;
  /** ContentNode groups by turn hash */
  byTurn: Map<string, NodeWithHighlight[]>;
  /** Set of currently expanded section keys */
  expandedTurns: Set<string>;
  /** Callback to toggle a section's expansion */
  toggleSection: (key: string) => void;
  /** Whether to render in compact mode (canvas preview) */
  compact: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Internal: single turn section
// ═══════════════════════════════════════════════════════════════════════════

function TurnSection({
  turnHash,
  idx,
  data,
  nodesForTurn,
  isExpanded,
  compact,
  toggleSection,
}: {
  turnHash: string;
  idx: number;
  data: TurnWithHighlights | undefined;
  nodesForTurn: NodeWithHighlight[];
  isExpanded: boolean;
  compact: boolean;
  toggleSection: (key: string) => void;
}) {
  // Error / unavailable state
  if (!data || data.error) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
        {/* Collapsible header */}
        <button
          type="button"
          onClick={() => toggleSection(turnHash)}
          className="w-full flex items-center gap-2 p-2 bg-[var(--color-bg-subtle)] hover:bg-[var(--hover-bg)] transition-colors text-left"
        >
          {isExpanded ? (
            <ChevronDown size={14} className="text-[var(--color-text-muted)] shrink-0" />
          ) : (
            <ChevronRight size={14} className="text-[var(--color-text-muted)] shrink-0" />
          )}
          <span className="flex-1 text-sm text-[var(--color-text-secondary)]">Turn {idx + 1}</span>
          <span className="px-1.5 py-0.5 bg-[var(--color-border)] text-[var(--color-text-secondary)] text-[0.65rem] rounded">
            Source unavailable
          </span>
        </button>

        {/* Expanded content - show nodes */}
        {isExpanded && (
          <div className="p-3 bg-[var(--color-bg-white)]">
            <SourceNodeList nodes={nodesForTurn.map((sg) => sg.node)} variant="highlighted" />
          </div>
        )}
      </div>
    );
  }

  const targetTurn = data.context?.target_turn;
  if (!targetTurn) return null;

  // Check for content integrity issues in this turn
  const turnHasIntegrityIssues = Array.from(data.integrityStatus.values()).includes('mismatch');

  // Check if turn content is very long and needs truncation
  const isLongTurn = targetTurn.content.length > MAX_TURN_LENGTH;

  // In compact mode, always truncate long turns; otherwise only truncate when collapsed
  const shouldTruncate = isLongTurn && (compact || !isExpanded);

  // Convert to TurnBubbleData with highlights
  const truncationOptions = {
    maxLength: MAX_TURN_LENGTH,
    contextChars: TRUNCATION_CONTEXT,
  };
  const turnBubbleData: TurnBubbleData = {
    turn_hash: targetTurn.turn_hash,
    role: targetTurn.role,
    content: shouldTruncate
      ? truncateLongContent(targetTurn.content, data.highlights, truncationOptions)
      : targetTurn.content,
    created_at: targetTurn.created_at,
    is_target: true,
    highlights: shouldTruncate
      ? adjustHighlightsForTruncation(data.highlights, targetTurn.content, truncationOptions)
      : data.highlights,
  };

  return (
    <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
      {/* Collapsible header (not shown in compact mode for single turn) */}
      {!compact && (
        <button
          type="button"
          onClick={() => toggleSection(turnHash)}
          className="w-full flex items-center gap-2 p-2 bg-[var(--color-bg-subtle)] hover:bg-[var(--hover-bg)] transition-colors text-left"
        >
          {isExpanded ? (
            <ChevronDown size={14} className="text-[var(--color-text-muted)] shrink-0" />
          ) : (
            <ChevronRight size={14} className="text-[var(--color-text-muted)] shrink-0" />
          )}
          <span className="flex-1 text-sm text-[var(--color-text-secondary)]">
            {data.context?.conversation_title || `Turn ${idx + 1}`}
            <span className="ml-2 text-xs text-[var(--color-text-muted)]">({targetTurn.role})</span>
          </span>
          {turnHasIntegrityIssues && (
            <span
              className="px-1.5 py-0.5 bg-[var(--status-warning-muted)] text-[var(--status-warning)] text-[0.65rem] rounded flex items-center gap-1"
              title="Source content may have changed"
            >
              <AlertTriangle size={10} />
              Changed
            </span>
          )}
          {isLongTurn && (
            <span className="px-1.5 py-0.5 bg-[var(--status-info-muted)] text-[var(--status-info)] text-[0.65rem] rounded">
              Long turn
            </span>
          )}
          <span className="text-xs text-[var(--color-text-muted)]">
            {data.nodes.length} node{data.nodes.length !== 1 ? 's' : ''}
          </span>
        </button>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div className="p-2 bg-[var(--color-bg-white)]">
          <TurnBubble turn={turnBubbleData} highlightColor="green" showTargetRing={false} />

          {/* Content integrity warning */}
          {turnHasIntegrityIssues && (
            <div className="mt-2 p-2 bg-[var(--status-warning-muted)] rounded border border-[var(--status-warning)]/25">
              <div className="flex items-start gap-2 text-[var(--status-warning)] text-xs">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Source may have changed</p>
                  <p className="text-[var(--status-warning)] mt-0.5">
                    The highlighted text positions may not match the original content.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Long turn indicator - shown when truncated in compact mode */}
          {shouldTruncate && (
            <div className="mt-2 text-center text-xs text-[var(--color-text-muted)]">
              Showing truncated content ({targetTurn.content.length.toLocaleString()} chars total)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Renders a list of conversation turn sections with collapsible headers,
 * TurnBubble highlighting, integrity warnings, and truncation support.
 */
export function SourceConversationPanel({
  turnHashes,
  turnData,
  byTurn,
  expandedTurns,
  toggleSection,
  compact,
}: SourceConversationPanelProps) {
  const hashesToRender = useMemo(
    () => (compact ? turnHashes.slice(0, 2) : turnHashes),
    [compact, turnHashes]
  );

  return (
    <>
      {hashesToRender.map((turnHash, idx) => {
        const data = turnData.get(turnHash);
        const isExpanded = expandedTurns.has(turnHash) || compact;
        const nodesForTurn = byTurn.get(turnHash) || [];

        return (
          <TurnSection
            key={turnHash}
            turnHash={turnHash}
            idx={idx}
            data={data}
            nodesForTurn={nodesForTurn}
            isExpanded={isExpanded}
            compact={compact}
            toggleSection={toggleSection}
          />
        );
      })}
    </>
  );
}
