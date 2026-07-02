import { ChevronDown, RotateCw, ShieldCheck } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  getYSchemaValidationCommitLabel,
  getYSchemaValidationPrimaryLabel,
  type YSchemaValidationSummary,
} from '@/domain/project/yschemaValidation';

interface ProjectStateTabProps {
  children: ReactNode;
  onRunValidation?: () => Promise<void> | void;
  validation?: YSchemaValidationSummary | null;
  validationError?: string | null;
  validationRunning?: boolean;
}

export function ProjectStateTab({
  children,
  onRunValidation,
  validation,
  validationError,
  validationRunning = false,
}: ProjectStateTabProps) {
  const gapDetailsId = useId();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const validationBadge = getYSchemaBadge(validation);
  const validationGaps = validation?.gaps ?? [];
  const validationGapCount = validation?.gapCount ?? validationGaps.length;
  const hasValidationGaps = validationGapCount > 0;
  const validationHasRun = Boolean(validation?.runId);
  const validationReady = validation?.status === 'verified';
  const schemaName = validation?.schemaName ?? 't3x/prd';
  const validationGapLabel = `${validationGapCount} validation ${
    validationGapCount === 1 ? 'gap' : 'gaps'
  }`;
  const validationUseLabel = validationReady
    ? 'Ready to use'
    : validationHasRun
      ? 'Use blocked until YSchema passes'
      : 'Run YSchema validation before use';

  return (
    <section className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--hover-bg)] text-[var(--text-secondary)]">
              <ShieldCheck aria-hidden="true" className="size-4" />
            </span>
            <h2 className="text-sm font-bold text-[var(--text-primary)]">State status</h2>
            <Badge variant={validationBadge.variant}>{validationBadge.label}</Badge>
            <Badge variant="outline">{getYSchemaValidationCommitLabel(validation)}</Badge>
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              {validationUseLabel}
            </span>
            <span className="text-xs font-semibold text-[var(--text-tertiary)]">
              Schema {schemaName}
            </span>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {hasValidationGaps ? (
              <Button
                aria-controls={gapDetailsId}
                aria-expanded={detailsOpen}
                onClick={() => setDetailsOpen((open) => !open)}
                size="sm"
                type="button"
                variant="canvas-outline"
              >
                <ChevronDown
                  aria-hidden="true"
                  className={
                    detailsOpen
                      ? 'size-4 rotate-180 transition-transform'
                      : 'size-4 transition-transform'
                  }
                />
                {validationGapLabel}
              </Button>
            ) : null}
            <Button
              disabled={!onRunValidation || validationRunning}
              onClick={onRunValidation}
              size="sm"
              type="button"
              variant="canvas-outline"
            >
              <RotateCw className={validationRunning ? 'size-4 animate-spin' : 'size-4'} />
              {validationRunning ? 'Running...' : 'Run validation'}
            </Button>
          </div>
        </div>

        {detailsOpen && validationGaps.length > 0 ? (
          <div className="mt-2 grid gap-2 md:grid-cols-2" id={gapDetailsId}>
            {validationGaps.slice(0, 2).map((gap) => (
              <div
                className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 py-2"
                key={`${gap.code}:${gap.path}:${gap.message}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-[var(--text-primary)]">{gap.label}</span>
                  {gap.path ? <Badge variant="outline">{gap.path}</Badge> : null}
                </div>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{gap.message}</p>
              </div>
            ))}
          </div>
        ) : null}

        {detailsOpen && hasValidationGaps && validationGaps.length === 0 ? (
          <p className="mt-2 text-xs font-medium text-[var(--text-secondary)]" id={gapDetailsId}>
            Validation gap details are not available for this run.
          </p>
        ) : null}

        {validationError ? (
          <p className="mt-2 text-xs font-semibold text-[var(--status-warning)]">
            {validationError}
          </p>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

function getYSchemaBadge(validation: YSchemaValidationSummary | null | undefined) {
  if (!validation) {
    return { label: 'YSchema pending', variant: 'pending' as const };
  }
  if (validation.status === 'verified') {
    return { label: getYSchemaValidationPrimaryLabel(validation), variant: 'success' as const };
  }
  if (validation.status === 'failed' || validation.status === 'stale') {
    return { label: getYSchemaValidationPrimaryLabel(validation), variant: 'warning' as const };
  }
  return { label: getYSchemaValidationPrimaryLabel(validation), variant: 'pending' as const };
}
