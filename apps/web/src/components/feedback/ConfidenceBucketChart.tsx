'use client';

import type { CosineBucket } from '@/infrastructure/extraction-feedback';

interface ConfidenceBucketChartProps {
  buckets: CosineBucket[];
}

function bucketColor(acceptRate: number): string {
  // Interpolate from red (low accept_rate) to green (high accept_rate)
  const r = Math.round(220 - acceptRate * 180);
  const g = Math.round(60 + acceptRate * 140);
  const b = 60;
  return `rgb(${r}, ${g}, ${b})`;
}

export function ConfidenceBucketChart({ buckets }: ConfidenceBucketChartProps) {
  if (buckets.length === 0) {
    return <p className="text-sm text-[var(--text-tertiary)]">No cosine bucket data available.</p>;
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-[var(--text-secondary)]">
        Accept Rate by Cosine Similarity Bucket
      </h3>
      <div className="flex items-end gap-2" style={{ height: 200 }}>
        {buckets.map((b) => {
          const barHeight = b.total > 0 ? b.accept_rate * 100 : 0;
          return (
            <div
              key={b.bucket}
              className="flex flex-1 flex-col items-center gap-1"
              style={{ height: '100%' }}
            >
              <div className="flex flex-1 w-full items-end">
                <div
                  className="w-full rounded-t transition-all"
                  style={{
                    height: `${barHeight}%`,
                    backgroundColor: bucketColor(b.accept_rate),
                    minHeight: b.total > 0 ? 4 : 0,
                  }}
                  title={`${b.bucket}: ${b.accepted}/${b.total} accepted (${(b.accept_rate * 100).toFixed(1)}%), ${b.edited} edited, ${b.rejected} rejected`}
                />
              </div>
              <span
                className="text-[10px] text-[var(--text-tertiary)] whitespace-nowrap"
                style={{ transform: 'rotate(-45deg)', transformOrigin: 'top left', width: 0 }}
              >
                {b.bucket}
              </span>
            </div>
          );
        })}
      </div>
      <div className="h-8" />
    </div>
  );
}
