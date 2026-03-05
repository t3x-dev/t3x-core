/**
 * Auto-commit evaluator for Knowledge Autopilot.
 *
 * Pure functions — no DB, no IO, no side effects.
 */

export interface AutopilotConfig {
  /** Master toggle for auto-commit */
  enabled: boolean;
  /** Minimum confidence for a SP to qualify (default 0.85) */
  min_confidence: number;
  /** Minimum qualifying SPs to trigger commit (default 1) */
  min_sentences: number;
  /** Also create a leaf on auto-commit (default false) */
  auto_create_leaf: boolean;
  /** Branch for auto-commits (default 'main') */
  target_branch: string;
}

export const DEFAULT_AUTOPILOT_CONFIG: AutopilotConfig = {
  enabled: false,
  min_confidence: 0.85,
  min_sentences: 1,
  auto_create_leaf: false,
  target_branch: 'main',
};

export interface AutoCommitCandidate {
  id: string;
  text: string;
  confidence: number;
  zone: 'ready' | 'review';
  status: string;
  staged: boolean;
}

export interface AutoCommitPlan {
  should_commit: boolean;
  sentences: Array<{ id: string; text: string; confidence: number }>;
  skipped: Array<{ id: string; reason: string }>;
  reason: string;
}

/**
 * Evaluate whether candidates should be auto-committed.
 *
 * Rules:
 * 1. If autopilot disabled -> no commit
 * 2. Filter: zone === 'ready' && staged === true && status !== 'undone'
 * 3. Check confidence >= min_confidence for each
 * 4. Need at least min_sentences qualifying -> otherwise no commit
 */
export function evaluateAutoCommit(
  candidates: AutoCommitCandidate[],
  config: AutopilotConfig
): AutoCommitPlan {
  if (!config.enabled) {
    return {
      should_commit: false,
      sentences: [],
      skipped: candidates.map((c) => ({
        id: c.id,
        reason: 'autopilot_disabled',
      })),
      reason: 'autopilot_disabled',
    };
  }

  const eligible: Array<{ id: string; text: string; confidence: number }> = [];
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
    if (c.confidence < config.min_confidence) {
      skipped.push({ id: c.id, reason: 'below_confidence_threshold' });
      continue;
    }
    eligible.push({ id: c.id, text: c.text, confidence: c.confidence });
  }

  if (eligible.length < config.min_sentences) {
    return {
      should_commit: false,
      sentences: [],
      skipped: [...skipped, ...eligible.map((e) => ({ id: e.id, reason: 'insufficient_total' }))],
      reason: 'insufficient_sentences',
    };
  }

  return {
    should_commit: true,
    sentences: eligible,
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
    min_confidence: partial.min_confidence ?? DEFAULT_AUTOPILOT_CONFIG.min_confidence,
    min_sentences: partial.min_sentences ?? DEFAULT_AUTOPILOT_CONFIG.min_sentences,
    auto_create_leaf: partial.auto_create_leaf ?? DEFAULT_AUTOPILOT_CONFIG.auto_create_leaf,
    target_branch: partial.target_branch ?? DEFAULT_AUTOPILOT_CONFIG.target_branch,
  };
}
