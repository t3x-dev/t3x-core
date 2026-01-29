'use client';

/**
 * CommitSourceContext - Displays commit sentences with source context
 *
 * Instead of showing isolated sentences, this component displays the original
 * conversation turns with the committed sentences highlighted in green.
 *
 * Features:
 * - Groups sentences by turn_hash
 * - Fetches turn context from API
 * - Merges overlapping/adjacent highlights
 * - Shows turn separators between different turns
 * - Graceful fallback to sentence list on error
 *
 * Edge Case Handling (Issue #222):
 * - Source deleted: Shows gray "Source unavailable" badge with sentence text
 * - Very long turns (>2000 chars): Smart truncation with highlight visibility
 * - Multiple turns: Collapsible sections with expand/collapse
 * - Legacy data (no source): Falls back to sentence list view
 * - Content changed: Shows warning if source content doesn't match
 */

import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
  MessageSquare,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { TurnBubble } from '@/components/shared/TurnBubble';
import type { TurnContextData } from '@/lib/api';
import * as api from '@/lib/api';
import {
  adjustHighlightsForTruncation,
  checkContentIntegrity,
  DEFAULT_CONTEXT_CHARS,
  DEFAULT_MAX_LENGTH,
  truncateLongContent,
} from '@/lib/truncationUtils';
import type {
  ContentIntegrityStatus,
  HighlightRange,
  SentenceWithSource,
  TurnBubbleData,
} from '@/types/sourceContext';

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

/** Maximum turn content length before truncation */
const MAX_TURN_LENGTH = DEFAULT_MAX_LENGTH;
/** Context chars to show around highlights in long turns */
const TRUNCATION_CONTEXT = DEFAULT_CONTEXT_CHARS;

// ═══════════════════════════════════════════════════════════════════════════
// Types (using shared types, keep local aliases for backward compatibility)
// ═══════════════════════════════════════════════════════════════════════════

/** Sentence from commit content - alias for SentenceWithSource */
type CommitSentence = SentenceWithSource;

interface CommitSourceContextProps {
  /** Sentences from commit content */
  sentences: CommitSentence[];
  /** Compact mode for canvas preview (show first 2 turns only) */
  compact?: boolean;
  /** Default expanded state for turns (default: first turn expanded) */
  defaultExpanded?: boolean;
}

/**
 * Sentence with source info and the expected text at that position
 */
interface SentenceWithHighlight {
  sentence: CommitSentence;
  turnHash: string;
  highlight: HighlightRange;
}

/**
 * Group sentences by turn_hash, tracking which sentences have valid source info
 */
function groupSentencesByTurn(sentences: CommitSentence[]): {
  byTurn: Map<string, SentenceWithHighlight[]>;
  withoutSource: CommitSentence[];
} {
  const byTurn = new Map<string, SentenceWithHighlight[]>();
  const withoutSource: CommitSentence[] = [];

  for (const sentence of sentences) {
    // Handle legacy data without source field
    if (!sentence.source || !sentence.source.turn_hash) {
      withoutSource.push(sentence);
      continue;
    }

    const turnHash = sentence.source.turn_hash;
    const group = byTurn.get(turnHash) || [];
    group.push({
      sentence,
      turnHash,
      highlight: {
        start: sentence.source.start_char,
        end: sentence.source.end_char,
      },
    });
    byTurn.set(turnHash, group);
  }

  return { byTurn, withoutSource };
}

/**
 * Turn data with fetched context and highlights
 */
interface TurnWithHighlights {
  turnHash: string;
  context: TurnContextData | null;
  highlights: HighlightRange[];
  sentences: SentenceWithHighlight[];
  loading: boolean;
  error: string | null;
  /** Content integrity check results per sentence */
  integrityStatus: Map<string, ContentIntegrityStatus>;
}

export function CommitSourceContext({
  sentences,
  compact = false,
  defaultExpanded = true,
}: CommitSourceContextProps) {
  const [turnData, setTurnData] = useState<Map<string, TurnWithHighlights>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [expandedTurns, setExpandedTurns] = useState<Set<string>>(new Set());

  // Track if user has interacted with expand/collapse to prevent auto-reset
  const hasUserInteracted = useRef(false);

  // Group sentences by turn, separating legacy data
  const { byTurn, withoutSource } = useMemo(() => groupSentencesByTurn(sentences), [sentences]);

  // Check if we have legacy data (sentences without source info)
  const hasLegacyData = withoutSource.length > 0;
  const allLegacy = withoutSource.length === sentences.length;

  // Get ordered list of unique turn hashes
  const turnHashes = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const sentence of sentences) {
      if (!sentence.source?.turn_hash) continue;
      const hash = sentence.source.turn_hash;
      if (!seen.has(hash)) {
        seen.add(hash);
        ordered.push(hash);
      }
    }
    return ordered;
  }, [sentences]);

  // Initialize expanded state only on first mount (don't reset on data changes)
  useEffect(() => {
    if (!hasUserInteracted.current && defaultExpanded && turnHashes.length > 0) {
      setExpandedTurns(new Set([turnHashes[0]]));
    }
  }, [turnHashes, defaultExpanded]);

  // Toggle turn expansion
  const toggleTurn = useCallback((turnHash: string) => {
    hasUserInteracted.current = true;
    setExpandedTurns((prev) => {
      const next = new Set(prev);
      if (next.has(turnHash)) {
        next.delete(turnHash);
      } else {
        next.add(turnHash);
      }
      return next;
    });
  }, []);

  // Expand all turns
  const expandAll = useCallback(() => {
    hasUserInteracted.current = true;
    setExpandedTurns(new Set(turnHashes));
  }, [turnHashes]);

  // Collapse all turns
  const collapseAll = useCallback(() => {
    hasUserInteracted.current = true;
    setExpandedTurns(new Set());
  }, []);

  // Fetch context for each unique turn
  useEffect(() => {
    if (turnHashes.length === 0) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchAllContexts = async () => {
      setIsLoading(true);

      const newData = new Map<string, TurnWithHighlights>();

      // Limit turns in compact mode
      const hashesToFetch = compact ? turnHashes.slice(0, 2) : turnHashes;

      await Promise.all(
        hashesToFetch.map(async (turnHash) => {
          const sentenceGroup = byTurn.get(turnHash) || [];
          const highlights = sentenceGroup.map((s) => s.highlight);

          try {
            // Fetch with minimal context window (just the target turn)
            const context = await api.fetchTurnContextCached(turnHash, {
              before: 0,
              after: 0,
            });

            // Check content integrity for each sentence
            const integrityStatus = new Map<string, ContentIntegrityStatus>();
            if (context?.target_turn?.content) {
              for (const sg of sentenceGroup) {
                const status = checkContentIntegrity(
                  sg.sentence.text,
                  context.target_turn.content,
                  sg.highlight.start,
                  sg.highlight.end
                );
                integrityStatus.set(sg.sentence.id, status);
              }
            }

            if (!cancelled) {
              newData.set(turnHash, {
                turnHash,
                context,
                highlights,
                sentences: sentenceGroup,
                loading: false,
                error: null,
                integrityStatus,
              });
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Failed to load context';
            if (!cancelled) {
              newData.set(turnHash, {
                turnHash,
                context: null,
                highlights,
                sentences: sentenceGroup,
                loading: false,
                error: errorMsg,
                integrityStatus: new Map(),
              });
            }
          }
        })
      );

      if (!cancelled) {
        setTurnData(newData);
        setIsLoading(false);
      }
    };

    fetchAllContexts();

    return () => {
      cancelled = true;
    };
  }, [turnHashes, byTurn, compact]);

  // Handle empty sentences
  if (sentences.length === 0) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare size={14} className="text-gray-400" />
          <h3 className="font-semibold text-sm text-gray-700">Source Context</h3>
        </div>
        <p className="text-center py-4 text-gray-400 text-sm">No sentences</p>
      </div>
    );
  }

  // All legacy data - show simple sentence list
  if (allLegacy) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MessageSquare size={14} className="text-gray-400" />
            <h3 className="font-semibold text-sm text-gray-700">Sentences</h3>
          </div>
          <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded">
            Legacy format
          </span>
        </div>
        <ul className="space-y-2">
          {sentences.map((s) => (
            <li
              key={s.id}
              className="flex items-start gap-2 p-2 bg-white rounded border border-gray-100"
            >
              <span className="text-xs font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                {s.id}
              </span>
              <span className="text-[0.875rem] leading-relaxed text-gray-700 break-words">
                {s.text}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare size={14} className="text-gray-400" />
          <h3 className="font-semibold text-sm text-gray-700">Source Context</h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading source context...</span>
        </div>
      </div>
    );
  }

  // Check if any context was loaded successfully
  const hasAnyContext = Array.from(turnData.values()).some((data) => data.context !== null);

  // Check if any content has integrity issues
  const hasIntegrityIssues = Array.from(turnData.values()).some((data) =>
    Array.from(data.integrityStatus.values()).includes('mismatch')
  );

  // Fallback to sentence list if no context could be loaded
  if (!hasAnyContext) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <XCircle size={14} className="text-gray-400" />
            <h3 className="font-semibold text-sm text-gray-700">Sentences</h3>
          </div>
          <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded">
            Source unavailable
          </span>
        </div>
        <ul className="space-y-2">
          {sentences.map((s) => (
            <li
              key={s.id}
              className="flex items-start gap-2 p-2 bg-white rounded border border-gray-100"
            >
              <span className="text-xs font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                {s.id}
              </span>
              <span className="text-[0.875rem] leading-relaxed text-gray-700 break-words">
                {s.text}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Render turns with context
  const hashesToRender = compact ? turnHashes.slice(0, 2) : turnHashes;
  const showCollapseControls = !compact && turnHashes.length > 1;

  return (
    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MessageSquare size={14} className="text-green-600" />
          <h3 className="font-semibold text-sm text-gray-700">Source Context</h3>
          {hasIntegrityIssues && (
            <span
              className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[0.65rem] rounded flex items-center gap-1"
              title="Some source content may have changed since this commit"
            >
              <AlertTriangle size={10} />
              Modified
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showCollapseControls && (
            <div className="flex items-center gap-1 text-[0.65rem]">
              <button
                type="button"
                onClick={expandAll}
                className="text-blue-600 hover:text-blue-700 hover:underline"
              >
                Expand all
              </button>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                onClick={collapseAll}
                className="text-blue-600 hover:text-blue-700 hover:underline"
              >
                Collapse
              </button>
            </div>
          )}
          <span className="text-xs text-gray-400">
            {sentences.length} sentence{sentences.length !== 1 ? 's' : ''} from {turnHashes.length}{' '}
            turn{turnHashes.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Turns list */}
      <div className="space-y-2">
        {hashesToRender.map((turnHash, idx) => {
          const data = turnData.get(turnHash);
          const isExpanded = expandedTurns.has(turnHash) || compact;

          // Show error state with sentence fallback for this turn
          if (!data || data.error) {
            const sentencesForTurn = byTurn.get(turnHash) || [];
            return (
              <div key={turnHash} className="rounded-lg border border-gray-200 overflow-hidden">
                {/* Collapsible header */}
                <button
                  type="button"
                  onClick={() => toggleTurn(turnHash)}
                  className="w-full flex items-center gap-2 p-2 bg-gray-100 hover:bg-gray-150 transition-colors text-left"
                >
                  {isExpanded ? (
                    <ChevronDown size={14} className="text-gray-400 shrink-0" />
                  ) : (
                    <ChevronRight size={14} className="text-gray-400 shrink-0" />
                  )}
                  <span className="flex-1 text-sm text-gray-600">Turn {idx + 1}</span>
                  <span className="px-1.5 py-0.5 bg-gray-300 text-gray-600 text-[0.65rem] rounded">
                    Source unavailable
                  </span>
                </button>

                {/* Expanded content - show sentences */}
                {isExpanded && (
                  <div className="p-3 bg-white">
                    <ul className="space-y-2">
                      {sentencesForTurn.map((sg) => (
                        <li
                          key={sg.sentence.id}
                          className="flex items-start gap-2 p-2 bg-green-50 rounded border border-green-100"
                        >
                          <span className="text-xs font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                            {sg.sentence.id}
                          </span>
                          <span className="text-[0.875rem] leading-relaxed text-gray-700 break-words">
                            {sg.sentence.text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          }

          const targetTurn = data.context?.target_turn;
          if (!targetTurn) return null;

          // Check for content integrity issues in this turn
          const turnHasIntegrityIssues = Array.from(data.integrityStatus.values()).includes(
            'mismatch'
          );

          // Check if turn content is very long and needs truncation
          const isLongTurn = targetTurn.content.length > MAX_TURN_LENGTH;

          // In compact mode, always truncate long turns; otherwise only truncate when collapsed
          const shouldTruncate = isLongTurn && (compact || !expandedTurns.has(turnHash));

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
              ? adjustHighlightsForTruncation(
                  data.highlights,
                  targetTurn.content,
                  truncationOptions
                )
              : data.highlights,
          };

          return (
            <div key={turnHash} className="rounded-lg border border-gray-200 overflow-hidden">
              {/* Collapsible header (not shown in compact mode for single turn) */}
              {!compact && (
                <button
                  type="button"
                  onClick={() => toggleTurn(turnHash)}
                  className="w-full flex items-center gap-2 p-2 bg-gray-100 hover:bg-gray-150 transition-colors text-left"
                >
                  {isExpanded ? (
                    <ChevronDown size={14} className="text-gray-400 shrink-0" />
                  ) : (
                    <ChevronRight size={14} className="text-gray-400 shrink-0" />
                  )}
                  <span className="flex-1 text-sm text-gray-600">
                    {data.context?.conversation_title || `Turn ${idx + 1}`}
                    <span className="ml-2 text-xs text-gray-400">({targetTurn.role})</span>
                  </span>
                  {turnHasIntegrityIssues && (
                    <span
                      className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[0.65rem] rounded flex items-center gap-1"
                      title="Source content may have changed"
                    >
                      <AlertTriangle size={10} />
                      Changed
                    </span>
                  )}
                  {isLongTurn && (
                    <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[0.65rem] rounded">
                      Long turn
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    {data.sentences.length} sentence{data.sentences.length !== 1 ? 's' : ''}
                  </span>
                </button>
              )}

              {/* Expanded content */}
              {isExpanded && (
                <div className="p-2 bg-white">
                  <TurnBubble turn={turnBubbleData} highlightColor="green" showTargetRing={false} />

                  {/* Content integrity warning */}
                  {turnHasIntegrityIssues && (
                    <div className="mt-2 p-2 bg-amber-50 rounded border border-amber-200">
                      <div className="flex items-start gap-2 text-amber-700 text-xs">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium">Source may have changed</p>
                          <p className="text-amber-600 mt-0.5">
                            The highlighted text positions may not match the original content.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Long turn indicator - shown when truncated in compact mode */}
                  {shouldTruncate && (
                    <div className="mt-2 text-center text-xs text-gray-500">
                      Showing truncated content ({targetTurn.content.length.toLocaleString()} chars
                      total)
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Show indicator if there are more turns in compact mode */}
        {compact && turnHashes.length > 2 && (
          <div className="text-center py-2 text-xs text-gray-400">
            +{turnHashes.length - 2} more turn{turnHashes.length - 2 !== 1 ? 's' : ''}
          </div>
        )}

        {/* Legacy sentences without source info */}
        {hasLegacyData && !allLegacy && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-gray-500">
                {withoutSource.length} sentence{withoutSource.length !== 1 ? 's' : ''} without
                source info
              </span>
              <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 text-[0.65rem] rounded">
                Legacy
              </span>
            </div>
            <ul className="space-y-1">
              {withoutSource.map((s) => (
                <li
                  key={s.id}
                  className="flex items-start gap-2 p-2 bg-white rounded border border-gray-100"
                >
                  <span className="text-xs font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                    {s.id}
                  </span>
                  <span className="text-[0.875rem] leading-relaxed text-gray-700 break-words">
                    {s.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
