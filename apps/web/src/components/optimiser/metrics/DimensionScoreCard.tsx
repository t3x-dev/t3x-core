'use client';

import { cn } from '@/lib/utils';

export interface DimensionScores {
  task_completion: number;
  tool_use: number;
  trajectory_efficiency: number;
  cost_efficiency: number;
  latency: number;
}

interface DimensionScoreCardProps {
  scores: DimensionScores;
  className?: string;
}

// Map dimension keys to display labels
const DIMENSION_LABELS: Record<keyof DimensionScores, string> = {
  task_completion: 'Task Completion',
  tool_use: 'Tool Use',
  trajectory_efficiency: 'Efficiency',
  cost_efficiency: 'Cost',
  latency: 'Latency',
};

// Get color classes based on score value
function getScoreColorClasses(value: number): { bar: string; text: string } {
  if (value >= 0.7) {
    return { bar: 'bg-green-500', text: 'text-[var(--status-success)]' };
  }
  if (value >= 0.4) {
    return { bar: 'bg-yellow-500', text: 'text-[var(--status-warning)]' };
  }
  return { bar: 'bg-red-500', text: 'text-[var(--status-error)]' };
}

export function DimensionScoreCard({ scores, className }: DimensionScoreCardProps) {
  const entries = Object.entries(scores) as [keyof DimensionScores, number][];

  return (
    <div className={cn('space-y-2', className)}>
      {entries.map(([key, value]) => {
        const colors = getScoreColorClasses(value);
        const percentage = Math.round(value * 100);

        return (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{DIMENSION_LABELS[key]}</span>
              <span className={cn('font-mono font-medium', colors.text)}>{percentage}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full transition-all', colors.bar)}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
