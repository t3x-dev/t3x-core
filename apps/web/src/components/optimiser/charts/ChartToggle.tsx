'use client';

import { Button } from '@/components/ui/button';
import { type ChartType, useOptimiserStore } from '@/store/optimiserStore';
import { DimensionScoreCard } from '../metrics/DimensionScoreCard';
import { BarChart } from './BarChart';
import { type DimensionScores, RadarChart } from './RadarChart';

interface ChartToggleProps {
  scores: DimensionScores;
  showScoreList?: boolean;
  className?: string;
}

export function ChartToggle({ scores, showScoreList = true, className }: ChartToggleProps) {
  const { chartType, setChartType } = useOptimiserStore();

  return (
    <div className={className}>
      {/* Toggle buttons */}
      <div className="mb-3 flex justify-end">
        <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1">
          <Button
            variant={chartType === 'radar' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => setChartType('radar')}
          >
            Radar
          </Button>
          <Button
            variant={chartType === 'bar' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => setChartType('bar')}
          >
            Bar
          </Button>
        </div>
      </div>

      {/* Chart */}
      {chartType === 'radar' ? <RadarChart scores={scores} /> : <BarChart scores={scores} />}

      {/* Score list with progress bars */}
      {showScoreList && (
        <div className="mt-4 border-t pt-4">
          <DimensionScoreCard scores={scores} />
        </div>
      )}
    </div>
  );
}

// Re-export types for convenience
export type { DimensionScores, ChartType };
