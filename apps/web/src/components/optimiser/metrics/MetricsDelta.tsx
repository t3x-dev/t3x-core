'use client';

import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { cn } from '@/utils/cn';

interface MetricsDeltaProps {
  v1: number;
  v2: number;
  /** Show as percentage (multiply by 100) */
  asPercent?: boolean;
  /** Invert colors (lower is better, e.g., latency) */
  invertColors?: boolean;
  className?: string;
}

export function MetricsDelta({
  v1,
  v2,
  asPercent = true,
  invertColors = false,
  className,
}: MetricsDeltaProps) {
  const delta = v2 - v1;
  const deltaPercent = asPercent ? Math.round(delta * 100) : delta;

  // Determine if improved, same, or regressed
  const isImproved = invertColors ? delta < 0 : delta > 0;
  const isRegressed = invertColors ? delta > 0 : delta < 0;
  const isSame = Math.abs(delta) < 0.001;

  if (isSame) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-muted-foreground', className)}>
        <Minus className="h-3 w-3" />
        <span className="font-mono text-xs">0%</span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-mono text-xs',
        isImproved && 'text-[var(--status-success)]',
        isRegressed && 'text-[var(--status-error)]',
        className
      )}
    >
      {isImproved ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      <span>
        {delta > 0 ? '+' : ''}
        {deltaPercent}%
      </span>
    </span>
  );
}

// Helper component for displaying comparison values
interface CompareValueProps {
  v1: number;
  v2: number;
  label: string;
  asPercent?: boolean;
  invertColors?: boolean;
  className?: string;
}

export function CompareValue({
  v1,
  v2,
  label,
  asPercent = true,
  invertColors = false,
  className,
}: CompareValueProps) {
  const format = (v: number) => (asPercent ? `${Math.round(v * 100)}%` : v.toFixed(1));

  return (
    <div className={cn('space-y-1', className)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm">{format(v1)}</span>
        <span className="text-muted-foreground">→</span>
        <span className="font-mono text-sm font-medium">{format(v2)}</span>
        <MetricsDelta v1={v1} v2={v2} asPercent={asPercent} invertColors={invertColors} />
      </div>
    </div>
  );
}
