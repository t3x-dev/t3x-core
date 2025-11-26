"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bm25_1 = require("../../insight/bm25");
describe("scoreBm25", () => {
    it("returns zero when query tokens are absent", () => {
        const score = (0, bm25_1.scoreBm25)(["osaka"], ["tokyo", "food"]);
        expect(score).toBe(0);
    });
    it("assigns higher score for matching terms", () => {
        const tokens = ["osaka", "street", "food", "budget"];
        const score = (0, bm25_1.scoreBm25)(["osaka", "food"], tokens, {
            documentFrequency: { osaka: 2, food: 4 },
            totalDocuments: 10,
            averageDocumentLength: 6,
        });
        expect(score).toBeGreaterThan(0);
    });
    it("penalizes longer documents via length normalization", () => {
        const query = ["osaka"];
        const shortDoc = ["osaka"];
        const longDoc = ["osaka", ...Array.from({ length: 99 }, (_, i) => `token-${i}`)];
        const shortScore = (0, bm25_1.scoreBm25)(query, shortDoc, {
            documentFrequency: { osaka: 5 },
            totalDocuments: 50,
            averageDocumentLength: 20,
        });
        const longScore = (0, bm25_1.scoreBm25)(query, longDoc, {
            documentFrequency: { osaka: 5 },
            totalDocuments: 50,
            averageDocumentLength: 20,
        });
        expect(shortScore).toBeGreaterThan(longScore);
    });
});
