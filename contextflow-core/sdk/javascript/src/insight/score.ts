import { getRoleWeight } from "./roleWeights";

export interface ScoreComponents {
  cosine?: number;
  bm25?: number;
  recency?: number;
  role?: string;
}

export interface ScoreWeights {
  cosine: number;
  bm25: number;
  recency: number;
  role: number;
}

export const defaultScoreWeights: ScoreWeights = {
  cosine: 0.6,
  bm25: 0.2,
  recency: 0.1,
  role: 0.1,
};

export function combineScore(
  components: ScoreComponents,
  weights: ScoreWeights = defaultScoreWeights,
): number {
  const normalizedWeights = normalizeWeights(weights);
  const cosine = clamp01(normalizeCosine(components.cosine ?? 0));
  const bm25 = clamp01(components.bm25 ?? 0);
  const recency = clamp01(components.recency ?? 0);
  const roleWeight = clamp01(getRoleWeight(components.role));

  const score =
    cosine * normalizedWeights.cosine +
    bm25 * normalizedWeights.bm25 +
    recency * normalizedWeights.recency +
    roleWeight * normalizedWeights.role;

  return clamp01(score);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function normalizeCosine(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return (value + 1) / 2; // map [-1,1] → [0,1]
}

function normalizeWeights(weights: ScoreWeights): ScoreWeights {
  const total = weights.cosine + weights.bm25 + weights.recency + weights.role;
  if (total <= 0) {
    return { ...defaultScoreWeights };
  }
  return {
    cosine: weights.cosine / total,
    bm25: weights.bm25 / total,
    recency: weights.recency / total,
    role: weights.role / total,
  };
}
