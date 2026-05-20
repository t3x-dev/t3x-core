'use client';

/**
 * YAMLTreePanel — Renders commit trees as a structured YAML tree.
 *
 * Used in Leaf detail page left panel. Serves both Generate and Display modes:
 * - Generate: each tree shows Require/Exclude buttons for constraint creation
 * - Display: each tree shows assertion pass/fail badges, highlighted on hover
 */

import type { SemanticContent, SlotValue } from '@t3x-dev/core';
import { Check, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
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

function formatSlotValue(value: SlotValue): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((item) => formatSlotValue(item)).join(', ');
  if (typeof value === 'object' && value !== null && 'ref' in value) {
    return `*${(value as { ref: string }).ref}`;
  }
  return JSON.stringify(value);
}

function getNodeValue(slots: Record<string, SlotValue>): string {
  return Object.entries(slots)
    .map(([key, value]) => `${key}: ${formatSlotValue(value)}`)
    .join('; ');
}

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
    if (nested.some((node) => node.id === highlightedConstraintId)) return highlightedConstraintId;
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
  }, [highlightedConstraintId, constraints, content.trees, nested]);

  return (
    <aside
      className={cn(
        'hidden w-[300px] min-w-[300px] shrink-0 flex-col overflow-y-auto border-r md:flex',
        'bg-[color-mix(in_srgb,var(--surface-panel)_88%,transparent)]',
        'backdrop-blur-[var(--fx-blur-panel)]'
      )}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--stroke-divider)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
            Source Frames
          </span>
        </div>
        <span className="text-[11px] text-[var(--text-tertiary)]">{nested.length} frames</span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {nested.map((node, index) => {
          const semanticSummary = semanticPointSummaryByNode?.get(node.id);
          const slotEntries = Object.entries(node.slots).slice(0, 4);
          const isHighlighted = highlightedNodeId === node.id;
          const isEmphasized = isHighlighted || index === 0;
          const nodeValue = getNodeValue(node.slots);
          const frameAssertions =
            assertions?.filter((assertion) => {
              const constraint = constraints.find((c) => c.id === assertion.constraint_id);
              return (
                constraint &&
                'source_node' in constraint &&
                (constraint as { source_node?: { frame_type?: string } }).source_node
                  ?.frame_type === node.type
              );
            }) ?? [];
          const failedCount = frameAssertions.filter((assertion) => !assertion.passed).length;

          return (
            <article
              key={node.id}
              data-node-id={node.id}
              className={cn(
                'group transition-all',
                isEmphasized
                  ? 'border-[var(--source)] bg-[var(--source-dim)]'
                  : 'border-[var(--stroke-divider)] hover:bg-[var(--surface-hover)]',
                isEmphasized
                  ? 'rounded-xl border px-3 py-3 shadow-[var(--fx-shadow-sm)]'
                  : 'border-b px-3 py-2.5'
              )}
              onMouseEnter={() => onHoverNode?.(node.id)}
              onMouseLeave={() => onHoverNode?.(null)}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="truncate font-mono text-[12px] font-bold text-[var(--text-primary)]">
                  {node.type}
                </h2>
                {semanticSummary ? (
                  <span className="shrink-0 font-mono text-[11px] font-semibold text-[var(--accent-leaf)]">
                    {semanticSummary.included}/{semanticSummary.total}
                  </span>
                ) : frameAssertions.length > 0 ? (
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                      failedCount === 0
                        ? 'bg-[var(--status-success-muted)] text-[var(--status-success)]'
                        : 'bg-[var(--status-error-muted)] text-[var(--status-error)]'
                    )}
                  >
                    {failedCount === 0 ? `${frameAssertions.length} pass` : `${failedCount} fail`}
                  </span>
                ) : null}
              </div>

              <dl className="space-y-1.5">
                {slotEntries.map(([key, value]) => (
                  <div key={key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                    <dt className="truncate text-[11px] text-[var(--text-secondary)]">{key}</dt>
                    <dd className="max-w-[130px] truncate text-right font-mono text-[11px] text-[var(--source)]">
                      {formatSlotValue(value)}
                    </dd>
                  </div>
                ))}
              </dl>

              {mode === 'generate' && (
                <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--accent-leaf)]/30 bg-[var(--accent-leaf-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--accent-leaf)]"
                    onClick={(event) => {
                      event.stopPropagation();
                      onAddConstraintFromSource('require', nodeValue, node.id);
                    }}
                    disabled={saving}
                  >
                    <Plus className="h-3 w-3" />
                    Require
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--status-error)]/30 bg-[var(--status-error-muted)] px-2 py-1 text-[10px] font-semibold text-[var(--status-error)]"
                    onClick={(event) => {
                      event.stopPropagation();
                      onAddConstraintFromSource('exclude', nodeValue, node.id);
                    }}
                    disabled={saving}
                  >
                    <X className="h-3 w-3" />
                    Exclude
                  </button>
                </div>
              )}

              {mode === 'display' && frameAssertions.length > 0 && (
                <div className="mt-2 flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
                  {failedCount === 0 ? (
                    <Check className="h-3 w-3 text-[var(--status-success)]" />
                  ) : (
                    <X className="h-3 w-3 text-[var(--status-error)]" />
                  )}
                  {failedCount === 0
                    ? 'All attached assertions passed'
                    : `${failedCount} attached assertions failed`}
                </div>
              )}
            </article>
          );
        })}

        {nested.length === 0 && (
          <p className="py-8 text-center text-xs text-[var(--text-tertiary)]">
            No content in this commit.
          </p>
        )}

        {commitHash && projectId && (
          <Link
            href={`/project/${projectId}/commit/${encodeURIComponent(commitHash)}`}
            className="flex h-9 items-center justify-center gap-1 rounded-lg border border-[var(--source)]/30 bg-[var(--source-dim)] text-[12px] font-semibold text-[var(--source)] transition-colors hover:border-[var(--source)]"
          >
            Open full source YAML
          </Link>
        )}
      </div>
    </aside>
  );
}
