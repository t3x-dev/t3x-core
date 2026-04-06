'use client';

/**
 * SourceNodeList - Renders a list of nodes with optional source info badges.
 *
 * Extracted from CommitSourceContext to provide a reusable node list display
 * used in legacy fallback, no-context fallback, error states, and unresolved nodes.
 */

import type { NodeWithSource } from '@/types/sourceContext';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface SourceNodeListProps {
  /** ContentNodes to display */
  nodes: NodeWithSource[];
  /** Visual variant controlling background/border colors */
  variant?: 'default' | 'highlighted';
}

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Renders a vertical list of nodes, each showing its ID badge and text.
 *
 * - `default` variant: neutral bg/border (used for legacy, fallback, unresolved nodes)
 * - `highlighted` variant: green-tinted bg/border (used for error-state turn/leaf nodes)
 */
export function SourceNodeList({ nodes, variant = 'default' }: SourceNodeListProps) {
  if (nodes.length === 0) return null;

  const itemClassName =
    variant === 'highlighted'
      ? 'flex items-start gap-2 p-2 bg-[var(--status-success-muted)] rounded border border-[var(--status-success)]/20'
      : 'flex items-start gap-2 p-2 bg-[var(--color-bg-white)] rounded border border-[var(--color-border-light)]';

  return (
    <ul className="space-y-[var(--space-item)]">
      {nodes.map((s) => (
        <li key={s.id} className={itemClassName}>
          <span className="text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-subtle)] px-1.5 py-0.5 rounded shrink-0">
            {s.id}
          </span>
          <span className="text-[0.875rem] leading-relaxed text-[var(--color-text-secondary)] break-words">
            {s.text}
          </span>
        </li>
      ))}
    </ul>
  );
}
