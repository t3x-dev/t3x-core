'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface GateDimensionBarProps {
  name: string;
  score: number;
  isLowest?: boolean;
  coverageRatio?: number;
  uncoveredSegments?: string[];
}

export function GateDimensionBar({
  name,
  score,
  isLowest,
  coverageRatio,
  uncoveredSegments,
}: GateDimensionBarProps) {
  const [expanded, setExpanded] = useState(false);
  const pct = Math.round(score * 100);
  const colorClass = score >= 0.9 ? 'bg-[var(--status-success)]' : score >= 0.7 ? 'bg-[var(--status-warning)]' : 'bg-[var(--status-error)]';
  const hasUncovered = uncoveredSegments && uncoveredSegments.length > 0;

  return (
    <div>
      <button
        type="button"
        className={cn(
          'flex items-center gap-2 text-sm w-full text-left',
          isLowest && 'font-medium',
          hasUncovered && 'cursor-pointer'
        )}
        onClick={hasUncovered ? () => setExpanded((v) => !v) : undefined}
        disabled={!hasUncovered}
      >
        <span className="w-28 truncate">{name}</span>
        {coverageRatio != null && (
          <span className="text-[10px] text-muted-foreground ml-1">
            (coverage {Math.round(coverageRatio * 100)}%)
          </span>
        )}
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', colorClass)}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={cn('w-8 text-right text-xs tabular-nums', isLowest && 'underline')}>
          {score.toFixed(2)}
        </span>
        {hasUncovered && (
          <span className="text-[10px] text-muted-foreground">
            {expanded ? '\u25B2' : '\u25BC'}
          </span>
        )}
      </button>
      {hasUncovered && expanded && (
        <div className="mt-1 space-y-0.5">
          {uncoveredSegments.map((seg) => (
            <div key={seg} className="text-[10px] text-muted-foreground pl-2">
              · {seg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
