"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const score_1 = require("../../insight/score");
describe("combineScore", () => {
    it("clamps combined score to [0,1]", () => {
        const score = (0, score_1.combineScore)({ cosine: 10, bm25: 10, recency: 10, role: "user" });
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
    });
    it("reflects role weighting", () => {
        const userScore = (0, score_1.combineScore)({ cosine: 0.5, bm25: 0.5, recency: 0.5, role: "user" });
        const assistantScore = (0, score_1.combineScore)({ cosine: 0.5, bm25: 0.5, recency: 0.5, role: "assistant" });
        expect(userScore).toBeGreaterThan(assistantScore);
    });
    it("honors custom weights when provided", () => {
        const weights = { ...score_1.defaultScoreWeights, role: 0 };
        const score = (0, score_1.combineScore)({ cosine: 0.8, bm25: 0.6, recency: 0.4, role: "assistant" }, weights);
        const roleLessScore = (0, score_1.combineScore)({ cosine: 0.8, bm25: 0.6, recency: 0.4 }, weights);
        expect(score).toBeCloseTo(roleLessScore, 5);
    });
});
