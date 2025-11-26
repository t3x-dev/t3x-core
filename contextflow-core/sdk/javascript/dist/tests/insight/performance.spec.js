"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const perf_hooks_1 = require("perf_hooks");
const engine_1 = require("../../insight/engine");
const goldDataset_1 = require("./__fixtures__/goldDataset");
globals_1.jest.mock("../../insight/models/minilm_xenova", () => ({
    __esModule: true,
    MiniLmxEnovaModel: class MockMiniLM {
        constructor() {
            this.id = "mock-minilm@local";
        }
        async embed(texts) {
            return texts.map(text => Array.from({ length: 6 }, (_, idx) => (text.length % 13) / (idx + 1)));
        }
    },
}));
describe("Insight engine performance baseline", () => {
    it("processes conversations within the baseline threshold", async () => {
        const iterations = 15;
        const dataset = goldDataset_1.goldConversations;
        const start = perf_hooks_1.performance.now();
        for (let i = 0; i < iterations; i++) {
            const conversation = dataset[i % dataset.length];
            await (0, engine_1.runAspectsEngine)(conversation.turns, {
                referenceTimestamp: "2025-12-31T00:00:00Z",
            });
        }
        const durationMs = perf_hooks_1.performance.now() - start;
        const avgPerRun = durationMs / iterations;
        // eslint-disable-next-line no-console
        console.info(`[Insight baseline] avg ${avgPerRun.toFixed(2)}ms per run over ${iterations} iterations`);
        expect(avgPerRun).toBeLessThan(150);
    });
});
