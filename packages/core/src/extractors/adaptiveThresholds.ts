/**
 * Adaptive Extraction Thresholds (#11)
 *
 * Auto-calibrates extraction behavior based on user feedback data.
 *
 * Two APIs:
 * 1. computeAdaptiveThresholds (legacy): undo-rate based threshold adjustment
 *    - undo_rate > 15% → raise threshold by 0.05 (too many false positives)
 *    - undo_rate < 5%  → lower threshold by 0.02 (can be more aggressive)
 *    - between 5-15%   → keep current threshold
 *
 * 2. computeAdaptiveConfig (new): accept-rate based extraction configuration
 *    - accept_rate < 50% with >= 20 samples → suppress the inference type
 *    - overall edit_rate > 30% → suggest lowering cosine threshold by 0.02
 *
 * Requires minimum samples per inference_type to adjust.
 */

const DEFAULT_THRESHOLDS = {
  direct: 0.85,
  paraphrase: 0.8,
  cross_turn: 0.75,
} as const;

const MIN_SAMPLES = 10;
const RAISE_RATE = 0.15;
const LOWER_RATE = 0.05;
const RAISE_STEP = 0.05;
const LOWER_STEP = 0.02;
const MIN_THRESHOLD = 0.5;
const MAX_THRESHOLD = 0.99;

/** Minimum samples for adaptive config rules */
const ADAPTIVE_MIN_SAMPLES = 20;
/** Below this accept rate with enough samples → suppress the type */
const SUPPRESS_ACCEPT_RATE = 0.5;
/** Above this overall edit rate → suggest lowering cosine threshold */
const HIGH_EDIT_RATE = 0.3;
/** How much to lower cosine threshold when edit rate is high */
const COSINE_THRESHOLD_ADJUSTMENT = -0.02;

type InferenceType = keyof typeof DEFAULT_THRESHOLDS;

export interface FeedbackStats {
  total: number;
  by_action: Record<string, number>;
  by_inference_type: Record<string, Record<string, number>>;
}

export interface AdaptiveThresholdOptions {
  defaults?: Record<InferenceType, number>;
}

export interface AdaptiveThresholds {
  direct: number;
  paraphrase: number;
  cross_turn: number;
}

export function computeAdaptiveThresholds(
  stats: FeedbackStats,
  options?: AdaptiveThresholdOptions
): AdaptiveThresholds {
  const defaults = options?.defaults ?? DEFAULT_THRESHOLDS;

  const result: AdaptiveThresholds = { ...defaults };

  for (const type of Object.keys(defaults) as InferenceType[]) {
    const typeStats = stats.by_inference_type[type];
    if (!typeStats) continue;

    const total = Object.values(typeStats).reduce((sum, n) => sum + n, 0);
    if (total < MIN_SAMPLES) continue;

    const undoCount = typeStats.undo ?? 0;
    const undoRate = undoCount / total;

    let threshold = defaults[type];
    if (undoRate > RAISE_RATE) {
      threshold += RAISE_STEP;
    } else if (undoRate < LOWER_RATE) {
      threshold -= LOWER_STEP;
    }

    result[type] = Math.max(MIN_THRESHOLD, Math.min(MAX_THRESHOLD, threshold));
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Adaptive Config (accept-rate based extraction configuration)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Input format for computeAdaptiveConfig — uses the AdaptiveFeedbackStats
 * shape returned by the storage layer.
 */
export interface AdaptiveFeedbackStats {
  byInferenceType: Record<
    string,
    { total: number; accepted: number; edited: number; rejected: number }
  >;
  overall: { total: number; acceptRate: number; editRate: number; rejectRate: number };
}

export interface AdaptiveConfig {
  /** Whether to suppress a specific inference type in prompts */
  suppressedTypes: string[];
  /** Recommended cosine threshold adjustment */
  cosineThresholdDelta: number;
}

/**
 * Compute adaptive extraction configuration from feedback stats.
 *
 * Rules:
 * - If an inference_type has <50% accept rate with >= 20 samples → suppress it
 * - If overall edit rate >30% → suggest lowering cosine threshold by 0.02
 */
export function computeAdaptiveConfig(stats: AdaptiveFeedbackStats): AdaptiveConfig {
  const suppressedTypes: string[] = [];
  let cosineThresholdDelta = 0;

  for (const [inferenceType, typeStats] of Object.entries(stats.byInferenceType)) {
    if (typeStats.total < ADAPTIVE_MIN_SAMPLES) continue;

    const acceptRate = typeStats.accepted / typeStats.total;

    if (acceptRate < SUPPRESS_ACCEPT_RATE) {
      // Very low accept rate → suppress this inference type entirely
      suppressedTypes.push(inferenceType);
    }
  }

  // If overall edit rate is high, suggest lowering cosine threshold
  if (stats.overall.total >= ADAPTIVE_MIN_SAMPLES && stats.overall.editRate > HIGH_EDIT_RATE) {
    cosineThresholdDelta = COSINE_THRESHOLD_ADJUSTMENT;
  }

  return { suppressedTypes, cosineThresholdDelta };
}
