"use strict";
/**
 * @t3x/core
 *
 * T3X Core - Deterministic semantic extraction, diff, and merge engine.
 *
 * This package provides:
 * - Ring 1/2/3 semantic extraction
 * - Semantic diff (two-way and three-way)
 * - Three-way merge with conflict detection
 * - Provider interfaces (NLP, Embedding, LLM)
 *
 * All operations are deterministic and do not depend on LLMs.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMergeEngine = exports.MergeEngine = exports.ConflictType = exports.createDiffEngine = exports.DiffEngine = exports.calculateDiffStats = exports.DiffType = exports.createRingExtractor = exports.RingExtractor = exports.createPolarityRuleEngine = exports.PolarityRuleEngine = exports.createEmptyRingOutput = exports.createEmptyRing3 = exports.createEmptyRing2 = exports.createEmptyRing1 = exports.LLMProviderError = exports.createClaudeProvider = exports.ClaudeProvider = exports.createCachedEmbeddingProvider = exports.CachedEmbeddingProvider = exports.createGoogleAIEmbeddingProvider = exports.GoogleAIEmbeddingProvider = exports.cosineSimilarity = exports.EmbeddingProviderError = exports.normalizeDependencyLabel = exports.normalizePosTag = exports.POS_TAG_MAPPING = exports.NLPProviderError = exports.sha256 = exports.hashText = exports.canonText = void 0;
// Common utilities
var common_1 = require("./common");
Object.defineProperty(exports, "canonText", { enumerable: true, get: function () { return common_1.canonText; } });
Object.defineProperty(exports, "hashText", { enumerable: true, get: function () { return common_1.hashText; } });
Object.defineProperty(exports, "sha256", { enumerable: true, get: function () { return common_1.sha256; } });
// Provider interfaces and implementations
var providers_1 = require("./providers");
Object.defineProperty(exports, "NLPProviderError", { enumerable: true, get: function () { return providers_1.NLPProviderError; } });
Object.defineProperty(exports, "POS_TAG_MAPPING", { enumerable: true, get: function () { return providers_1.POS_TAG_MAPPING; } });
Object.defineProperty(exports, "normalizePosTag", { enumerable: true, get: function () { return providers_1.normalizePosTag; } });
Object.defineProperty(exports, "normalizeDependencyLabel", { enumerable: true, get: function () { return providers_1.normalizeDependencyLabel; } });
Object.defineProperty(exports, "EmbeddingProviderError", { enumerable: true, get: function () { return providers_1.EmbeddingProviderError; } });
Object.defineProperty(exports, "cosineSimilarity", { enumerable: true, get: function () { return providers_1.cosineSimilarity; } });
// Embedding Provider (implementations)
Object.defineProperty(exports, "GoogleAIEmbeddingProvider", { enumerable: true, get: function () { return providers_1.GoogleAIEmbeddingProvider; } });
Object.defineProperty(exports, "createGoogleAIEmbeddingProvider", { enumerable: true, get: function () { return providers_1.createGoogleAIEmbeddingProvider; } });
Object.defineProperty(exports, "CachedEmbeddingProvider", { enumerable: true, get: function () { return providers_1.CachedEmbeddingProvider; } });
Object.defineProperty(exports, "createCachedEmbeddingProvider", { enumerable: true, get: function () { return providers_1.createCachedEmbeddingProvider; } });
// LLM Provider (implementations)
Object.defineProperty(exports, "ClaudeProvider", { enumerable: true, get: function () { return providers_1.ClaudeProvider; } });
Object.defineProperty(exports, "createClaudeProvider", { enumerable: true, get: function () { return providers_1.createClaudeProvider; } });
// LLM Provider (interface)
var llm_1 = require("./llm");
Object.defineProperty(exports, "LLMProviderError", { enumerable: true, get: function () { return llm_1.LLMProviderError; } });
// Extractors (Ring 1/2/3)
var extractors_1 = require("./extractors");
Object.defineProperty(exports, "createEmptyRing1", { enumerable: true, get: function () { return extractors_1.createEmptyRing1; } });
Object.defineProperty(exports, "createEmptyRing2", { enumerable: true, get: function () { return extractors_1.createEmptyRing2; } });
Object.defineProperty(exports, "createEmptyRing3", { enumerable: true, get: function () { return extractors_1.createEmptyRing3; } });
Object.defineProperty(exports, "createEmptyRingOutput", { enumerable: true, get: function () { return extractors_1.createEmptyRingOutput; } });
Object.defineProperty(exports, "PolarityRuleEngine", { enumerable: true, get: function () { return extractors_1.PolarityRuleEngine; } });
Object.defineProperty(exports, "createPolarityRuleEngine", { enumerable: true, get: function () { return extractors_1.createPolarityRuleEngine; } });
Object.defineProperty(exports, "RingExtractor", { enumerable: true, get: function () { return extractors_1.RingExtractor; } });
Object.defineProperty(exports, "createRingExtractor", { enumerable: true, get: function () { return extractors_1.createRingExtractor; } });
// Diff Engine
var diff_1 = require("./diff");
Object.defineProperty(exports, "DiffType", { enumerable: true, get: function () { return diff_1.DiffType; } });
Object.defineProperty(exports, "calculateDiffStats", { enumerable: true, get: function () { return diff_1.calculateDiffStats; } });
Object.defineProperty(exports, "DiffEngine", { enumerable: true, get: function () { return diff_1.DiffEngine; } });
Object.defineProperty(exports, "createDiffEngine", { enumerable: true, get: function () { return diff_1.createDiffEngine; } });
// Merge Engine
var merge_1 = require("./merge");
Object.defineProperty(exports, "ConflictType", { enumerable: true, get: function () { return merge_1.ConflictType; } });
Object.defineProperty(exports, "MergeEngine", { enumerable: true, get: function () { return merge_1.MergeEngine; } });
Object.defineProperty(exports, "createMergeEngine", { enumerable: true, get: function () { return merge_1.createMergeEngine; } });
// Storage (types + pure utils only)
// For CRUD operations, use @t3x/storage package
__exportStar(require("./storage"), exports);
//# sourceMappingURL=index.js.map