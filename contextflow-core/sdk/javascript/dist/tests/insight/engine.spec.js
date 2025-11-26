"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const engine_1 = require("../../insight/engine");
globals_1.jest.mock("../../insight/models/minilm_xenova", () => ({
    __esModule: true,
    MiniLmxEnovaModel: class MockMiniLM {
        constructor() {
            this.id = "mock-minilm@local";
        }
        async embed(texts) {
            return texts.map(text => Array.from({ length: 4 }, (_, idx) => (text.length % 10) / (idx + 1)));
        }
    },
}));
describe("runAspectsEngine", () => {
    it("produces aspects with confidence scores for matching turns", async () => {
        const turns = [
            {
                id: "turn-1",
                text: "Trip idea: 我想去大阪吃夜市美食。",
                role: "user",
                timestamp: "2025-03-10T12:00:00Z",
            },
            {
                id: "turn-2",
                text: "预算不超过1800美元，时间是3月12号到3月16号。",
                role: "user",
                timestamp: "2025-03-10T12:05:00Z",
            },
        ];
        const aspects = await (0, engine_1.runAspectsEngine)(turns, { referenceTimestamp: "2025-03-20T00:00:00Z" });
        expect(aspects.length).toBeGreaterThan(0);
        const amountAspect = aspects.find(aspect => aspect.findings.some(finding => finding.kind === "amount"));
        if (!amountAspect) {
            throw new Error(`Amount aspect missing. Aspects: ${JSON.stringify(aspects, null, 2)}`);
        }
        expect(amountAspect.confidence).toBeGreaterThan(0);
        const summary = Array.isArray(amountAspect.meta?.summary)
            ? amountAspect.meta.summary
            : [];
        expect(summary[0] ?? "").toContain("Trip · idea");
    });
});
