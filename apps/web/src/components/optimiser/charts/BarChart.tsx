'use client';

import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  ResponsiveContainer,
  Tooltip,
  LabelList,
} from 'recharts';

export interface DimensionScores {
  task_completion: number;
  tool_use: number;
  trajectory_efficiency: number;
  cost_efficiency: number;
  latency: number;
}

interface BarChartProps {
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
    originalValue: value,
  }));
}

// Get color based on score value
function getScoreColor(value: number): string {
  if (value >= 70) return '#22c55e'; // green-500
  if (value >= 40) return '#eab308'; // yellow-500
  return '#ef4444'; // red-500
}

// Custom tooltip component
function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { dimension: string; value: number } }> }) {
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

// Custom label component - eslint-disable for recharts compatibility
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderCustomLabel(props: any) {
  const x = typeof props.x === 'number' ? props.x : 0;
  const y = typeof props.y === 'number' ? props.y : 0;
  const width = typeof props.width === 'number' ? props.width : 0;
  const height = typeof props.height === 'number' ? props.height : 0;
  const value = typeof props.value === 'number' ? props.value : 0;
  return (
    <text
      x={x + width + 8}
      y={y + height / 2}
      fill={getScoreColor(value)}
      fontSize={12}
      fontWeight={600}
      fontFamily="monospace"
      dominantBaseline="middle"
    >
      {value}%
    </text>
  );
}

export function BarChart({ scores, className }: BarChartProps) {
  const data = transformScores(scores);

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={240}>
        <RechartsBarChart
          data={data}
          layout="vertical"
          margin={{ top: 10, right: 50, left: 70, bottom: 10 }}
        >
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={{ stroke: '#e5e7eb' }}
          />
          <YAxis
            type="category"
            dataKey="dimension"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            tickLine={false}
            axisLine={false}
            width={65}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f3f4f6' }} />
          <Bar
            dataKey="value"
            radius={[0, 4, 4, 0]}
            barSize={24}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getScoreColor(entry.value)} />
            ))}
            <LabelList dataKey="value" content={renderCustomLabel} />
          </Bar>
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}
