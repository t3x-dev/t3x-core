"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const extract_1 = require("../../insight/extract");
describe("structural extractors", () => {
    it("detects headings, list items, blocks, and quotes", () => {
        const turn = {
            id: "turn-struct",
            text: [
                "## 预算与行程",
                "- 不超过 1800 美元",
                "- 行程保持 3 天",
                "> \"大阪夜生活很棒\"",
                "",
                "第一段描述大阪夜市美食。",
                "",
                "第二段强调靠近地铁。",
            ].join("\n"),
        };
        const findings = (0, extract_1.runExtractors)(turn);
        const kinds = findings.reduce((acc, item) => {
            acc[item.kind] = (acc[item.kind] ?? 0) + 1;
            return acc;
        }, {});
        expect(kinds.heading).toBeGreaterThanOrEqual(1);
        expect(kinds.list_item).toBeGreaterThanOrEqual(2);
        expect(kinds.block).toBeGreaterThanOrEqual(2);
        expect(kinds.quote).toBeGreaterThanOrEqual(1);
    });
});
