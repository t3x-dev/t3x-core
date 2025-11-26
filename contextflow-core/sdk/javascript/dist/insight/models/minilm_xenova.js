"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MiniLmxEnovaModel = void 0;
const transformers_1 = require("@xenova/transformers");
transformers_1.env.cacheDir = process.env.TRANSFORMERS_CACHE ?? ".cache/transformers";
if (process.env.TRANSFORMERS_LOCAL_PATH) {
    transformers_1.env.localModelPath = process.env.TRANSFORMERS_LOCAL_PATH;
}
class MiniLmxEnovaModel {
    constructor(modelName = "Xenova/all-MiniLM-L6-v2", options = {}) {
        this.id = `${modelName}@xenova`;
        this.pipelinePromise = (0, transformers_1.pipeline)("feature-extraction", modelName, {
            quantized: options.quantized ?? true,
        });
    }
    async embed(texts) {
        if (texts.length === 0) {
            return [];
        }
        const embedder = await this.pipelinePromise;
        return Promise.all(texts.map(async (text) => {
            const result = await embedder(text, { pooling: "mean", normalize: true });
            const data = extractArrayLike(result);
            return Array.from(data);
        }));
    }
}
exports.MiniLmxEnovaModel = MiniLmxEnovaModel;
function extractArrayLike(result) {
    if (Array.isArray(result)) {
        return result;
    }
    if (result && typeof result === "object") {
        const data = result.data;
        if (data) {
            return data;
        }
    }
    return [];
}
