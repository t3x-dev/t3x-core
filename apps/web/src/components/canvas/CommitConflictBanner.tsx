'use client';

import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ConflictCandidate } from '@/lib/api/commits';

interface CommitConflictBannerProps {
  conflicts: ConflictCandidate[];
  onDismiss: () => void;
  onViewDetails: () => void;
}

export function CommitConflictBanner({
  conflicts,
  onDismiss,
  onViewDetails,
}: CommitConflictBannerProps) {
  const shown = conflicts.slice(0, 3);
  const remaining = conflicts.length - shown.length;

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 w-[600px] max-w-[calc(100%-2rem)] rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/90 shadow-lg p-4 animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
            {conflicts.length} potential {conflicts.length === 1 ? 'conflict' : 'conflicts'}{' '}
            detected with existing knowledge
          </p>
          <div className="mt-2 space-y-1.5">
            {shown.map((c) => (
              <div
                key={`${c.new_sentence_id}-${c.existing_sentence_id}`}
                className="text-xs text-amber-800 dark:text-amber-200"
              >
                <span>&ldquo;{truncate(c.new_sentence_text, 40)}&rdquo;</span>
                <span className="mx-1 text-amber-400">&harr;</span>
                <span>&ldquo;{truncate(c.existing_sentence_text, 40)}&rdquo;</span>
                <span className="ml-1 text-amber-500">({((c.cosine ?? 0) * 100).toFixed(0)}%)</span>
              </div>
            ))}
            {remaining > 0 && <p className="text-xs text-amber-500">+{remaining} more</p>}
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onDismiss}>
              Dismiss
            </Button>
            <Button variant="default" size="sm" className="h-7 text-xs" onClick={onViewDetails}>
              View Details
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-amber-400 hover:text-amber-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function truncate(s: string, maxLen: number): string {
  return s.length <= maxLen ? s : `${s.slice(0, maxLen - 1)}\u2026`;
}
