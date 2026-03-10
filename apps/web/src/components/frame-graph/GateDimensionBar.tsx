'use client';

import { cn } from '@/lib/utils';

interface GateDimensionBarProps {
  name: string;
  score: number;
  isLowest?: boolean;
}

export function GateDimensionBar({ name, score, isLowest }: GateDimensionBarProps) {
  const pct = Math.round(score * 100);
  const colorClass = score >= 0.9 ? 'bg-emerald-500' : score >= 0.7 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className={cn('flex items-center gap-2 text-sm', isLowest && 'font-medium')}>
      <span className="w-28 truncate">{name}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', colorClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn('w-8 text-right text-xs tabular-nums', isLowest && 'underline')}>
        {score.toFixed(2)}
      </span>
    </div>
  );
}
