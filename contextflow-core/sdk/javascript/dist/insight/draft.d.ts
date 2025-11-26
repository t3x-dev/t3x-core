/**
 * Draft summary bullet generator.
 */
export interface AspectSummary {
    aspectId: string;
    title: string;
    findings: string[];
    confidence: number;
}
export declare function renderBullets(aspects: AspectSummary[]): string[];
