import { env, pipeline } from "@xenova/transformers";
import type { EmbeddingModel } from "./embeddings";

env.cacheDir = process.env.TRANSFORMERS_CACHE ?? ".cache/transformers";
if (process.env.TRANSFORMERS_LOCAL_PATH) {
  env.localModelPath = process.env.TRANSFORMERS_LOCAL_PATH;
}

type FeatureExtractionPipelineResult =
  | { data: ArrayLike<number> }
  | ArrayLike<number>;

type FeatureExtractionPipeline = (
  text: string,
  options?: { pooling?: "mean" | "cls"; normalize?: boolean },
) => Promise<FeatureExtractionPipelineResult>;

export class MiniLmxEnovaModel implements EmbeddingModel {
  readonly id: string;
  private readonly pipelinePromise: Promise<FeatureExtractionPipeline>;

  constructor(modelName = "Xenova/all-MiniLM-L6-v2", options: { quantized?: boolean } = {}) {
    this.id = `${modelName}@xenova`;
    this.pipelinePromise = pipeline("feature-extraction", modelName, {
      quantized: options.quantized ?? true,
    }) as Promise<FeatureExtractionPipeline>;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const embedder = await this.pipelinePromise;
    return Promise.all(
      texts.map(async text => {
        const result = await embedder(text, { pooling: "mean", normalize: true });
        const data = extractArrayLike(result);
        return Array.from(data);
      }),
    );
  }
}

function extractArrayLike(result: FeatureExtractionPipelineResult): ArrayLike<number> {
  if (Array.isArray(result)) {
    return result;
  }
  if (result && typeof result === "object") {
    const data = (result as { data?: ArrayLike<number> }).data;
    if (data) {
      return data;
    }
  }
  return [];
}
