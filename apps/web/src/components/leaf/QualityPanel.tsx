'use client';

/**
 * QualityPanel — Right panel for Leaf Display mode.
 *
 * Shows assertion results, generation metadata, and deploy/share actions.
 * Hover over an assertion → emits highlightedConstraintId to highlight
 * the corresponding YAML frame in YAMLTreePanel.
 */

import { CheckCircle, Clipboard, FileDown, Share2, XCircle } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import type { Assertion, Constraint } from '@/lib/api/leaves';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface QualityPanelProps {
  assertions: Assertion[];
  constraints: Constraint[];
  generatedAt?: string;
  /** Callback to highlight a YAML frame when hovering an assertion */
  onHighlightConstraint?: (constraintId: string | null) => void;
  /** Export actions */
  onExport: (format: 'clipboard' | 'markdown' | 'json' | 'prompt') => Promise<void>;
}

// ============================================================================
// AssertionCard
// ============================================================================

function AssertionCard({
  assertion,
  constraint,
  onHover,
}: {
  assertion: Assertion;
  constraint?: Constraint;
  onHover: (id: string | null) => void;
}) {
  const constraintLabel = constraint
    ? `${constraint.type}: ${constraint.match_mode === 'exact' ? `"${constraint.value}"` : constraint.value}`
    : assertion.details;

  const sourceLabel = constraint
    ? 'source_frame' in constraint && constraint.source_frame
      ? `${constraint.source_frame.frame_type}${constraint.source_frame.slot_key ? `.${constraint.source_frame.slot_key}` : ''}`
      : 'source_sentence_id' in constraint && constraint.source_sentence_id
        ? constraint.source_sentence_id
        : undefined
    : undefined;

  return (
    <div
      className={cn(
        'rounded-lg p-2.5 text-xs transition-all cursor-pointer',
        'border-l-2',
        assertion.passed
          ? 'border-l-[var(--status-success)] bg-[var(--surface-card)] hover:bg-[var(--status-success-muted)]'
          : 'border-l-[var(--status-error)] bg-[var(--surface-card)] hover:bg-[var(--status-error)]/5'
      )}
      onMouseEnter={() => onHover(assertion.constraint_id)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="flex items-center gap-2">
        {assertion.passed ? (
          <CheckCircle className="h-3.5 w-3.5 text-[var(--status-success)] shrink-0" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-[var(--status-error)] shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[var(--text-secondary)] truncate">{constraintLabel}</div>
          {sourceLabel && (
            <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{sourceLabel}</div>
          )}
        </div>
        <span
          className={cn(
            'text-[10px] font-semibold shrink-0',
            assertion.passed ? 'text-[var(--status-success)]' : 'text-[var(--status-error)]'
          )}
        >
          {assertion.passed ? 'pass' : 'fail'}
        </span>
      </div>
      {/* Failure detail */}
      {!assertion.passed && assertion.details && (
        <div className="mt-1.5 pt-1.5 border-t border-[var(--stroke-divider)] text-[10px] text-[var(--status-error)]">
          {assertion.details}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// QualityPanel
// ============================================================================

export function QualityPanel({
  assertions,
  constraints,
  generatedAt,
  onHighlightConstraint,
  onExport,
}: QualityPanelProps) {
  const passedCount = assertions.filter((a) => a.passed).length;
  const totalCount = assertions.length;
  const scorePercent = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;

  // Map constraint_id to constraint for display
  const constraintMap = useMemo(() => {
    const map = new Map<string, Constraint>();
    for (const c of constraints) {
      map.set(c.id, c);
    }
    return map;
  }, [constraints]);

  const handleHover = (constraintId: string | null) => {
    onHighlightConstraint?.(constraintId);
  };

  return (
    <aside
      className={cn(
        'hidden md:flex w-[260px] min-w-[260px] shrink-0 flex-col overflow-y-auto border-l',
        'bg-[color-mix(in_srgb,var(--surface-panel)_88%,transparent)]',
        'backdrop-blur-[var(--fx-blur-panel)]'
      )}
    >
      <div className="p-3 space-y-4">
        {/* Score */}
        {totalCount > 0 && (
          <div className="rounded-lg border border-[var(--stroke-default)] bg-[var(--surface-card)] p-4 text-center">
            <div
              className={cn(
                'text-3xl font-bold',
                scorePercent === 100
                  ? 'text-[var(--status-success)]'
                  : scorePercent >= 50
                    ? 'text-[var(--status-warning)]'
                    : 'text-[var(--status-error)]'
              )}
            >
              {scorePercent}%
            </div>
            <div className="text-xs text-[var(--text-tertiary)] mt-1">
              {passedCount} of {totalCount} constraints passed
            </div>
          </div>
        )}

        {/* Assertions */}
        <div>
          <div className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
            Assertions
          </div>
          {totalCount > 0 ? (
            <div className="space-y-1.5">
              {assertions.map((a) => (
                <AssertionCard
                  key={a.id}
                  assertion={a}
                  constraint={constraintMap.get(a.constraint_id)}
                  onHover={handleHover}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--text-tertiary)] text-center py-4">
              No assertions yet. Generate output first.
            </p>
          )}
        </div>

        {/* Generation Info */}
        {generatedAt && (
          <div>
            <div className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
              Generation
            </div>
            <div className="text-xs text-[var(--text-secondary)]">
              {new Date(generatedAt).toLocaleString()}
            </div>
          </div>
        )}

        {/* Deploy & Share */}
        <div>
          <div className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
            Deploy & Share
          </div>
          <div className="space-y-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 h-8 text-xs"
              onClick={() => onExport('clipboard')}
            >
              <Clipboard className="h-3.5 w-3.5" />
              Copy to clipboard
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 h-8 text-xs"
              onClick={() => onExport('markdown')}
            >
              <FileDown className="h-3.5 w-3.5" />
              Export Markdown
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 h-8 text-xs"
              onClick={() => onExport('json')}
            >
              <Share2 className="h-3.5 w-3.5" />
              Share via API
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
