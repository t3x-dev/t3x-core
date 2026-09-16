'use client';

import { useCallback, useEffect, useState } from 'react';
import { getUsageDashboard, type UsageDashboardData } from '@/infrastructure/usage';

export type { UsageModelRow, UsageSummaryRow } from '@/infrastructure/usage';

export function useUsageSettings(days: number) {
  const [data, setData] = useState<UsageDashboardData | null>(null);
  const [previousData, setPreviousData] = useState<UsageDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - days + 1);
    const previousTo = new Date(from);
    previousTo.setMilliseconds(previousTo.getMilliseconds() - 1);
    const previousFrom = new Date(previousTo);
    previousFrom.setDate(previousFrom.getDate() - days + 1);
    setLoading(true);
    setError(null);
    Promise.all([
      getUsageDashboard(from, to, controller.signal),
      getUsageDashboard(previousFrom, previousTo, controller.signal),
    ])
      .then(([current, previous]) => {
        setData(current);
        setPreviousData(previous);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'Unable to load usage');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [days, revision]);

  const retry = useCallback(() => setRevision((value) => value + 1), []);
  return { data, previousData, error, loading, retry };
}
