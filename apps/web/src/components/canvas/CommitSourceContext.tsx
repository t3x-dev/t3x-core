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
  GitFork,
  Leaf as LeafIcon,
  Loader2,
  MessageSquare,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  SentenceWithHighlight,
  TurnWithHighlights,
} from '@/components/shared/SourceConversationPanel';
import { SourceConversationPanel } from '@/components/shared/SourceConversationPanel';
import { SourceSentenceList } from '@/components/shared/SourceSentenceList';
import type { Leaf } from '@/lib/api';
import * as api from '@/lib/api';
import { checkContentIntegrity } from '@/lib/truncationUtils';
import type { ContentIntegrityStatus, SentenceWithSource } from '@/types/sourceContext';

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
  /** Commit-level source refs (V4) for identifying leaf sources */
  sourceRefs?: Array<{ type: 'conversation' | 'leaf'; id: string; title?: string }>;
}

/**
 * Sentence grouped under a leaf source
 */
interface LeafSentence {
  sentence: CommitSentence;
  leafId: string;
}

/**
 * Group sentences by source type: turn, leaf, or legacy (no source).
 */
function groupSentencesBySource(sentences: CommitSentence[]): {
  byTurn: Map<string, SentenceWithHighlight[]>;
  byLeaf: Map<string, LeafSentence[]>;
  withoutSource: CommitSentence[];
} {
  const byTurn = new Map<string, SentenceWithHighlight[]>();
  const byLeaf = new Map<string, LeafSentence[]>();
  const withoutSource: CommitSentence[] = [];

  for (const sentence of sentences) {
    // Group by turn if turn_hash exists
    if (sentence.source?.turn_hash) {
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
      continue;
    }

    // Group by leaf if leaf_id exists
    if (sentence.source?.leaf_id) {
      const leafId = sentence.source.leaf_id;
      const group = byLeaf.get(leafId) || [];
      group.push({ sentence, leafId });
      byLeaf.set(leafId, group);
      continue;
    }

    // Legacy data without source
    withoutSource.push(sentence);
  }

  return { byTurn, byLeaf, withoutSource };
}

// ═══════════════════════════════════════════════════════════════════════════
// Leaf Cache
// ═══════════════════════════════════════════════════════════════════════════

const leafCache = new Map<string, { data: Leaf; fetchedAt: number }>();
const LEAF_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchLeafCached(leafId: string): Promise<Leaf | null> {
  const cached = leafCache.get(leafId);
  if (cached && Date.now() - cached.fetchedAt < LEAF_CACHE_TTL) {
    return cached.data;
  }
  try {
    const leaf = await api.getLeaf(leafId);
    leafCache.set(leafId, { data: leaf, fetchedAt: Date.now() });
    return leaf;
  } catch {
    return null;
  }
}

/**
 * Leaf data with fetched content and sentences
 */
interface LeafWithSentences {
  leafId: string;
  leaf: Leaf | null;
  sentences: LeafSentence[];
  loading: boolean;
  error: string | null;
}

/**
 * Renders leaf output text with committed sentences highlighted in green.
 * Finds sentence text within the output and highlights matching regions.
 */
function LeafOutputWithHighlights({
  output,
  sentences,
}: {
  output: string;
  sentences: LeafSentence[];
}) {
  // Find highlight ranges by locating sentence text within the output.
  // Sorts by first occurrence position in the output for correct progressive matching,
  // then merges overlapping ranges to prevent segment builder corruption.
  const highlights = useMemo(() => {
    // First pass: find each sentence's position in the output for ordering
    const positioned = sentences
      .map((sg) => ({ sg, pos: output.indexOf(sg.sentence.text) }))
      .filter((p) => p.pos !== -1)
      .sort((a, b) => a.pos - b.pos);

    // Second pass: progressive search using the sorted order
    const ranges: Array<{ start: number; end: number }> = [];
    let searchFrom = 0;
    for (const { sg } of positioned) {
      const idx = output.indexOf(sg.sentence.text, searchFrom);
      if (idx !== -1) {
        ranges.push({ start: idx, end: idx + sg.sentence.text.length });
        searchFrom = idx + sg.sentence.text.length;
      }
    }
    // Merge overlapping ranges
    const merged: Array<{ start: number; end: number }> = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r.start <= last.end) {
        last.end = Math.max(last.end, r.end);
      } else {
        merged.push({ ...r });
      }
    }
    return merged;
  }, [output, sentences]);

  if (highlights.length === 0) {
    // No matches found — show output as plain text + sentence list
    return (
      <div className="space-y-3">
        <div className="text-[0.875rem] leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-wrap break-words">
          {output}
        </div>
        <div className="border-t border-[var(--color-border-light)] pt-2">
          <p className="text-xs text-[var(--color-text-muted)] mb-1">Committed sentences:</p>
          <ul className="space-y-1">
            {sentences.map((sg) => (
              <li
                key={sg.sentence.id}
                className="flex items-start gap-2 p-1.5 bg-[var(--status-success-muted)] rounded border border-[var(--status-success)]/20"
              >
                <span className="text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-subtle)] px-1 py-0.5 rounded shrink-0">
                  {sg.sentence.id}
                </span>
                <span className="text-xs text-[var(--color-text-secondary)] break-words">
                  {sg.sentence.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // Build segments: interleave plain text and highlighted portions
  const segments: Array<{ text: string; highlighted: boolean; offset: number }> = [];
  let cursor = 0;
  for (const h of highlights) {
    if (h.start > cursor) {
      segments.push({ text: output.slice(cursor, h.start), highlighted: false, offset: cursor });
    }
    segments.push({ text: output.slice(h.start, h.end), highlighted: true, offset: h.start });
    cursor = h.end;
  }
  if (cursor < output.length) {
    segments.push({ text: output.slice(cursor), highlighted: false, offset: cursor });
  }

  return (
    <div className="text-[0.875rem] leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-wrap break-words">
      {segments.map((seg) =>
        seg.highlighted ? (
          <mark
            key={`h-${seg.offset}`}
            className="bg-[var(--status-success-muted)] text-[var(--color-text)] rounded-sm px-0.5"
          >
            {seg.text}
          </mark>
        ) : (
          <span key={`t-${seg.offset}`}>{seg.text}</span>
        )
      )}
    </div>
  );
}

export function CommitSourceContext({
  sentences,
  compact = false,
  defaultExpanded = true,
  sourceRefs,
}: CommitSourceContextProps) {
  const [turnData, setTurnData] = useState<Map<string, TurnWithHighlights>>(new Map());
  const [leafData, setLeafData] = useState<Map<string, LeafWithSentences>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [expandedTurns, setExpandedTurns] = useState<Set<string>>(new Set());

  // Track if user has interacted with expand/collapse to prevent auto-reset
  const hasUserInteracted = useRef(false);

  // Group sentences by source type
  const { byTurn, byLeaf, withoutSource } = useMemo(
    () => groupSentencesBySource(sentences),
    [sentences]
  );

  // Group sentences by inheritance status
  const { inheritedSentences, inheritedByCommit } = useMemo(() => {
    const inherited: CommitSentence[] = [];
    const byCommit = new Map<string, CommitSentence[]>();

    for (const sentence of sentences) {
      if (sentence.inherited_from != null && sentence.inherited_from !== '') {
        inherited.push(sentence);
        const group = byCommit.get(sentence.inherited_from) || [];
        group.push(sentence);
        byCommit.set(sentence.inherited_from, group);
      }
    }

    return { inheritedSentences: inherited, inheritedByCommit: byCommit };
  }, [sentences]);

  const hasInheritedSentences = inheritedSentences.length > 0;

  // Sentences are only truly legacy if they have no source, aren't attributable to leaf sources,
  // and aren't inherited from parent commits.
  const hasLeafSourceRefs = (sourceRefs ?? []).some((r) => r.type === 'leaf');
  const allLegacy =
    withoutSource.length === sentences.length && !hasLeafSourceRefs && !hasInheritedSentences;

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

  // Get ordered list of unique leaf IDs (from sentences or sourceRefs)
  const leafIds = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    // From sentence-level leaf_id
    for (const sentence of sentences) {
      if (!sentence.source?.leaf_id) continue;
      const id = sentence.source.leaf_id;
      if (!seen.has(id)) {
        seen.add(id);
        ordered.push(id);
      }
    }
    // Also include leaf refs from commit-level sourceRefs not already found
    if (sourceRefs) {
      for (const ref of sourceRefs) {
        if (ref.type === 'leaf' && !seen.has(ref.id)) {
          seen.add(ref.id);
          ordered.push(ref.id);
        }
      }
    }
    return ordered;
  }, [sentences, sourceRefs]);

  // All section keys (inherited + turns + leaves) for expand/collapse
  const allSectionKeys = useMemo(() => {
    const keys: string[] = [];
    if (hasInheritedSentences) {
      keys.push('inherited');
    }
    keys.push(...turnHashes);
    keys.push(...leafIds.map((id) => `leaf:${id}`));
    return keys;
  }, [hasInheritedSentences, turnHashes, leafIds]);

  // Initialize expanded state only on first mount (don't reset on data changes)
  useEffect(() => {
    if (!hasUserInteracted.current && defaultExpanded && allSectionKeys.length > 0) {
      setExpandedTurns(new Set([allSectionKeys[0]]));
    }
  }, [allSectionKeys, defaultExpanded]);

  // Toggle section expansion (works for both turns and leaves)
  const toggleSection = useCallback((key: string) => {
    hasUserInteracted.current = true;
    setExpandedTurns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Expand all sections
  const expandAll = useCallback(() => {
    hasUserInteracted.current = true;
    setExpandedTurns(new Set(allSectionKeys));
  }, [allSectionKeys]);

  // Collapse all sections
  const collapseAll = useCallback(() => {
    hasUserInteracted.current = true;
    setExpandedTurns(new Set());
  }, []);

  // Fetch context for each unique turn and leaf
  useEffect(() => {
    if (turnHashes.length === 0 && leafIds.length === 0) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchAll = async () => {
      setIsLoading(true);

      // --- Fetch turns ---
      const newTurnData = new Map<string, TurnWithHighlights>();
      const hashesToFetch = compact ? turnHashes.slice(0, 2) : turnHashes;

      const turnPromises = hashesToFetch.map(async (turnHash) => {
        const sentenceGroup = byTurn.get(turnHash) || [];
        const highlights = sentenceGroup.map((s) => s.highlight);

        try {
          const context = await api.fetchTurnContextCached(turnHash, {
            before: 0,
            after: 0,
          });

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
            newTurnData.set(turnHash, {
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
            newTurnData.set(turnHash, {
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
      });

      // --- Fetch leaves ---
      const newLeafData = new Map<string, LeafWithSentences>();

      const leafPromises = leafIds.map(async (leafId) => {
        const sentenceGroup = byLeaf.get(leafId) || [];

        try {
          const leaf = await fetchLeafCached(leafId);
          if (!cancelled) {
            newLeafData.set(leafId, {
              leafId,
              leaf,
              sentences: sentenceGroup,
              loading: false,
              error: leaf ? null : 'Leaf not found',
            });
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to load leaf';
          if (!cancelled) {
            newLeafData.set(leafId, {
              leafId,
              leaf: null,
              sentences: sentenceGroup,
              loading: false,
              error: errorMsg,
            });
          }
        }
      });

      await Promise.all([...turnPromises, ...leafPromises]);

      if (!cancelled) {
        setTurnData(newTurnData);
        setLeafData(newLeafData);
        setIsLoading(false);
      }
    };

    fetchAll();

    return () => {
      cancelled = true;
    };
  }, [turnHashes, leafIds, byTurn, byLeaf, compact]);

  // Post-fetch resolution: match sentences to leaves by text matching.
  // This handles multi-leaf commits where sentence-level leaf_id isn't available.
  // Phase 1: Match unattributed sentences (exclusive claim, no duplicates).
  // Phase 2: Match turn-attributed sentences whose text also appears in a leaf output
  //          (dual attribution — sentence stays in turn section AND appears in leaf section).
  const resolvedByLeaf = useMemo(() => {
    if (leafData.size === 0) {
      return new Map<string, LeafSentence[]>();
    }
    const resolved = new Map<string, LeafSentence[]>();
    const claimedIds = new Set<string>();

    // Phase 1: unattributed sentences — exclusive claim (first leaf wins)
    for (const [leafId, data] of leafData) {
      if (!data.leaf?.output) continue;
      const output = data.leaf.output;
      for (const sentence of withoutSource) {
        if (claimedIds.has(sentence.id)) continue;
        if (output.includes(sentence.text)) {
          const group = resolved.get(leafId) || [];
          group.push({ sentence, leafId });
          resolved.set(leafId, group);
          claimedIds.add(sentence.id);
        }
      }
    }

    // Phase 2: turn-attributed sentences — dual attribution (appear in both turn & leaf)
    const allTurnSentences = Array.from(byTurn.values()).flat();
    for (const [leafId, data] of leafData) {
      if (!data.leaf?.output) continue;
      const output = data.leaf.output;
      for (const sg of allTurnSentences) {
        if (output.includes(sg.sentence.text)) {
          const group = resolved.get(leafId) || [];
          // Avoid adding the same sentence twice to this leaf
          if (!group.some((g) => g.sentence.id === sg.sentence.id)) {
            group.push({ sentence: sg.sentence, leafId });
            resolved.set(leafId, group);
          }
        }
      }
    }

    return resolved;
  }, [withoutSource, byTurn, leafData]);

  // Sentences truly without any source (not matched to any leaf)
  const unresolvedSentences = useMemo(() => {
    if (resolvedByLeaf.size === 0) return withoutSource;
    const resolvedIds = new Set<string>();
    for (const group of resolvedByLeaf.values()) {
      for (const sg of group) {
        resolvedIds.add(sg.sentence.id);
      }
    }
    return withoutSource.filter((s) => !resolvedIds.has(s.id));
  }, [withoutSource, resolvedByLeaf]);

  // Handle empty sentences
  if (sentences.length === 0) {
    return (
      <div className="p-[var(--space-group)] bg-[var(--color-bg-subtle)] rounded-lg border border-[var(--color-border)]">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare size={14} className="text-[var(--color-text-muted)]" />
          <h3 className="font-semibold text-sm text-[var(--color-text-secondary)]">
            Source Context
          </h3>
        </div>
        <p className="text-center py-4 text-[var(--color-text-muted)] text-sm">No sentences</p>
      </div>
    );
  }

  // All legacy data - show simple sentence list
  if (allLegacy) {
    return (
      <div className="p-[var(--space-group)] bg-[var(--color-bg-subtle)] rounded-lg border border-[var(--color-border)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MessageSquare size={14} className="text-[var(--color-text-muted)]" />
            <h3 className="font-semibold text-sm text-[var(--color-text-secondary)]">Sentences</h3>
          </div>
          <span className="px-2 py-0.5 bg-[var(--hover-bg)] text-[var(--color-text-secondary)] text-xs rounded">
            Legacy format
          </span>
        </div>
        <SourceSentenceList sentences={sentences} />
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="p-[var(--space-group)] bg-[var(--color-bg-subtle)] rounded-lg border border-[var(--color-border)]">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare size={14} className="text-[var(--color-text-muted)]" />
          <h3 className="font-semibold text-sm text-[var(--color-text-secondary)]">
            Source Context
          </h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading source context...</span>
        </div>
      </div>
    );
  }

  // Check if any context was loaded successfully (turns or leaves)
  const hasAnyTurnContext = Array.from(turnData.values()).some((data) => data.context !== null);
  const hasAnyLeafContext = Array.from(leafData.values()).some((data) => data.leaf !== null);
  const hasAnyContext = hasAnyTurnContext || hasAnyLeafContext;

  // Check if any content has integrity issues
  const hasIntegrityIssues = Array.from(turnData.values()).some((data) =>
    Array.from(data.integrityStatus.values()).includes('mismatch')
  );

  // Fallback to sentence list if no context could be loaded
  if (!hasAnyContext) {
    return (
      <div className="p-[var(--space-group)] bg-[var(--color-bg-subtle)] rounded-lg border border-[var(--color-border)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <XCircle size={14} className="text-[var(--color-text-muted)]" />
            <h3 className="font-semibold text-sm text-[var(--color-text-secondary)]">Sentences</h3>
          </div>
          <span className="px-2 py-0.5 bg-[var(--hover-bg)] text-[var(--color-text-secondary)] text-xs rounded">
            Source unavailable
          </span>
        </div>
        <SourceSentenceList sentences={sentences} />
      </div>
    );
  }

  // Render turns and leaves with context (limit in compact mode)
  const hashesToRender = compact ? turnHashes.slice(0, 2) : turnHashes;
  const compactLeafLimit = Math.max(0, 2 - hashesToRender.length);
  const leafIdsToRender = compact ? leafIds.slice(0, compactLeafLimit) : leafIds;
  const totalSections = turnHashes.length + leafIds.length;
  const showCollapseControls = !compact && totalSections > 1;

  // Build summary text: "N sentences (X inherited) from M turns, K leaves"
  const summaryParts: string[] = [];
  if (turnHashes.length > 0) {
    summaryParts.push(`${turnHashes.length} turn${turnHashes.length !== 1 ? 's' : ''}`);
  }
  if (leafIds.length > 0) {
    summaryParts.push(`${leafIds.length} ${leafIds.length !== 1 ? 'leaves' : 'leaf'}`);
  }
  const inheritedNote =
    inheritedSentences.length > 0 ? ` (${inheritedSentences.length} inherited)` : '';
  const summaryText =
    summaryParts.length > 0
      ? `${sentences.length} sentence${sentences.length !== 1 ? 's' : ''}${inheritedNote} from ${summaryParts.join(', ')}`
      : `${sentences.length} sentence${sentences.length !== 1 ? 's' : ''}${inheritedNote}`;

  return (
    <div className="p-[var(--space-group)] bg-[var(--color-bg-subtle)] rounded-lg border border-[var(--color-border)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MessageSquare size={14} className="text-[var(--status-success)]" />
          <h3 className="font-semibold text-sm text-[var(--color-text-secondary)]">
            Source Context
          </h3>
          {hasIntegrityIssues && (
            <span
              className="px-1.5 py-0.5 bg-[var(--status-warning-muted)] text-[var(--status-warning)] text-[0.65rem] rounded flex items-center gap-1"
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
                className="text-[var(--status-info)] hover:text-[var(--status-info)] hover:underline"
              >
                Expand all
              </button>
              <span className="text-[var(--color-border)]">|</span>
              <button
                type="button"
                onClick={collapseAll}
                className="text-[var(--status-info)] hover:text-[var(--status-info)] hover:underline"
              >
                Collapse
              </button>
            </div>
          )}
          <span className="text-xs text-[var(--color-text-muted)]">{summaryText}</span>
        </div>
      </div>

      {/* Sections list */}
      <div className="space-y-[var(--space-item)]">
        {/* Inherited sentences section */}
        {hasInheritedSentences && (
          <div className="rounded-lg border border-[var(--status-info)]/20 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('inherited')}
              className="w-full flex items-center gap-2 p-2 bg-[var(--status-info-muted)] hover:bg-[var(--status-info-muted)] transition-colors text-left"
            >
              {expandedTurns.has('inherited') || compact ? (
                <ChevronDown size={14} className="text-[var(--status-info)] shrink-0" />
              ) : (
                <ChevronRight size={14} className="text-[var(--status-info)] shrink-0" />
              )}
              <GitFork size={14} className="text-[var(--status-info)] shrink-0" />
              <span className="flex-1 text-sm font-medium text-[var(--status-info)]">
                Inherited from Parent
              </span>
              <span className="px-1.5 py-0.5 bg-[var(--status-info-muted)] text-[var(--status-info)] text-[0.65rem] rounded">
                {inheritedSentences.length} sentence{inheritedSentences.length !== 1 ? 's' : ''}
              </span>
            </button>

            {(expandedTurns.has('inherited') || compact) && (
              <div className="p-3 bg-[var(--status-info-muted)]">
                {/* Group by source commit */}
                {Array.from(inheritedByCommit.entries()).map(([commitHash, groupSentences]) => (
                  <div key={commitHash} className="mb-3 last:mb-0">
                    <div className="flex items-center gap-2 mb-[var(--space-item)]">
                      <span className="text-[0.65rem] font-mono text-[var(--status-info)] bg-[var(--status-info-muted)] px-1.5 py-0.5 rounded">
                        {commitHash.slice(0, 16)}...
                      </span>
                      <span className="text-xs text-[var(--status-info)]">
                        {groupSentences.length} sentence{groupSentences.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <ul className="space-y-1.5">
                      {groupSentences.map((sentence) => (
                        <li
                          key={sentence.id}
                          className="flex items-start gap-2 p-2 bg-[var(--color-bg-white)] rounded border border-[var(--status-info)]/20"
                        >
                          <span className="text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-subtle)] px-1.5 py-0.5 rounded shrink-0">
                            {sentence.id}
                          </span>
                          <span className="text-[0.875rem] leading-relaxed text-[var(--color-text-secondary)] break-words">
                            {sentence.text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Direct sentences - Turns list */}
        <SourceConversationPanel
          turnHashes={turnHashes}
          turnData={turnData}
          byTurn={byTurn}
          expandedTurns={expandedTurns}
          toggleSection={toggleSection}
          compact={compact}
        />

        {/* Leaf sections */}
        {leafIdsToRender.map((leafId) => {
          const sectionKey = `leaf:${leafId}`;
          const data = leafData.get(leafId);
          const isExpanded = expandedTurns.has(sectionKey) || compact;
          // Combine direct leaf sentences + post-fetch resolved sentences
          const directSentences = byLeaf.get(leafId) || [];
          const resolvedSentences = resolvedByLeaf.get(leafId) || [];
          const sentencesForLeaf = directSentences.length > 0 ? directSentences : resolvedSentences;
          const leafRef = sourceRefs?.find((r) => r.type === 'leaf' && r.id === leafId);
          const leafTitle = data?.leaf?.title || leafRef?.title || leafId;
          const leafType = data?.leaf?.type;

          // Error / unavailable state
          if (!data || data.error || !data.leaf) {
            return (
              <div
                key={sectionKey}
                className="rounded-lg border border-[var(--color-border)] overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleSection(sectionKey)}
                  className="w-full flex items-center gap-2 p-2 bg-[var(--color-bg-subtle)] hover:bg-[var(--hover-bg)] transition-colors text-left"
                >
                  {isExpanded ? (
                    <ChevronDown size={14} className="text-[var(--color-text-muted)] shrink-0" />
                  ) : (
                    <ChevronRight size={14} className="text-[var(--color-text-muted)] shrink-0" />
                  )}
                  <LeafIcon size={14} className="text-[var(--color-text-muted)] shrink-0" />
                  <span className="flex-1 text-sm text-[var(--color-text-secondary)] truncate">
                    {leafTitle}
                  </span>
                  <span className="px-1.5 py-0.5 bg-[var(--color-border)] text-[var(--color-text-secondary)] text-[0.65rem] rounded">
                    Source unavailable
                  </span>
                </button>
                {isExpanded && sentencesForLeaf.length > 0 && (
                  <div className="p-3 bg-[var(--color-bg-white)]">
                    <SourceSentenceList
                      sentences={sentencesForLeaf.map((sg) => sg.sentence)}
                      variant="highlighted"
                    />
                  </div>
                )}
              </div>
            );
          }

          // Leaf with output — highlight committed sentences
          const leafOutput = data.leaf.output;

          return (
            <div
              key={sectionKey}
              className="rounded-lg border border-[var(--color-border)] overflow-hidden"
            >
              {!compact && (
                <button
                  type="button"
                  onClick={() => toggleSection(sectionKey)}
                  className="w-full flex items-center gap-2 p-2 bg-[var(--color-bg-subtle)] hover:bg-[var(--hover-bg)] transition-colors text-left"
                >
                  {isExpanded ? (
                    <ChevronDown size={14} className="text-[var(--color-text-muted)] shrink-0" />
                  ) : (
                    <ChevronRight size={14} className="text-[var(--color-text-muted)] shrink-0" />
                  )}
                  <LeafIcon size={14} className="text-[var(--status-success)] shrink-0" />
                  <span className="flex-1 text-sm text-[var(--color-text-secondary)] truncate">
                    {leafTitle}
                  </span>
                  {leafType && (
                    <span className="px-1.5 py-0.5 bg-[var(--accent-conversation)]/10 text-[var(--accent-conversation)] text-[0.65rem] rounded">
                      {leafType}
                    </span>
                  )}
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {sentencesForLeaf.length} sentence{sentencesForLeaf.length !== 1 ? 's' : ''}
                  </span>
                </button>
              )}

              {isExpanded && (
                <div className="p-3 bg-[var(--color-bg-white)]">
                  {leafOutput ? (
                    <LeafOutputWithHighlights output={leafOutput} sentences={sentencesForLeaf} />
                  ) : (
                    <SourceSentenceList
                      sentences={sentencesForLeaf.map((sg) => sg.sentence)}
                      variant="highlighted"
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Show indicator if there are more sections in compact mode */}
        {compact && totalSections > 2 && (
          <div className="text-center py-2 text-xs text-[var(--color-text-muted)]">
            +{totalSections - 2} more source{totalSections - 2 !== 1 ? 's' : ''}
          </div>
        )}

        {/* Legacy sentences without source info (only truly unresolved ones) */}
        {unresolvedSentences.length > 0 && !allLegacy && (
          <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
            <div className="flex items-center gap-2 mb-[var(--space-item)]">
              <span className="text-xs text-[var(--color-text-muted)]">
                {unresolvedSentences.length} sentence
                {unresolvedSentences.length !== 1 ? 's' : ''} without source info
              </span>
              <span className="px-1.5 py-0.5 bg-[var(--hover-bg)] text-[var(--color-text-secondary)] text-[0.65rem] rounded">
                Legacy
              </span>
            </div>
            <SourceSentenceList sentences={unresolvedSentences} />
          </div>
        )}
      </div>
    </div>
  );
}
