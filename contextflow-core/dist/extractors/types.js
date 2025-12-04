"use strict";
/**
 * Ring Data Types
 *
 * TypeScript interfaces that STRICTLY match docs/specification/ring-schema.md
 * DO NOT add fields not defined in the specification.
 *
 * @see docs/specification/ring-schema.md
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEmptyRing1 = createEmptyRing1;
exports.createEmptyRing2 = createEmptyRing2;
exports.createEmptyRing3 = createEmptyRing3;
exports.createEmptyRingOutput = createEmptyRingOutput;
/**
 * Create an empty Ring 1 output
 */
function createEmptyRing1() {
    return {
        keywords: [],
        timeAnchor: null,
        topic: null,
        preferenceKeywords: [],
    };
}
/**
 * Create an empty Ring 2 output
 */
function createEmptyRing2() {
    return {
        facets: [],
    };
}
/**
 * Create an empty Ring 3 output
 */
function createEmptyRing3() {
    return {
        segments: [],
    };
}
/**
 * Create an empty Ring output
 */
function createEmptyRingOutput(turnId) {
    return {
        turnId,
        ring1: createEmptyRing1(),
        ring2: createEmptyRing2(),
        ring3: createEmptyRing3(),
    };
}
//# sourceMappingURL=types.js.map