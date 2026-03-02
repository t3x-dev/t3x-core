/**
 * Adaptive Extraction Thresholds (#11)
 *
 * Auto-calibrates confidence thresholds based on user feedback data.
 * - undo_rate > 15% → raise threshold by 0.05 (too many false positives)
 * - undo_rate < 5%  → lower threshold by 0.02 (can be more aggressive)
 * - between 5-15%   → keep current threshold
 *
 * Requires minimum 10 samples per inference_type to adjust.
 */

const DEFAULT_THRESHOLDS = {
  direct: 0.85,
  paraphrase: 0.80,
  cross_turn: 0.75,
} as const;

const MIN_SAMPLES = 10;
const RAISE_RATE = 0.15;
const LOWER_RATE = 0.05;
const RAISE_STEP = 0.05;
const LOWER_STEP = 0.02;
const MIN_THRESHOLD = 0.50;
const MAX_THRESHOLD = 0.99;

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
  options?: AdaptiveThresholdOptions,
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
