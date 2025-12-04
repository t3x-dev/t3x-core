"use strict";
/**
 * Common utilities
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sha256 = exports.hashText = exports.canonText = void 0;
var canon_1 = require("./canon");
Object.defineProperty(exports, "canonText", { enumerable: true, get: function () { return canon_1.canonText; } });
var hash_1 = require("./hash");
Object.defineProperty(exports, "hashText", { enumerable: true, get: function () { return hash_1.hashText; } });
Object.defineProperty(exports, "sha256", { enumerable: true, get: function () { return hash_1.sha256; } });
//# sourceMappingURL=index.js.map