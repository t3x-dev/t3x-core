/**
 * Auto-commit evaluator for Knowledge Autopilot.
 *
 * Pure functions — no DB, no IO, no side effects.
 */

export interface AutopilotConfig {
  /** Master toggle for auto-commit */
  enabled: boolean;
  /** Minimum qualifying nodes to trigger commit (default 1) */
  min_nodes: number;
  /** Also create a leaf on auto-commit (default false) */
  auto_create_leaf: boolean;
  /** Branch for auto-commits (default 'main') */
  target_branch: string;
}

export const DEFAULT_AUTOPILOT_CONFIG: AutopilotConfig = {
  enabled: false,
  min_nodes: 1,
  auto_create_leaf: false,
  target_branch: 'main',
};

export interface AutoCommitCandidate {
  id: string;
  text: string;
  zone: 'ready' | 'review';
  status: string;
  staged: boolean;
}

export interface AutoCommitPlan {
  should_commit: boolean;
  nodes: Array<{ id: string; text: string }>;
  skipped: Array<{ id: string; reason: string }>;
  reason: string;
}

/**
 * Evaluate whether candidates should be auto-committed.
 *
 * Rules:
 * 1. If autopilot disabled -> no commit
 * 2. Filter: zone === 'ready' && staged === true && status !== 'undone'
 * 3. Need at least min_nodes qualifying nodes -> otherwise no commit
 */
export function evaluateAutoCommit(
  candidates: AutoCommitCandidate[],
  config: AutopilotConfig
): AutoCommitPlan {
  if (!config.enabled) {
    return {
      should_commit: false,
      nodes: [],
      skipped: candidates.map((c) => ({
        id: c.id,
        reason: 'autopilot_disabled',
      })),
      reason: 'autopilot_disabled',
    };
  }

  const eligible: Array<{ id: string; text: string }> = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const c of candidates) {
    if (c.zone !== 'ready') {
      skipped.push({ id: c.id, reason: 'not_in_ready_zone' });
      continue;
    }
    if (!c.staged) {
      skipped.push({ id: c.id, reason: 'not_staged' });
      continue;
    }
    if (c.status === 'undone') {
      skipped.push({ id: c.id, reason: 'undone' });
      continue;
    }
    eligible.push({ id: c.id, text: c.text });
  }

  if (eligible.length < config.min_nodes) {
    return {
      should_commit: false,
      nodes: [],
      skipped: [...skipped, ...eligible.map((e) => ({ id: e.id, reason: 'insufficient_total' }))],
      reason: 'insufficient_nodes',
    };
  }

  return {
    should_commit: true,
    nodes: eligible,
    skipped,
    reason: 'auto_commit_ready',
  };
}

/**
 * Deep-merge a partial config with defaults.
 */
export function mergeAutopilotConfig(partial?: Partial<AutopilotConfig>): AutopilotConfig {
  if (!partial) return { ...DEFAULT_AUTOPILOT_CONFIG };
  return {
    enabled: partial.enabled ?? DEFAULT_AUTOPILOT_CONFIG.enabled,
    min_nodes: partial.min_nodes ?? DEFAULT_AUTOPILOT_CONFIG.min_nodes,
    auto_create_leaf: partial.auto_create_leaf ?? DEFAULT_AUTOPILOT_CONFIG.auto_create_leaf,
    target_branch: partial.target_branch ?? DEFAULT_AUTOPILOT_CONFIG.target_branch,
  };
}
