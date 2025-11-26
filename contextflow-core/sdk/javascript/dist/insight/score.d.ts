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
export declare const defaultScoreWeights: ScoreWeights;
export declare function combineScore(components: ScoreComponents, weights?: ScoreWeights): number;
