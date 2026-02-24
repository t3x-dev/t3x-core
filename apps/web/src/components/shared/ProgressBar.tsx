'use client';

import { cn } from '@/lib/utils';

/**
 * ProgressBar — horizontal bar with percentage fill.
 *
 * Spec: frontend-art-template §5.9
 * Used in Merge workspace footer and Runner results.
 */

interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
  color?: 'blue' | 'green' | 'orange';
}

const colorMap = {
  blue: 'bg-blue-500',
  green: 'bg-emerald-500',
  orange: 'bg-[var(--accent-pending)]',
};

export function ProgressBar({ value, max, label, color = 'blue' }: ProgressBarProps) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-[var(--duration-emphasis)]',
            colorMap[color]
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {label && <span className="shrink-0 text-xs text-muted-foreground">{label}</span>}
    </div>
  );
}
