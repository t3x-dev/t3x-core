/**
 * Extraction Feedback API — feedback statistics and cosine bucket analysis
 */

import { API_V1, fetchWithTimeout, handleResponse } from './core';

// ============================================================================
// Types
// ============================================================================

export interface FeedbackTypeStats {
  total: number;
  accepted: number;
  edited: number;
  rejected: number;
}

export interface FeedbackStats {
  by_inference_type: Record<string, FeedbackTypeStats>;
  overall: {
    total: number;
    accept_rate: number;
    edit_rate: number;
    reject_rate: number;
  };
}

export interface CosineBucket {
  bucket: string;
  total: number;
  accepted: number;
  edited: number;
  rejected: number;
  accept_rate: number;
}

// ============================================================================
// Feedback Queries
// ============================================================================

/**
 * Get extraction feedback statistics broken down by inference type.
 */
export async function getExtractionFeedbackStats(projectId: string): Promise<FeedbackStats> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/extraction-feedback/stats`
  );
  return handleResponse<FeedbackStats>(res);
}

/**
 * Get feedback distribution across cosine similarity buckets.
 */
export async function getFeedbackCosineBuckets(projectId: string): Promise<CosineBucket[]> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/extraction-feedback/cosine-buckets`
  );
  return handleResponse<CosineBucket[]>(res);
}
