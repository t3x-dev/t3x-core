"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const label_1 = require("../../insight/label");
describe("createLabel", () => {
    it("prefers entity as label prefix", () => {
        const title = (0, label_1.createLabel)({
            tokens: ["travel", "plan", "tokyo"],
            entities: ["东京", "日本"],
        }, 40);
        expect(title.startsWith("东京")).toBe(true);
    });
    it("falls back to top-scored tokens when no entity", () => {
        const title = (0, label_1.createLabel)({
            tokens: ["budget", "plan", "and", "trip"],
        }, 40);
        expect(title).toBe("budget · plan · trip");
    });
    it("truncates overly long labels with ellipsis", () => {
        const title = (0, label_1.createLabel)({
            tokens: ["supercalifragilisticexpialidocious", "longword", "example"],
        }, 10);
        expect(title.endsWith("…")).toBe(true);
    });
});
