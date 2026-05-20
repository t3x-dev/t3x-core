'use client';

/**
 * QualityPanel — Right panel for Leaf Display mode.
 *
 * Shows assertion results, generation metadata, and deploy/share actions.
 * Hover over an assertion → emits highlightedConstraintId to highlight
 * the corresponding YAML tree in YAMLTreePanel.
 */

import { Check, CheckCircle, Clipboard, FileDown, Share2, XCircle } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import type { LeafSemanticPointItem } from '@/domain/leaf/semanticPoints';
import type { Assertion, Constraint } from '@/types/api';
import { cn } from '@/utils/cn';

// ============================================================================
// Types
// ============================================================================

interface QualityPanelProps {
  assertions: Assertion[];
  constraints: Constraint[];
  generatedAt?: string;
  semanticPoints?: LeafSemanticPointItem[];
  coverageIncluded?: number;
  coverageTotal?: number;
  /** Callback to highlight a YAML tree when hovering an assertion */
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

  const sourceLabel =
    constraint && 'source_node' in constraint && constraint.source_node
      ? `${constraint.source_node.frame_type}${constraint.source_node.slot_key ? `.${constraint.source_node.slot_key}` : ''}`
      : undefined;

  return (
    <div
      className={cn(
        'rounded-lg border px-2.5 py-2 text-xs transition-all cursor-pointer',
        assertion.passed
          ? 'border-[var(--status-success)]/20 bg-[var(--surface-card)] hover:bg-[var(--status-success-muted)]'
          : 'border-[var(--status-error)]/20 bg-[var(--surface-card)] hover:bg-[var(--status-error-muted)]'
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
  semanticPoints = [],
  coverageIncluded,
  coverageTotal,
  onHighlightConstraint,
  onExport,
}: QualityPanelProps) {
  const passedCount = assertions.filter((a) => a.passed).length;
  const totalCount = assertions.length;
  const scorePercent = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;
  const includedCoverage =
    coverageIncluded ?? semanticPoints.filter((point) => point.included).length;
  const totalCoverage = coverageTotal ?? semanticPoints.length;
  const coveragePercent =
    totalCoverage > 0 ? Math.round((includedCoverage / totalCoverage) * 100) : 0;
  const coverageComplete = totalCoverage > 0 && includedCoverage === totalCoverage;
  const generatedLabel = generatedAt ? formatDisplayDateTime(generatedAt) : null;

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
        'hidden w-[304px] min-w-[304px] shrink-0 flex-col overflow-y-auto border-l md:flex',
        'bg-[color-mix(in_srgb,var(--surface-panel)_88%,transparent)]',
        'backdrop-blur-[var(--fx-blur-panel)]'
      )}
    >
      <div className="flex items-center justify-between border-b border-[var(--stroke-divider)] px-4 py-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
          Review Stack
        </span>
        <span className="text-[11px] text-[var(--text-tertiary)]">j / k navigate</span>
      </div>

      <div className="space-y-3 p-4">
        <section className="rounded-xl border border-[var(--accent-leaf)]/25 bg-[var(--accent-leaf-soft)] p-3">
          <div className="flex items-center gap-3">
            <div
              className="grid h-14 w-14 shrink-0 place-items-center rounded-full"
              style={{
                background: `conic-gradient(var(--accent-leaf) ${coveragePercent}%, var(--surface-elevated) 0)`,
              }}
            >
              <div className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-card)] text-[12px] font-bold text-[var(--accent-leaf)]">
                {coveragePercent}%
              </div>
            </div>
            <div className="min-w-0">
              <h2 className="text-[13px] font-bold text-[var(--text-primary)]">
                {coverageComplete ? 'Coverage complete' : 'Coverage in review'}
              </h2>
              <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
                {coverageComplete
                  ? constraints.length === 0
                    ? 'Every semantic point is represented. No constraint has been added yet.'
                    : 'Every semantic point is represented in the output.'
                  : `${includedCoverage} of ${totalCoverage} semantic points are included in this leaf.`}
              </p>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-[var(--stroke-default)] bg-[var(--surface-card)]">
          <div className="flex items-center justify-between border-b border-[var(--stroke-divider)] px-3 py-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
              Semantic Coverage
            </span>
            <span className="font-mono text-[11px] font-semibold text-[var(--text-tertiary)]">
              {includedCoverage} included
            </span>
          </div>
          <div className="space-y-2 px-3 py-3">
            {semanticPoints.length > 0 ? (
              semanticPoints
                .filter((point) => point.included)
                .slice(0, 5)
                .map((point) => (
                  <div key={point.id} className="flex items-start gap-2 text-[12px]">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-sm bg-[var(--accent-leaf)] p-0.5 text-[var(--on-accent)]" />
                    <span className="min-w-0 flex-1 truncate font-mono text-[var(--text-secondary)]">
                      {point.label}
                    </span>
                  </div>
                ))
            ) : (
              <p className="text-[12px] leading-5 text-[var(--text-tertiary)]">
                Semantic points are loading from the commit source.
              </p>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-[var(--stroke-default)] bg-[var(--surface-card)]">
          <div className="flex items-center justify-between border-b border-[var(--stroke-divider)] px-3 py-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
              Constraints
            </span>
            <span className="font-mono text-[11px] font-semibold text-[var(--text-tertiary)]">
              {constraints.length} rules
            </span>
          </div>
          <div className="space-y-2 px-3 py-3">
            {constraints.length > 0 ? (
              constraints.slice(0, 5).map((constraint) => (
                <button
                  key={constraint.id}
                  type="button"
                  className="flex w-full items-start gap-2 rounded-lg px-1 py-1 text-left transition-colors hover:bg-[var(--surface-hover)]"
                  onMouseEnter={() => handleHover(constraint.id)}
                  onMouseLeave={() => handleHover(null)}
                >
                  {constraint.type === 'require' ? (
                    <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent-leaf)]" />
                  ) : (
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--status-error)]" />
                  )}
                  <span className="min-w-0 flex-1 text-[12px] leading-5 text-[var(--text-secondary)]">
                    {constraint.value}
                  </span>
                </button>
              ))
            ) : (
              <p className="text-[12px] leading-5 text-[var(--text-tertiary)]">
                No output rules yet. Add requirements before generation when tone, length, or
                forbidden claims matter.
              </p>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-[var(--stroke-default)] bg-[var(--surface-card)]">
          <div className="flex items-center justify-between border-b border-[var(--stroke-divider)] px-3 py-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
              Assertions
            </span>
            <span className="font-mono text-[11px] font-semibold text-[var(--text-tertiary)]">
              {totalCount > 0 ? `${passedCount}/${totalCount}` : 'not run'}
            </span>
          </div>
          <div className="space-y-2 px-3 py-3">
            {totalCount > 0 ? (
              <>
                <div
                  className={cn(
                    'rounded-lg px-2.5 py-2 text-[12px] font-semibold',
                    scorePercent === 100
                      ? 'bg-[var(--status-success-muted)] text-[var(--status-success)]'
                      : 'bg-[var(--status-warning-muted)] text-[var(--status-warning)]'
                  )}
                >
                  {scorePercent}% validation score
                </div>
                {assertions.map((a) => (
                  <AssertionCard
                    key={a.id}
                    assertion={a}
                    constraint={constraintMap.get(a.constraint_id)}
                    onHover={handleHover}
                  />
                ))}
              </>
            ) : (
              <p className="text-[12px] leading-5 text-[var(--text-tertiary)]">
                Validation has not been run for this leaf. Keep this neutral, not success green.
              </p>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-[var(--stroke-default)] bg-[var(--surface-card)]">
          <div className="flex items-center justify-between border-b border-[var(--stroke-divider)] px-3 py-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
              Publish
            </span>
            {generatedLabel && (
              <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
                {generatedLabel}
              </span>
            )}
          </div>
          <div className="space-y-1 px-2 py-2">
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
        </section>
      </div>
    </aside>
  );
}

function formatDisplayDateTime(value: string): string {
  const date = new Date(value);
  const chinaTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const year = chinaTime.getUTCFullYear();
  const month = String(chinaTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(chinaTime.getUTCDate()).padStart(2, '0');
  const hours = String(chinaTime.getUTCHours()).padStart(2, '0');
  const minutes = String(chinaTime.getUTCMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}
