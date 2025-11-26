import type { EmbeddingModel } from "./embeddings";
export declare class MiniLmxEnovaModel implements EmbeddingModel {
    readonly id: string;
    private readonly pipelinePromise;
    constructor(modelName?: string, options?: {
        quantized?: boolean;
    });
    embed(texts: string[]): Promise<number[][]>;
}
