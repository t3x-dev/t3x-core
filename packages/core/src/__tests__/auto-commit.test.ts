import { describe, expect, it } from 'vitest';
import {
  type AdaptiveFeedbackStats,
  type AutoCommitCandidate,
  type AutopilotConfig,
  computeAdaptiveConfig,
  DEFAULT_AUTOPILOT_CONFIG,
  evaluateAutoCommit,
  mergeAutopilotConfig,
} from '../autopilot';

/** Helper to create a candidate with sensible defaults. */
const makeCandidate = (
  overrides: Partial<AutoCommitCandidate> & { id: string }
): AutoCommitCandidate => ({
  text: `node ${overrides.id}`,
  zone: 'ready',
  status: 'active',
  staged: true,
  ...overrides,
});

/** Enabled config with defaults. */
const enabledConfig: AutopilotConfig = {
  ...DEFAULT_AUTOPILOT_CONFIG,
  enabled: true,
};

describe('evaluateAutoCommit', () => {
  it('returns should_commit=false when autopilot disabled', () => {
    const candidates = [makeCandidate({ id: 's_1' }), makeCandidate({ id: 's_2' })];
    const plan = evaluateAutoCommit(candidates, {
      ...DEFAULT_AUTOPILOT_CONFIG,
      enabled: false,
    });

    expect(plan.should_commit).toBe(false);
    expect(plan.reason).toBe('autopilot_disabled');
    expect(plan.nodes).toHaveLength(0);
    expect(plan.skipped).toHaveLength(2);
    for (const s of plan.skipped) {
      expect(s.reason).toBe('autopilot_disabled');
    }
  });

  it('filters out review-zone candidates', () => {
    const candidates = [
      makeCandidate({ id: 's_1', zone: 'review' }),
      makeCandidate({ id: 's_2', zone: 'ready' }),
    ];
    const plan = evaluateAutoCommit(candidates, enabledConfig);

    expect(plan.should_commit).toBe(true);
    expect(plan.nodes).toHaveLength(1);
    expect(plan.nodes[0].id).toBe('s_2');
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0]).toEqual({ id: 's_1', reason: 'not_in_ready_zone' });
  });

  it('filters out undone candidates', () => {
    const candidates = [
      makeCandidate({ id: 's_1', status: 'undone' }),
      makeCandidate({ id: 's_2' }),
    ];
    const plan = evaluateAutoCommit(candidates, enabledConfig);

    expect(plan.should_commit).toBe(true);
    expect(plan.nodes).toHaveLength(1);
    expect(plan.nodes[0].id).toBe('s_2');
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0]).toEqual({ id: 's_1', reason: 'undone' });
  });

  it('filters out unstaged candidates', () => {
    const candidates = [makeCandidate({ id: 's_1', staged: false }), makeCandidate({ id: 's_2' })];
    const plan = evaluateAutoCommit(candidates, enabledConfig);

    expect(plan.should_commit).toBe(true);
    expect(plan.nodes).toHaveLength(1);
    expect(plan.nodes[0].id).toBe('s_2');
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0]).toEqual({ id: 's_1', reason: 'not_staged' });
  });

  it('returns should_commit=true when enough qualifying nodes', () => {
    const candidates = [makeCandidate({ id: 's_1' }), makeCandidate({ id: 's_2' })];
    const plan = evaluateAutoCommit(candidates, enabledConfig);

    expect(plan.should_commit).toBe(true);
    expect(plan.reason).toBe('auto_commit_ready');
    expect(plan.nodes).toHaveLength(2);
    expect(plan.skipped).toHaveLength(0);
  });

  it('returns should_commit=false when insufficient nodes', () => {
    const candidates = [makeCandidate({ id: 's_1' })];
    const config: AutopilotConfig = {
      ...enabledConfig,
      min_nodes: 3,
    };
    const plan = evaluateAutoCommit(candidates, config);

    expect(plan.should_commit).toBe(false);
    expect(plan.reason).toBe('insufficient_nodes');
    // The single eligible candidate should appear in skipped with 'insufficient_total'
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0]).toEqual({ id: 's_1', reason: 'insufficient_total' });
  });

  it('returns all qualifying nodes in plan', () => {
    const candidates = [
      makeCandidate({ id: 's_1', text: 'alpha' }),
      makeCandidate({ id: 's_2', text: 'beta' }),
      makeCandidate({ id: 's_3', text: 'gamma' }),
    ];
    const plan = evaluateAutoCommit(candidates, enabledConfig);

    expect(plan.should_commit).toBe(true);
    expect(plan.nodes).toHaveLength(3);
    expect(plan.nodes).toEqual([
      { id: 's_1', text: 'alpha' },
      { id: 's_2', text: 'beta' },
      { id: 's_3', text: 'gamma' },
    ]);
  });

  it('handles empty candidates array', () => {
    const plan = evaluateAutoCommit([], enabledConfig);

    expect(plan.should_commit).toBe(false);
    expect(plan.reason).toBe('insufficient_nodes');
    expect(plan.nodes).toHaveLength(0);
    expect(plan.skipped).toHaveLength(0);
  });

  it('handles mixed candidates (some ready, some review, some unstaged)', () => {
    const candidates = [
      makeCandidate({ id: 's_1', zone: 'ready' }), // eligible
      makeCandidate({ id: 's_2', zone: 'review' }), // skipped: not_in_ready_zone
      makeCandidate({ id: 's_3', zone: 'ready', staged: false }), // skipped: not_staged
      makeCandidate({ id: 's_4', zone: 'ready', status: 'undone' }), // skipped: undone
      makeCandidate({ id: 's_5', zone: 'ready' }), // eligible
    ];
    const plan = evaluateAutoCommit(candidates, enabledConfig);

    expect(plan.should_commit).toBe(true);
    expect(plan.reason).toBe('auto_commit_ready');
    expect(plan.nodes).toHaveLength(2);
    expect(plan.nodes.map((s) => s.id)).toEqual(['s_1', 's_5']);
    expect(plan.skipped).toHaveLength(3);
    expect(plan.skipped.map((s) => s.id).sort()).toEqual(['s_2', 's_3', 's_4']);
  });
});

describe('mergeAutopilotConfig', () => {
  it('returns defaults for undefined input', () => {
    const result = mergeAutopilotConfig(undefined);
    expect(result).toEqual(DEFAULT_AUTOPILOT_CONFIG);
  });

  it('returns defaults for empty object', () => {
    const result = mergeAutopilotConfig({});
    expect(result).toEqual(DEFAULT_AUTOPILOT_CONFIG);
  });

  it('overrides specific fields while keeping defaults for others', () => {
    const result = mergeAutopilotConfig({
      enabled: true,
    });
    expect(result).toEqual({
      enabled: true,
      min_nodes: 1,
      auto_create_leaf: false,
      target_branch: 'main',
    });
  });

  it('overrides all fields when all provided', () => {
    const full: AutopilotConfig = {
      enabled: true,
      min_nodes: 5,
      auto_create_leaf: true,
      target_branch: 'develop',
    };
    const result = mergeAutopilotConfig(full);
    expect(result).toEqual(full);
  });
});

describe('computeAdaptiveConfig', () => {
  it('suppresses inference types with low accept rate and enough judged samples', () => {
    const stats: AdaptiveFeedbackStats = {
      byInferenceType: {
        direct: { total: 25, accepted: 8, edited: 5, rejected: 12 },
        paraphrase: { total: 20, accepted: 12, edited: 3, rejected: 5 },
        summary: { total: 19, accepted: 0, edited: 0, rejected: 19 },
      },
      overall: {
        total: 64,
        acceptRate: 20 / 64,
        editRate: 8 / 64,
        rejectRate: 36 / 64,
      },
    };

    expect(computeAdaptiveConfig(stats)).toEqual({
      suppressedTypes: ['direct'],
      cosineThresholdDelta: 0,
    });
  });

  it('ignores undo-inflated type totals and uses judged samples for suppression', () => {
    const stats: AdaptiveFeedbackStats = {
      byInferenceType: {
        direct: { total: 30, accepted: 4, edited: 2, rejected: 10 },
      },
      overall: {
        total: 16,
        acceptRate: 4 / 16,
        editRate: 2 / 16,
        rejectRate: 10 / 16,
      },
    };

    expect(computeAdaptiveConfig(stats)).toEqual({
      suppressedTypes: [],
      cosineThresholdDelta: 0,
    });
  });

  it('suggests a lower cosine threshold when edit rate is above 30 percent', () => {
    const stats: AdaptiveFeedbackStats = {
      byInferenceType: {},
      overall: {
        total: 20,
        acceptRate: 0.45,
        editRate: 0.35,
        rejectRate: 0.2,
      },
    };

    expect(computeAdaptiveConfig(stats)).toEqual({
      suppressedTypes: [],
      cosineThresholdDelta: -0.02,
    });
  });
});
