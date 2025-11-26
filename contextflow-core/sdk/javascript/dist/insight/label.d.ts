/**
 * Deterministic aspect labeling using entity prioritization and token salience.
 */
export interface LabelInput {
    tokens: string[];
    entities?: string[];
}
export declare function createLabel(input: LabelInput, maxLength?: number): string;
