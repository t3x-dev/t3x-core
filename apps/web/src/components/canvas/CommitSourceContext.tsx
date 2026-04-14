'use client';

/**
 * CommitSourceContext - Displays commit nodes with source context
 *
 * Instead of showing isolated nodes, this component displays the original
 * conversation turns with the committed nodes highlighted in green.
 *
 * Features:
 * - Groups nodes by turn_hash
 * - Fetches turn context from API
 * - Merges overlapping/adjacent highlights
 * - Shows turn separators between different turns
 * - Graceful fallback to node list on error
 *
 * Edge Case Handling (Issue #222):
 * - Source deleted: Shows gray "Source unavailable" badge with node text
 * - Very long turns (>2000 chars): Smart truncation with highlight visibility
 * - Multiple turns: Collapsible sections with expand/collapse
 * - Legacy data (no source): Falls back to node list view
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
import type { NodeWithHighlight } from '@/components/source-context/SourceConversationPanel';
import { SourceConversationPanel } from '@/components/source-context/SourceConversationPanel';
import { LeafOutputWithHighlights } from '@/components/source-context/LeafOutputWithHighlights';
import { SourceNodeList } from '@/components/source-context/SourceNodeList';
import { useSourceContextData, type LeafContentNode } from '@/hooks/shared/useSourceContextData';
import type {
  ColoredHighlightRange,
  HighlightColor,
  NodeWithSource,
} from '@/types/sourceContext';

// ═══════════════════════════════════════════════════════════════════════════
// Types (using shared types, keep local aliases for backward compatibility)
// ═══════════════════════════════════════════════════════════════════════════

/** ContentNode from commit content - alias for NodeWithSource */
type CommitContentNode = NodeWithSource;

interface CommitSourceContextProps {
  /** ContentNodes from commit content */
  nodes: CommitContentNode[];
  /** Compact mode for canvas preview (show first 2 turns only) */
  compact?: boolean;
  /** Default expanded state for turns (default: first turn expanded) */
  defaultExpanded?: boolean;
  /** Commit-level source refs (V4) for identifying leaf sources */
  sourceRefs?: Array<{ type: 'conversation' | 'leaf'; id: string; title?: string }>;
}


/**
 * Map anchor_type to highlight color for visual differentiation.
 * - verbatim (default): green solid highlight
 * - paraphrase: amber dashed border
 * - inference: blue dotted border
 */
function anchorTypeToColor(anchorType?: string): HighlightColor {
  switch (anchorType) {
    case 'paraphrase':
      return 'amber';
    case 'inference':
      return 'blue';
    default:
      return 'green';
  }
}

/**
 * Build colored highlights from nodes with anchor_type info.
 * Returns coloredHighlights when mixed anchor_types exist, undefined otherwise.
 */
function _buildColoredHighlights(
  nodes: NodeWithHighlight[]
): ColoredHighlightRange[] | undefined {
  const hasNonVerbatim = nodes.some(
    (s) => s.node.anchor_type && s.node.anchor_type !== 'verbatim'
  );
  if (!hasNonVerbatim) return undefined;

  return nodes.map((s) => ({
    start: s.highlight.start,
    end: s.highlight.end,
    color: anchorTypeToColor(s.node.anchor_type),
  }));
}

/**
 * Group nodes by source type: turn, leaf, or legacy (no source).
 */
function groupNodesBySource(nodes: CommitContentNode[]): {
  byTurn: Map<string, NodeWithHighlight[]>;
  byLeaf: Map<string, LeafContentNode[]>;
  withoutSource: CommitContentNode[];
} {
  const byTurn = new Map<string, NodeWithHighlight[]>();
  const byLeaf = new Map<string, LeafContentNode[]>();
  const withoutSource: CommitContentNode[] = [];

  for (const node of nodes) {
    // Group by turn if turn_hash exists
    if (node.source?.turn_hash) {
      const turnHash = node.source.turn_hash;
      const group = byTurn.get(turnHash) || [];
      group.push({
        node,
        turnHash,
        highlight: {
          start: node.source.start_char,
          end: node.source.end_char,
        },
      });
      byTurn.set(turnHash, group);
      continue;
    }

    // Group by leaf if leaf_id exists
    if (node.source?.leaf_id) {
      const leafId = node.source.leaf_id;
      const group = byLeaf.get(leafId) || [];
      group.push({ node, leafId });
      byLeaf.set(leafId, group);
      continue;
    }

    // Legacy data without source
    withoutSource.push(node);
  }

  return { byTurn, byLeaf, withoutSource };
}


export function CommitSourceContext({
  nodes,
  compact = false,
  defaultExpanded = true,
  sourceRefs,
}: CommitSourceContextProps) {
  const [expandedTurns, setExpandedTurns] = useState<Set<string>>(new Set());

  // Track if user has interacted with expand/collapse to prevent auto-reset
  const hasUserInteracted = useRef(false);

  // Group nodes by source type
  const { byTurn, byLeaf, withoutSource } = useMemo(
    () => groupNodesBySource(nodes),
    [nodes]
  );

  // Group nodes by inheritance status
  const { inheritedNodes, inheritedByCommit } = useMemo(() => {
    const inherited: CommitContentNode[] = [];
    const byCommit = new Map<string, CommitContentNode[]>();

    for (const node of nodes) {
      if (node.inherited_from != null && node.inherited_from !== '') {
        inherited.push(node);
        const group = byCommit.get(node.inherited_from) || [];
        group.push(node);
        byCommit.set(node.inherited_from, group);
      }
    }

    return { inheritedNodes: inherited, inheritedByCommit: byCommit };
  }, [nodes]);

  const hasInheritedNodes = inheritedNodes.length > 0;

  // ContentNodes are only truly legacy if they have no source, aren't attributable to leaf sources,
  // and aren't inherited from parent commits.
  const hasLeafSourceRefs = (sourceRefs ?? []).some((r) => r.type === 'leaf');
  const allLegacy =
    withoutSource.length === nodes.length && !hasLeafSourceRefs && !hasInheritedNodes;

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

  // Get ordered list of unique leaf IDs (from nodes or sourceRefs)
  const leafIds = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    // From node-level leaf_id
    for (const node of nodes) {
      if (!node.source?.leaf_id) continue;
      const id = node.source.leaf_id;
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
  }, [nodes, sourceRefs]);

  // All section keys (inherited + turns + leaves) for expand/collapse
  const allSectionKeys = useMemo(() => {
    const keys: string[] = [];
    if (hasInheritedNodes) {
      keys.push('inherited');
    }
    keys.push(...turnHashes);
    keys.push(...leafIds.map((id) => `leaf:${id}`));
    return keys;
  }, [hasInheritedNodes, turnHashes, leafIds]);

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

  // Fetch turn/leaf context data
  const { turnData, leafData, isLoading } = useSourceContextData(
    turnHashes, leafIds, byTurn, byLeaf, compact
  );

  // Post-fetch resolution: match nodes to leaves by text matching.
  // This handles multi-leaf commits where node-level leaf_id isn't available.
  // Phase 1: Match unattributed nodes (exclusive claim, no duplicates).
  // Phase 2: Match turn-attributed nodes whose text also appears in a leaf output
  //          (dual attribution — node stays in turn section AND appears in leaf section).
  const resolvedByLeaf = useMemo(() => {
    if (leafData.size === 0) {
      return new Map<string, LeafContentNode[]>();
    }
    const resolved = new Map<string, LeafContentNode[]>();
    const claimedIds = new Set<string>();

    // Phase 1: unattributed nodes — exclusive claim (first leaf wins)
    for (const [leafId, data] of leafData) {
      if (!data.leaf?.output) continue;
      const output = data.leaf.output;
      for (const node of withoutSource) {
        if (claimedIds.has(node.id)) continue;
        if (output.includes(node.text)) {
          const group = resolved.get(leafId) || [];
          group.push({ node, leafId });
          resolved.set(leafId, group);
          claimedIds.add(node.id);
        }
      }
    }

    // Phase 2: turn-attributed nodes — dual attribution (appear in both turn & leaf)
    const allTurnNodes = Array.from(byTurn.values()).flat();
    for (const [leafId, data] of leafData) {
      if (!data.leaf?.output) continue;
      const output = data.leaf.output;
      for (const sg of allTurnNodes) {
        if (output.includes(sg.node.text)) {
          const group = resolved.get(leafId) || [];
          // Avoid adding the same node twice to this leaf
          if (!group.some((g) => g.node.id === sg.node.id)) {
            group.push({ node: sg.node, leafId });
            resolved.set(leafId, group);
          }
        }
      }
    }

    return resolved;
  }, [withoutSource, byTurn, leafData]);

  // ContentNodes truly without any source (not matched to any leaf)
  const unresolvedNodes = useMemo(() => {
    if (resolvedByLeaf.size === 0) return withoutSource;
    const resolvedIds = new Set<string>();
    for (const group of resolvedByLeaf.values()) {
      for (const sg of group) {
        resolvedIds.add(sg.node.id);
      }
    }
    return withoutSource.filter((s) => !resolvedIds.has(s.id));
  }, [withoutSource, resolvedByLeaf]);

  // Handle empty nodes
  if (nodes.length === 0) {
    return (
      <div className="p-[var(--space-group)] bg-[var(--color-bg-subtle)] rounded-lg border border-[var(--color-border)]">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare size={14} className="text-[var(--color-text-muted)]" />
          <h3 className="font-semibold text-sm text-[var(--color-text-secondary)]">
            Source Context
          </h3>
        </div>
        <p className="text-center py-4 text-[var(--color-text-muted)] text-sm">No nodes</p>
      </div>
    );
  }

  // All legacy data - show simple node list
  if (allLegacy) {
    return (
      <div className="p-[var(--space-group)] bg-[var(--color-bg-subtle)] rounded-lg border border-[var(--color-border)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MessageSquare size={14} className="text-[var(--color-text-muted)]" />
            <h3 className="font-semibold text-sm text-[var(--color-text-secondary)]">Frames</h3>
          </div>
          <span className="px-2 py-0.5 bg-[var(--hover-bg)] text-[var(--color-text-secondary)] text-xs rounded">
            Legacy format
          </span>
        </div>
        <SourceNodeList nodes={nodes} />
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

  // Fallback to node list if no context could be loaded
  if (!hasAnyContext) {
    return (
      <div className="p-[var(--space-group)] bg-[var(--color-bg-subtle)] rounded-lg border border-[var(--color-border)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <XCircle size={14} className="text-[var(--color-text-muted)]" />
            <h3 className="font-semibold text-sm text-[var(--color-text-secondary)]">Frames</h3>
          </div>
          <span className="px-2 py-0.5 bg-[var(--hover-bg)] text-[var(--color-text-secondary)] text-xs rounded">
            Source unavailable
          </span>
        </div>
        <SourceNodeList nodes={nodes} />
      </div>
    );
  }

  // Render turns and leaves with context (limit in compact mode)
  const hashesToRender = compact ? turnHashes.slice(0, 2) : turnHashes;
  const compactLeafLimit = Math.max(0, 2 - hashesToRender.length);
  const leafIdsToRender = compact ? leafIds.slice(0, compactLeafLimit) : leafIds;
  const totalSections = turnHashes.length + leafIds.length;
  const showCollapseControls = !compact && totalSections > 1;

  // Build summary text: "N nodes (X inherited) from M turns, K leaves"
  const summaryParts: string[] = [];
  if (turnHashes.length > 0) {
    summaryParts.push(`${turnHashes.length} turn${turnHashes.length !== 1 ? 's' : ''}`);
  }
  if (leafIds.length > 0) {
    summaryParts.push(`${leafIds.length} ${leafIds.length !== 1 ? 'leaves' : 'leaf'}`);
  }
  const inheritedNote =
    inheritedNodes.length > 0 ? ` (${inheritedNodes.length} inherited)` : '';
  const summaryText =
    summaryParts.length > 0
      ? `${nodes.length} node${nodes.length !== 1 ? 's' : ''}${inheritedNote} from ${summaryParts.join(', ')}`
      : `${nodes.length} node${nodes.length !== 1 ? 's' : ''}${inheritedNote}`;

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
        {/* Inherited nodes section */}
        {hasInheritedNodes && (
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
                {inheritedNodes.length} node{inheritedNodes.length !== 1 ? 's' : ''}
              </span>
            </button>

            {(expandedTurns.has('inherited') || compact) && (
              <div className="p-3 bg-[var(--status-info-muted)]">
                {/* Group by source commit */}
                {Array.from(inheritedByCommit.entries()).map(([commitHash, groupNodes]) => (
                  <div key={commitHash} className="mb-3 last:mb-0">
                    <div className="flex items-center gap-2 mb-[var(--space-item)]">
                      <span className="text-[0.65rem] font-mono text-[var(--status-info)] bg-[var(--status-info-muted)] px-1.5 py-0.5 rounded">
                        {commitHash.slice(0, 16)}...
                      </span>
                      <span className="text-xs text-[var(--status-info)]">
                        {groupNodes.length} node{groupNodes.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <ul className="space-y-1.5">
                      {groupNodes.map((node) => (
                        <li
                          key={node.id}
                          className="flex items-start gap-2 p-2 bg-[var(--color-bg-white)] rounded border border-[var(--status-info)]/20"
                        >
                          <span className="text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-subtle)] px-1.5 py-0.5 rounded shrink-0">
                            {node.id}
                          </span>
                          <span className="text-[0.875rem] leading-relaxed text-[var(--color-text-secondary)] break-words">
                            {node.text}
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

        {/* Direct nodes - Turns list */}
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
          // Combine direct leaf nodes + post-fetch resolved nodes
          const directNodes = byLeaf.get(leafId) || [];
          const resolvedNodes = resolvedByLeaf.get(leafId) || [];
          const nodesForLeaf = directNodes.length > 0 ? directNodes : resolvedNodes;
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
                {isExpanded && nodesForLeaf.length > 0 && (
                  <div className="p-3 bg-[var(--color-bg-white)]">
                    <SourceNodeList
                      nodes={nodesForLeaf.map((sg) => sg.node)}
                      variant="highlighted"
                    />
                  </div>
                )}
              </div>
            );
          }

          // Leaf with output — highlight committed nodes
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
                    {nodesForLeaf.length} node{nodesForLeaf.length !== 1 ? 's' : ''}
                  </span>
                </button>
              )}

              {isExpanded && (
                <div className="p-3 bg-[var(--color-bg-white)]">
                  {leafOutput ? (
                    <LeafOutputWithHighlights output={leafOutput} nodes={nodesForLeaf} />
                  ) : (
                    <SourceNodeList
                      nodes={nodesForLeaf.map((sg) => sg.node)}
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

        {/* Legacy nodes without source info (only truly unresolved ones) */}
        {unresolvedNodes.length > 0 && !allLegacy && (
          <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
            <div className="flex items-center gap-2 mb-[var(--space-item)]">
              <span className="text-xs text-[var(--color-text-muted)]">
                {unresolvedNodes.length} node
                {unresolvedNodes.length !== 1 ? 's' : ''} without source info
              </span>
              <span className="px-1.5 py-0.5 bg-[var(--hover-bg)] text-[var(--color-text-secondary)] text-[0.65rem] rounded">
                Legacy
              </span>
            </div>
            <SourceNodeList nodes={unresolvedNodes} />
          </div>
        )}
      </div>
    </div>
  );
}
