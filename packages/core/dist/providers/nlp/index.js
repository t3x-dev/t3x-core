"use strict";
/**
 * NLP Provider exports
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleCloudNLPProvider = exports.createGoogleCloudNLPProvider = exports.POS_TAG_MAPPING = exports.normalizePosTag = exports.normalizeDependencyLabel = exports.NLPProviderError = void 0;
var base_1 = require("./base");
Object.defineProperty(exports, "NLPProviderError", { enumerable: true, get: function () { return base_1.NLPProviderError; } });
Object.defineProperty(exports, "normalizeDependencyLabel", { enumerable: true, get: function () { return base_1.normalizeDependencyLabel; } });
Object.defineProperty(exports, "normalizePosTag", { enumerable: true, get: function () { return base_1.normalizePosTag; } });
Object.defineProperty(exports, "POS_TAG_MAPPING", { enumerable: true, get: function () { return base_1.POS_TAG_MAPPING; } });
var google_cloud_1 = require("./google-cloud");
Object.defineProperty(exports, "createGoogleCloudNLPProvider", { enumerable: true, get: function () { return google_cloud_1.createGoogleCloudNLPProvider; } });
Object.defineProperty(exports, "GoogleCloudNLPProvider", { enumerable: true, get: function () { return google_cloud_1.GoogleCloudNLPProvider; } });
//# sourceMappingURL=index.js.map