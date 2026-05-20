'use client';

import { CheckCircle2, GitCommitHorizontal } from 'lucide-react';
import { useEffect } from 'react';
import { SealAnimation } from '@/components/canvas/SealAnimation';
import { useReducedMotion } from '@/hooks/shared/useReducedMotion';
import { cn } from '@/utils/cn';
import { formatCommitHashForReveal } from '@/utils/hashReveal';

const CEREMONY_DURATION_MS = 1400;

interface CommitCeremonyProps {
  hash: string | null;
  open: boolean;
  onComplete: () => void;
}

export function CommitCeremony({ hash, open, onComplete }: CommitCeremonyProps) {
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!open || !hash) return;
    const timer = window.setTimeout(onComplete, CEREMONY_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [hash, onComplete, open]);

  if (!open || !hash) return null;

  const reveal = formatCommitHashForReveal(hash);

  return (
    <output
      aria-label="Commit sealed"
      data-motion={prefersReducedMotion ? 'reduced' : 'standard'}
      className={cn(
        'pointer-events-none absolute right-3 top-3 z-30 w-[360px] max-w-[calc(100%-1.5rem)] rounded-xl border border-[var(--accent-commit)]/35 bg-[var(--surface-elevated)] px-3.5 py-3 shadow-[var(--fx-shadow-lg)]',
        !prefersReducedMotion &&
          'transition-[opacity,transform] duration-[var(--motion-slow)] ease-[var(--ease-out-soft)]'
      )}
    >
      {!prefersReducedMotion && (
        <SealAnimation width={360} height={84} borderRadius={12} isActive={open} />
      )}
      <div className="relative z-[1] flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--accent-commit)]/25 bg-[var(--accent-commit-soft)] text-[var(--accent-commit)]">
          <GitCommitHorizontal className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--accent-commit)]" />
            <span className="text-[11px] font-semibold uppercase text-[var(--accent-commit)]">
              Sealed
            </span>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-1.5">
            {reveal.prefix && (
              <span className="shrink-0 rounded border border-[var(--stroke-default)] bg-[var(--surface-panel)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--text-tertiary)]">
                {reveal.prefix}
              </span>
            )}
            <code
              title={reveal.full}
              className="min-w-0 truncate font-mono text-[12px] font-semibold text-[var(--text-primary)]"
            >
              {reveal.compact}
            </code>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-[var(--text-secondary)]">
            Knowledge tree committed to the hash chain.
          </p>
        </div>
      </div>
    </output>
  );
}
