/**
 * Autopilot API — automatic commit configuration and adaptive thresholds
 */

import { API_V1, fetchWithTimeout, handleResponse } from './core';

// ============================================================================
// Types
// ============================================================================

export interface AutopilotConfig {
  enabled: boolean;
  min_confidence: number;
  min_sentences: number;
  auto_create_leaf: boolean;
  target_branch: string;
}

export interface AdaptiveResult {
  adaptive: {
    confidenceMultipliers: Record<string, number>;
    suppressedTypes: string[];
    cosineThresholdDelta: number;
  } | null;
  message?: string;
  stats?: Record<string, unknown>;
}

export interface AutoCommitResult {
  auto_committed: boolean;
  reason?: string;
  commit?: {
    hash: string;
    branch?: string;
    committed_at?: string;
  };
  sentences_committed?: number;
  sentences_skipped?: number;
  skipped?: Array<{ id: string; reason: string }>;
}

// ============================================================================
// Autopilot Operations
// ============================================================================

/**
 * Get the autopilot configuration for a project.
 */
export async function getAutopilotConfig(projectId: string): Promise<AutopilotConfig> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/autopilot/config`
  );
  return handleResponse<AutopilotConfig>(res);
}

/**
 * Update the autopilot configuration for a project.
 */
export async function updateAutopilotConfig(
  projectId: string,
  config: Partial<AutopilotConfig>
): Promise<AutopilotConfig> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/autopilot/config`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    }
  );
  return handleResponse<AutopilotConfig>(res);
}

/**
 * Get adaptive threshold adjustments based on user feedback history.
 */
export async function getAdaptiveThreshold(projectId: string): Promise<AdaptiveResult> {
  const res = await fetchWithTimeout(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/autopilot/adaptive`
  );
  return handleResponse<AdaptiveResult>(res);
}

/**
 * Auto-commit a draft using autopilot rules (confidence filtering, etc.).
 */
export async function autoCommitDraft(draftId: string): Promise<AutoCommitResult> {
  const res = await fetchWithTimeout(
    `${API_V1}/drafts/${encodeURIComponent(draftId)}/auto-commit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }
  );
  return handleResponse<AutoCommitResult>(res);
}
