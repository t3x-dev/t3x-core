"use strict";
/**
 * Text canonicalization utilities
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonText = canonText;
function canonText(s) {
    return s.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');
}
//# sourceMappingURL=canon.js.map