"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const draft_1 = require("../../insight/draft");
describe("renderBullets", () => {
    it("summarizes findings into concise bullet", () => {
        const bullets = (0, draft_1.renderBullets)([
            {
                aspectId: "aspect-1",
                title: "旅行预算",
                findings: ["预算不超过 2000 美元", "另外备注"],
                confidence: 0.82,
            },
        ]);
        expect(bullets[0]).toContain("旅行预算");
        expect(bullets[0]).toContain("(82%)");
        expect(bullets[0]).toContain("预算不超过 2000 美元");
    });
    it("indicates missing evidence when findings empty", () => {
        const bullets = (0, draft_1.renderBullets)([
            {
                aspectId: "aspect-2",
                title: "出发时间",
                findings: [],
                confidence: 0.4,
            },
        ]);
        expect(bullets[0]).toContain("缺少佐证");
    });
});
