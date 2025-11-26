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
export declare const defaultBm25Config: Bm25Config;
export declare function scoreBm25(queryTokens: string[], documentTokens: string[], stats?: Bm25Stats, config?: Bm25Config): number;
