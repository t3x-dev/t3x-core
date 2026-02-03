'use client';

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart as RechartsRadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

export interface DimensionScores {
  task_completion: number;
  tool_use: number;
  trajectory_efficiency: number;
  cost_efficiency: number;
  latency: number;
}

interface RadarChartProps {
  scores: DimensionScores;
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
function transformScores(scores: DimensionScores) {
  return Object.entries(scores).map(([key, value]) => ({
    dimension: DIMENSION_LABELS[key as keyof DimensionScores],
    value: Math.round(value * 100),
    fullMark: 100,
  }));
}

// Custom tooltip component
function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { dimension: string; value: number } }>;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-lg">
      <p className="text-sm font-medium">{data.dimension}</p>
      <p className="text-lg font-bold" style={{ color: getScoreColor(data.value) }}>
        {data.value}%
      </p>
    </div>
  );
}

// Get color based on score value
function getScoreColor(value: number): string {
  if (value >= 70) return '#22c55e'; // green-500
  if (value >= 40) return '#eab308'; // yellow-500
  return '#ef4444'; // red-500
}

export function RadarChart({ scores, className }: RadarChartProps) {
  const data = transformScores(scores);

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={240}>
        <RechartsRadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
          <PolarGrid stroke="#e5e7eb" strokeDasharray="3 3" />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            tickLine={false}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickCount={5}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Radar
            name="Score"
            dataKey="value"
            stroke="#6366f1"
            fill="#6366f1"
            fillOpacity={0.3}
            strokeWidth={2}
            dot={{
              r: 4,
              fill: '#6366f1',
              strokeWidth: 0,
            }}
            activeDot={{
              r: 6,
              fill: '#6366f1',
              stroke: '#fff',
              strokeWidth: 2,
            }}
          />
        </RechartsRadarChart>
      </ResponsiveContainer>
    </div>
  );
}
