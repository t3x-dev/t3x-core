'use client';

import { Check, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ProgressStatus = 'idle' | 'loading' | 'success' | 'error';

interface ProgressIndicatorProps {
  status: ProgressStatus;
  /** Label to show next to indicator */
  label?: string;
  /** Size of the icon in pixels */
  size?: number;
  className?: string;
}

/**
 * Inline progress indicator for action buttons.
 * Shows spinner while loading, check on success, X on error.
 * Idle state renders nothing (returns null).
 */
export function ProgressIndicator({ status, label, size = 14, className }: ProgressIndicatorProps) {
  if (status === 'idle') return null;

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      {status === 'loading' && (
        <Loader2 size={size} className="animate-spin text-[var(--text-tertiary)]" />
      )}
      {status === 'success' && <Check size={size} className="text-[var(--status-success)]" />}
      {status === 'error' && <X size={size} className="text-[var(--status-error)]" />}
      {label && (
        <span
          className={cn(
            'text-xs',
            status === 'loading' && 'text-[var(--text-tertiary)]',
            status === 'success' && 'text-[var(--status-success)]',
            status === 'error' && 'text-[var(--status-error)]'
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}
