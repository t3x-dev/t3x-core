'use client';

/**
 * YAMLTreePanel — Renders commit trees as a structured YAML tree.
 *
 * Used in Leaf detail page left panel. Serves both Generate and Display modes:
 * - Generate: each tree shows Require/Exclude buttons for constraint creation
 * - Display: each tree shows assertion pass/fail badges, highlighted on hover
 */

import type { SemanticContent } from '@t3x-dev/core';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useCallback, useMemo } from 'react';
import { YAMLRenderer } from '@/components/shared/YAMLRenderer';
import type { LeafSemanticPointSummary } from '@/domain/leaf/semanticPoints';
import { contentToNodes } from '@/domain/tree/treeCompat';
import type { WorkspaceMode } from '@/hooks/leaves/useLeafPageData';
import type { Assertion, Constraint } from '@/types/api';
import { cn } from '@/utils/cn';

// ============================================================================
// Types
// ============================================================================

interface YAMLTreePanelProps {
  content: SemanticContent;
  mode: WorkspaceMode;
  constraints: Constraint[];
  assertions?: Assertion[];
  saving: boolean;
  commitHash?: string;
  projectId?: string;
  onAddConstraintFromSource: (
    type: 'require' | 'exclude',
    value: string,
    sourceNodeId: string
  ) => void;
  semanticPointSummaryByNode?: Map<string, LeafSemanticPointSummary>;
  /** ID of constraint/tree being hovered in QualityPanel */
  highlightedConstraintId?: string | null;
  onHoverNode?: (treeId: string | null) => void;
}

// ============================================================================
// YAMLTreePanel
// ============================================================================

export function YAMLTreePanel({
  content,
  mode,
  constraints,
  assertions,
  saving,
  commitHash,
  projectId,
  onAddConstraintFromSource,
  semanticPointSummaryByNode,
  highlightedConstraintId,
  onHoverNode,
}: YAMLTreePanelProps) {
  const nested = useMemo(() => {
    return contentToNodes(content);
  }, [content]);

  // Determine which  node is highlighted based on hovered constraint
  const highlightedNodeId = useMemo(() => {
    if (!highlightedConstraintId || !constraints) return null;
    const constraint = constraints.find((c) => c.id === highlightedConstraintId);
    if (!constraint) return null;
    if ('source_node' in constraint && constraint.source_node) {
      // Find  node by key match
      const node = content.trees.find(
        (f) =>
          f.key ===
          (constraint as { source_node?: { frame_type?: string } }).source_node?.frame_type
      );
      return node?.key ?? null;
    }
    return null;
  }, [highlightedConstraintId, constraints, content.trees]);

  const renderNodeActions = useCallback(
    (treeId: string, treeType: string): ReactNode => {
      if (mode === 'generate') {
        const node = nested.find((entry) => entry.id === treeId);
        const nodeValue = node
          ? Object.entries(node.slots)
              .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
              .join('; ')
          : '';
        const semanticSummary = semanticPointSummaryByNode?.get(treeId);
        return (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {semanticSummary && (
              <span className="rounded-full bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-tertiary)]">
                {semanticSummary.included}/{semanticSummary.total} included
              </span>
            )}
            <button
              type="button"
              className="px-1.5 py-0.5 text-[10px] font-medium rounded border border-transparent hover:border-[var(--status-success)]/30 hover:bg-[var(--status-success-muted)] text-[var(--status-success)] transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onAddConstraintFromSource('require', nodeValue, treeId);
              }}
              disabled={saving}
            >
              Require
            </button>
            <button
              type="button"
              className="px-1.5 py-0.5 text-[10px] font-medium rounded border border-transparent hover:border-[var(--status-error)]/30 hover:bg-[var(--status-error-muted)] text-[var(--status-error)] transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onAddConstraintFromSource('exclude', nodeValue, treeId);
              }}
              disabled={saving}
            >
              Exclude
            </button>
          </div>
        );
      }

      if (mode === 'display') {
        const frameAssertions =
          assertions?.filter((a) => {
            const c = constraints.find((c) => c.id === a.constraint_id);
            return (
              c &&
              'source_node' in c &&
              (c as { source_node?: { frame_type?: string } }).source_node?.frame_type === treeType
            );
          }) ?? [];
        if (frameAssertions.length > 0) {
          const allPassed = frameAssertions.every((a) => a.passed);
          return allPassed ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--status-success-muted)] text-[var(--status-success)]">
              &#10003; {frameAssertions.length} passed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--status-error)]/10 text-[var(--status-error)]">
              &#10007; {frameAssertions.filter((a) => !a.passed).length} failed
            </span>
          );
        }
      }

      return null;
    },
    [
      mode,
      nested,
      semanticPointSummaryByNode,
      constraints,
      assertions,
      saving,
      onAddConstraintFromSource,
    ]
  );

  const getTreeMeta = useCallback((_treeId: string) => {
    return undefined;
  }, []);

  return (
    <aside
      className={cn(
        'hidden md:flex w-[320px] min-w-[320px] shrink-0 flex-col overflow-y-auto border-r',
        'bg-[color-mix(in_srgb,var(--surface-panel)_88%,transparent)]',
        'backdrop-blur-[var(--fx-blur-panel)]'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--stroke-divider)] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
            Source YAML
          </span>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--surface-elevated)] text-[var(--text-tertiary)]">
            {nested.length}
          </span>
        </div>
        {commitHash && projectId && (
          <Link
            href={`/project/${projectId}/commit/${encodeURIComponent(commitHash)}`}
            className="text-xs text-[var(--accent-leaf)] hover:underline flex items-center gap-1"
          >
            <ExternalLink className="h-3 w-3" />
            View Commit
          </Link>
        )}
      </div>

      {/* Tree YAML tree */}
      <div className="flex-1 overflow-y-auto p-3">
        <YAMLRenderer
          nodes={nested}
          renderNodeActions={renderNodeActions}
          highlightNodeId={highlightedNodeId}
          getTreeMeta={getTreeMeta}
          onHoverNode={onHoverNode}
        />
        {nested.length === 0 && (
          <p className="py-8 text-center text-xs text-[var(--text-tertiary)]">
            No content in this commit.
          </p>
        )}
      </div>
    </aside>
  );
}
