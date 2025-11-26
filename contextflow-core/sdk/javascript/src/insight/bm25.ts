/**
 * Deterministic BM25 helpers for the insight engine.
 */

export interface Bm25Config {
  k1: number;
  b: number;
}

export interface Bm25Stats {
  documentFrequency?: Record<string, number>;
  totalDocuments?: number;
  averageDocumentLength?: number;
}

export const defaultBm25Config: Bm25Config = { k1: 1.2, b: 0.75 };

export function scoreBm25(
  queryTokens: string[],
  documentTokens: string[],
  stats: Bm25Stats = {},
  config: Bm25Config = defaultBm25Config,
): number {
  if (queryTokens.length === 0 || documentTokens.length === 0) {
    return 0;
  }

  const uniqueQueryTokens = Array.from(
    new Set(queryTokens.map(token => token.trim()).filter(token => token.length > 0)),
  );
  if (uniqueQueryTokens.length === 0) {
    return 0;
  }

  const docLen = documentTokens.length;
  if (docLen === 0) {
    return 0;
  }

  const { documentFrequency = {}, totalDocuments = 1, averageDocumentLength = docLen } = stats;
  const { k1, b } = config;
  const avgDocLength = averageDocumentLength <= 0 ? docLen : averageDocumentLength;

  let score = 0;
  for (const token of uniqueQueryTokens) {
    const tf = termFrequency(token, documentTokens);
    if (tf === 0) continue;

    const dfRaw = documentFrequency[token] ?? (tf > 0 ? 1 : 0);
    const df = clamp(dfRaw, 1, Math.max(totalDocuments, 1));
    const idf = inverseDocumentFrequency(df, totalDocuments);

    const numerator = tf * (k1 + 1);
    const denominator = tf + k1 * (1 - b + b * (docLen / avgDocLength));
    const termScore = idf * (numerator / denominator);
    score += termScore;
  }

  return Number.isFinite(score) ? score : 0;
}

function termFrequency(token: string, tokens: string[]): number {
  let count = 0;
  for (const t of tokens) {
    if (t === token) count += 1;
  }
  return count;
}

function inverseDocumentFrequency(df: number, totalDocuments: number): number {
  const N = Math.max(totalDocuments, 1);
  const dfClamped = clamp(df, 1, N);
  const numerator = N - dfClamped + 0.5;
  const denominator = dfClamped + 0.5;
  if (denominator === 0) return 0;

  const ratio = numerator / denominator;
  const value = Math.log(ratio + 1);
  return value > 0 ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

