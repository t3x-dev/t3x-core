import { CheckCircle2 } from 'lucide-react';

interface MergeReadyStripProps {
  autoKeptCount: number;
  conflictCount: number;
  previewTotal: number;
  message: string;
}

export function MergeReadyStrip({
  autoKeptCount,
  conflictCount,
  previewTotal,
  message,
}: MergeReadyStripProps) {
  const hasMessage = message.trim().length > 0;
  const title = hasMessage ? 'Ready to merge' : 'Structure ready';

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-[var(--status-success)]/25 bg-[var(--status-success-muted)] px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--status-success)]/25 bg-[var(--surface-panel)] text-[var(--status-success)]">
          <CheckCircle2 size={15} />
        </span>
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-[var(--text-primary)]">{title}</div>
          <div className="mt-0.5 font-mono text-[10px] text-[var(--text-tertiary)]">
            {autoKeptCount} auto-kept · {conflictCount} conflicts
            {!hasMessage ? ' · message required' : ''}
          </div>
        </div>
      </div>
      <span className="hidden shrink-0 rounded-full border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)] md:inline-flex">
        Preview total {previewTotal}
      </span>
    </div>
  );
}
