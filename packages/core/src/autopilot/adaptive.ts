export interface AdaptiveFeedbackTypeStats {
  total: number;
  accepted: number;
  edited: number;
  rejected: number;
}

export interface AdaptiveFeedbackStats {
  byInferenceType: Record<string, AdaptiveFeedbackTypeStats>;
  overall: {
    total: number;
    acceptRate: number;
    editRate: number;
    rejectRate: number;
  };
}

export interface AdaptiveConfig {
  suppressedTypes: string[];
  cosineThresholdDelta: number;
}

const MIN_SUPPRESSION_SAMPLE_COUNT = 20;
const MIN_ACCEPT_RATE = 0.5;
const EDIT_RATE_THRESHOLD = 0.3;
const COSINE_THRESHOLD_DELTA = -0.02;

function getJudgedSampleCount(stats: AdaptiveFeedbackTypeStats): number {
  const judged = stats.accepted + stats.edited + stats.rejected;
  return judged > 0 ? judged : stats.total;
}

export function computeAdaptiveConfig(stats: AdaptiveFeedbackStats): AdaptiveConfig {
  const suppressedTypes = Object.entries(stats.byInferenceType)
    .filter(([, typeStats]) => {
      const sampleCount = getJudgedSampleCount(typeStats);
      if (sampleCount < MIN_SUPPRESSION_SAMPLE_COUNT) {
        return false;
      }

      return typeStats.accepted / sampleCount < MIN_ACCEPT_RATE;
    })
    .map(([type]) => type)
    .sort();

  return {
    suppressedTypes,
    cosineThresholdDelta: stats.overall.editRate > EDIT_RATE_THRESHOLD ? COSINE_THRESHOLD_DELTA : 0,
  };
}
