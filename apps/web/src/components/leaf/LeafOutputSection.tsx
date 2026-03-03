'use client';

import { Check, CheckCircle, CheckCircle2, Loader2, Play, X } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Assertion, Constraint } from '@/lib/api';
import { cn } from '@/lib/utils';

// ============================================================================
// Output Section (Hero — top of page)
// ============================================================================

export interface LeafOutputSectionProps {
  output: string | null;
  generatedAt: string | null;
  assertions: Assertion[] | null;
  constraints: Constraint[];
  onGenerate: () => void;
  isGenerating: boolean;
  generatePhase: number;
  generateProgressMessages: string[];
  generateSuccessBanner: string | null;
}

/** Build constraint hit markers from assertions + constraints */
function buildConstraintMarkers(
  assertions: Assertion[] | null,
  constraints: Constraint[]
): Array<{ constraint: Constraint; passed: boolean; details: string }> {
  if (!assertions || assertions.length === 0) return [];
  const constraintMap = new Map(constraints.map((c) => [c.id, c]));
  const markers: Array<{ constraint: Constraint; passed: boolean; details: string }> = [];
  for (const a of assertions) {
    const c = constraintMap.get(a.constraint_id);
    if (c) markers.push({ constraint: c, passed: a.passed, details: a.details });
  }
  return markers;
}

export function LeafOutputSection({
  output,
  generatedAt,
  assertions,
  constraints,
  onGenerate,
  isGenerating,
  generatePhase,
  generateProgressMessages,
  generateSuccessBanner,
}: LeafOutputSectionProps) {
  // Inline validation summary
  const passedCount = assertions?.filter((a) => a.passed).length ?? 0;
  const totalCount = assertions?.length ?? 0;
  const allPassed = totalCount > 0 && passedCount === totalCount;

  // Constraint hit markers
  const markers = useMemo(
    () => buildConstraintMarkers(assertions, constraints),
    [assertions, constraints]
  );

  return (
    <section
      className={cn(
        'rounded-lg border bg-card transition-all duration-[var(--duration-emphasis)]',
        allPassed && 'ring-2 ring-[var(--status-success)]/30'
      )}
    >
      <div className="flex items-center justify-between border-b p-[var(--space-group)]">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold">Output</h2>
          {/* Inline validation badge */}
          {totalCount > 0 && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                allPassed
                  ? 'bg-[var(--status-success-muted)] text-[var(--status-success)]'
                  : 'bg-[var(--status-error-muted)] text-[var(--status-error)]'
              )}
            >
              {allPassed ? <CheckCircle className="h-3 w-3" /> : <X className="h-3 w-3" />}
              {passedCount}/{totalCount} passed
            </span>
          )}
        </div>
        {generatedAt && (
          <span className="text-xs text-[var(--text-tertiary)]">
            {new Date(generatedAt).toLocaleString()}
          </span>
        )}
      </div>

      <div className="p-[var(--space-group)]">
        {/* Success banner */}
        {generateSuccessBanner && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--diff-added-border)] bg-[var(--diff-added-bg)] px-4 py-2.5 text-sm font-medium text-[var(--diff-added-text)]">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {generateSuccessBanner}
          </div>
        )}

        {/* Constraint hit markers */}
        {output && markers.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {markers.map(({ constraint, passed, details }) => (
              <Tooltip key={constraint.id}>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium cursor-default border',
                      passed
                        ? 'border-[var(--status-success)]/30 bg-[var(--status-success-muted)] text-[var(--status-success)]'
                        : 'border-[var(--status-error)]/30 bg-[var(--status-error-muted)] text-[var(--status-error)]'
                    )}
                  >
                    {passed ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                    <span className="max-w-[120px] truncate">{constraint.value}</span>
                    <span className="text-[9px] opacity-70 uppercase">
                      {constraint.type === 'require' ? 'req' : 'exc'}
                    </span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  <p className="font-medium">
                    {constraint.type === 'require' ? 'Require' : 'Exclude'}: {constraint.value}
                  </p>
                  <p className="text-muted-foreground mt-0.5">{details}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}

        {output ? (
          <div className="whitespace-pre-wrap rounded-md bg-[var(--glass-bg-reading)] backdrop-blur-[var(--glass-blur-reading)] border border-[var(--stroke-strong)] shadow-[var(--shadow-reading)] p-[var(--space-group)] text-sm text-[var(--text-secondary)] leading-relaxed">
            {output}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--hover-bg)]">
              <Play className="h-5 w-5 text-[var(--text-tertiary)]" />
            </div>
            <p className="text-sm font-medium text-[var(--text-secondary)] mb-1">No output yet</p>
            <p className="text-xs text-[var(--text-tertiary)] mb-4 max-w-[280px]">
              Set up your constraints below, then generate to create AI output based on your
              knowledge base.
            </p>
            <Button size="sm" onClick={onGenerate} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  {generateProgressMessages[generatePhase]}
                </>
              ) : (
                <>
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                  Generate & Verify
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
