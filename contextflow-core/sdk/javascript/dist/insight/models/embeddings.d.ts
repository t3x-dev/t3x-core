export interface EmbeddingModel {
    readonly id: string;
    embed(texts: string[]): Promise<number[][]>;
}
export interface EmbeddingRequest {
    text: string;
}
export type EmbeddingResponse = number[];
