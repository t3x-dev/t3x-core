/**
 * useFeedbackStats — imperative loaders for extraction-feedback stats
 * (overall stats + cosine buckets per project).
 */

import { useCallback } from 'react';
import {
  getExtractionFeedbackStats,
  getFeedbackCosineBuckets,
} from '@/infrastructure/extraction-feedback';

export function useFeedbackStats() {
  const loadStats = useCallback(
    async (projectId: string) => getExtractionFeedbackStats(projectId),
    []
  );
  const loadCosineBuckets = useCallback(
    async (projectId: string) => getFeedbackCosineBuckets(projectId),
    []
  );
  return { loadStats, loadCosineBuckets };
}
