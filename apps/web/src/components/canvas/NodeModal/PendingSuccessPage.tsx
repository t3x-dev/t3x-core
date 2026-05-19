'use client';

import { ArrowRight, GitCompare, Minus, Pencil, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTerminology } from '@/hooks/shared/useTerminology';
import { cn } from '@/utils/cn';
import { glass } from '@/utils/theme';

export interface PendingSuccessPageProps {
  commitHash: string;
  parentHash: string | null;
  diffStats:
    | {
        addedCount: number;
        modifiedCount: number;
        removedCount: number;
        sameCount: number;
      }
    | undefined;
  projectId: string;
  onClose: () => void;
  onViewDetails: () => void;
  onCreateOutput: () => void;
}

export function PendingSuccessPage({
  commitHash,
  diffStats,
  onClose,
  onViewDetails,
  onCreateOutput,
}: PendingSuccessPageProps) {
  const { t } = useTerminology();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-scrim)] backdrop-blur-[8px]"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className={cn(
          'flex flex-col w-[95vw] max-w-[520px] rounded-2xl overflow-hidden relative',
          glass.cardBase,
          glass.highlight
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          className="absolute top-4 right-4 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={20} />
        </button>
        <div className="flex flex-col items-center gap-5 px-8 py-10">
          {/* Commit badge + checkmark draw animation */}
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-commit)] text-[var(--on-accent)] shadow-[var(--fx-shadow-md)]">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <path
                d="M9 16.5L14 21.5L23 11"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength="1"
                className="[stroke-dasharray:1] [stroke-dashoffset:1] animate-[strokeDraw_0.4s_ease-out_0.3s_forwards]"
              />
            </svg>
          </div>

          <div className="text-center">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">
              Knowledge saved
            </h2>
            <p className="text-sm text-[var(--text-tertiary)] font-mono">
              {commitHash.slice(0, 12)}...
            </p>
          </div>

          {/* Diff stats summary */}
          {diffStats && (
            <div className="w-full flex items-center justify-center gap-4 py-3 px-4 bg-[var(--surface-app)] rounded-lg border border-[var(--stroke-divider)]">
              <span className="flex items-center gap-1 text-sm text-[var(--diff-added-accent)] font-medium">
                <Plus size={14} />
                {diffStats.addedCount} added
              </span>
              <span className="flex items-center gap-1 text-sm text-[var(--diff-modified-accent)] font-medium">
                <Pencil size={14} />
                {diffStats.modifiedCount} modified
              </span>
              <span className="flex items-center gap-1 text-sm text-[var(--diff-removed-accent)] font-medium">
                <Minus size={14} />
                {diffStats.removedCount} removed
              </span>
            </div>
          )}

          {/* Action buttons */}
          <div className="w-full flex flex-col gap-2 mt-2">
            <Button onClick={onViewDetails} variant="outline" className="w-full gap-2">
              <GitCompare size={16} />
              <span>View {t('commit')} Details</span>
            </Button>
            <Button variant="leaf" onClick={onCreateOutput} className="w-full gap-2">
              <span>Create Output</span>
              <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
