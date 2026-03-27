'use client';

import { BarChart3 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type FeedbackStats, getExtractionFeedbackStats } from '@/lib/api/extraction-feedback';
import { cn } from '@/lib/utils';

interface QualityStripProps {
  projectId: string;
}

export function QualityStrip({ projectId }: QualityStripProps) {
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getExtractionFeedbackStats(projectId);
        if (!cancelled) setStats(data);
      } catch {
        // Silently fail — stats are non-critical
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (loading || !stats || stats.overall.total === 0) return null;

  const rate = stats.overall.accept_rate;
  const barColor = rate >= 0.8 ? 'bg-emerald-500' : rate >= 0.6 ? 'bg-amber-500' : 'bg-red-500';
  const textColor =
    rate >= 0.8
      ? 'text-emerald-600 dark:text-emerald-400'
      : rate >= 0.6
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-red-600 dark:text-red-400';

  return (
    <div className="px-3 py-2 border-b">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground">Extraction Quality</span>
        <span className={cn('text-sm font-medium ml-auto', textColor)}>
          {Math.round(rate * 100)}%
        </span>
      </div>
      <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', barColor)}
          style={{ width: `${Math.round(rate * 100)}%` }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-muted-foreground">
          {stats.overall.total} feedback actions
        </span>
        <a
          href="/insights"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          Details ↗
        </a>
      </div>
    </div>
  );
}
