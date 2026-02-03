'use client';

import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart as RechartsRadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { cn } from '@/lib/utils';

export interface DimensionScores {
  task_completion: number;
  tool_use: number;
  trajectory_efficiency: number;
  cost_efficiency: number;
  latency: number;
}

interface DualChartProps {
  scoresV1: DimensionScores;
  scoresV2: DimensionScores;
  labelV1?: string;
  labelV2?: string;
  className?: string;
}

// Map dimension keys to display labels
const DIMENSION_LABELS: Record<keyof DimensionScores, string> = {
  task_completion: 'Task',
  tool_use: 'Tool Use',
  trajectory_efficiency: 'Efficiency',
  cost_efficiency: 'Cost',
  latency: 'Latency',
};

// Transform scores to chart data format
function transformDualScores(scoresV1: DimensionScores, scoresV2: DimensionScores) {
  return Object.entries(scoresV1).map(([key, value]) => ({
    dimension: DIMENSION_LABELS[key as keyof DimensionScores],
    v1: Math.round(value * 100),
    v2: Math.round(scoresV2[key as keyof DimensionScores] * 100),
  }));
}

// Custom tooltip
function CustomTooltip({
  active,
  payload,
  labelV1,
  labelV2,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; dataKey: string }>;
  labelV1: string;
  labelV2: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const v1 = payload.find((p) => p.dataKey === 'v1');
  const v2 = payload.find((p) => p.dataKey === 'v2');

  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-lg">
      <div className="space-y-1 text-sm">
        {v1 && (
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            <span className="text-muted-foreground">{labelV1}:</span>
            <span className="font-mono font-medium">{v1.value}%</span>
          </div>
        )}
        {v2 && (
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-muted-foreground">{labelV2}:</span>
            <span className="font-mono font-medium">{v2.value}%</span>
          </div>
        )}
        {v1 && v2 && (
          <div className="border-t pt-1 mt-1">
            <span className="text-muted-foreground">Delta: </span>
            <span
              className={cn(
                'font-mono font-medium',
                v2.value > v1.value && 'text-green-600',
                v2.value < v1.value && 'text-red-600'
              )}
            >
              {v2.value > v1.value ? '+' : ''}
              {v2.value - v1.value}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function DualChart({
  scoresV1,
  scoresV2,
  labelV1 = 'V1',
  labelV2 = 'V2',
  className,
}: DualChartProps) {
  const data = transformDualScores(scoresV1, scoresV2);

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={300}>
        <RechartsRadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            tickLine={false}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickCount={6}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip labelV1={labelV1} labelV2={labelV2} />} />
          <Legend
            wrapperStyle={{ fontSize: '12px' }}
            formatter={(value) => (value === 'v1' ? labelV1 : labelV2)}
          />
          <Radar
            name="v1"
            dataKey="v1"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.2}
            strokeWidth={2}
          />
          <Radar
            name="v2"
            dataKey="v2"
            stroke="#22c55e"
            fill="#22c55e"
            fillOpacity={0.2}
            strokeWidth={2}
          />
        </RechartsRadarChart>
      </ResponsiveContainer>
    </div>
  );
}
