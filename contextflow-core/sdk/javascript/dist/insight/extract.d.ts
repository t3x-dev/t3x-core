/**
 * Deterministic extractors for the insight engine.
 * Each extractor inspects a single turn and emits zero or more findings.
 */
export interface ExtractedItem {
    text: string;
    kind: string;
    turnId: string;
    score?: number;
    meta?: Record<string, unknown>;
}
export interface ExtractorInput {
    turnId: string;
    text: string;
    role?: string;
    timestamp?: string;
}
export interface Extractor {
    id: string;
    run(input: ExtractorInput): ExtractedItem[];
}
export declare const extractors: Extractor[];
export declare function runExtractors(turn: {
    id: string;
    text: string;
    role?: string;
    timestamp?: string;
}): ExtractedItem[];
