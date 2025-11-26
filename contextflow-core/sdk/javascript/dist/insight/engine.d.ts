import { ExtractedItem } from "./extract";
export interface Turn {
    id: string;
    text: string;
    role?: string;
    timestamp?: string;
}
export interface Aspect {
    id: string;
    title: string;
    findings: ExtractedItem[];
    confidence: number;
    meta?: Record<string, unknown>;
}
export interface AspectsEngineOptions {
    goal?: string;
    model?: string;
    pin?: string;
    referenceTimestamp?: Date | string;
    embeddingModelName?: string;
    clusterThreshold?: number;
}
export declare function runAspectsEngine(turns: Turn[], options?: AspectsEngineOptions): Promise<Aspect[]>;
