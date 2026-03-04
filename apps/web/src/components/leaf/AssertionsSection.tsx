'use client';

import { BookOpen, Check, CheckCircle, X } from 'lucide-react';
import type React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Assertion, Constraint } from '@/lib/api';
import { cn } from '@/lib/utils';

// ============================================================================
// Assertions Section
// ============================================================================

export interface AssertionsSectionProps {
  assertions: Assertion[] | null;
  constraints: Constraint[];
  title?: string;
  selectedIds?: Set<string>;
  onToggle?: (id: string) => void;
  footer?: React.ReactNode;
}

export function AssertionsSection({
  assertions,
  constraints,
  title = 'Validation Results',
  selectedIds,
  onToggle,
  footer,
}: AssertionsSectionProps) {
  if (!assertions || assertions.length === 0) {
    return (
      <section className="rounded-lg border bg-card elevation-1 elevation-hover">
        <div className="border-b p-[var(--space-group)]">
          <h2 className="font-semibold">{title}</h2>
        </div>
        <div className="p-[var(--space-group)]">
          <p className="text-sm text-muted-foreground text-center py-8">
            No {title.toLowerCase()} yet.
          </p>
        </div>
      </section>
    );
  }

  const passedCount = assertions.filter((a) => a.passed).length;
  const failedCount = assertions.length - passedCount;
  const allPassed = failedCount === 0;

  // Create a map of constraint ID to constraint for quick lookup
  const constraintMap = new Map(constraints.map((c) => [c.id, c]));

  return (
    <section
      className={cn(
        'rounded-lg border bg-card transition-all duration-[var(--duration-emphasis)]',
        allPassed &&
          'ring-2 ring-[var(--status-success)]/50 animate-in fade-in zoom-in-95 duration-[var(--duration-emphasis)]'
      )}
    >
      <div className="flex items-center justify-between border-b p-[var(--space-group)]">
        <h2 className="font-semibold">{title}</h2>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'flex items-center gap-1 text-sm font-medium',
              allPassed ? 'text-[var(--status-success)]' : 'text-[var(--status-error)]'
            )}
          >
            {allPassed ? (
              <>
                <CheckCircle className="h-4 w-4" />
                All Passed
              </>
            ) : (
              <>
                <X className="h-4 w-4" />
                {failedCount} Failed
              </>
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            ({passedCount}/{assertions.length})
          </span>
        </div>
      </div>
      <div className="p-[var(--space-group)] space-y-[var(--space-item)]">
        {assertions.map((assertion) => {
          const constraint = constraintMap.get(assertion.constraint_id);
          return (
            <AssertionItem
              key={assertion.id}
              assertion={assertion}
              constraint={constraint}
              selected={selectedIds?.has(assertion.id)}
              onToggle={onToggle ? () => onToggle(assertion.id) : undefined}
            />
          );
        })}
        {footer}
      </div>
    </section>
  );
}

interface AssertionItemProps {
  assertion: Assertion;
  constraint: Constraint | undefined;
  selected?: boolean;
  onToggle?: () => void;
}

function AssertionItem({ assertion, constraint, selected, onToggle }: AssertionItemProps) {
  return (
    <div
      className={cn(
        'rounded-md border p-3',
        assertion.passed
          ? 'border-[var(--status-success)]/20 bg-[var(--status-success-muted)]'
          : 'border-[var(--status-error)]/20 bg-[var(--status-error-muted)]'
      )}
    >
      <div className="flex items-start gap-2">
        {onToggle && <Checkbox checked={selected} onCheckedChange={onToggle} className="mt-0.5" />}
        {assertion.passed ? (
          <Check
            className="h-4 w-4 text-[var(--status-success)] shrink-0 mt-0.5"
            aria-hidden="true"
          />
        ) : (
          <X className="h-4 w-4 text-[var(--status-error)] shrink-0 mt-0.5" aria-hidden="true" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="font-medium text-sm truncate max-w-[200px]">
                  {constraint?.value || assertion.constraint_id}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs break-words">
                {constraint?.value || assertion.constraint_id}
              </TooltipContent>
            </Tooltip>
            <span
              className={cn(
                'text-xs px-1.5 py-0.5 rounded',
                assertion.passed
                  ? 'bg-[var(--status-success-muted)] text-[var(--status-success)]'
                  : 'bg-[var(--status-error-muted)] text-[var(--status-error)]'
              )}
            >
              {assertion.passed ? 'PASS' : 'FAIL'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{assertion.details}</p>
          {assertion.lesson && (
            <div className="mt-2 flex items-start gap-1.5 rounded bg-amber-500/10 p-2 text-xs">
              <BookOpen className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
              <div>
                <span className="font-medium text-amber-700">Lesson: </span>
                <span className="text-amber-900">{assertion.lesson}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
