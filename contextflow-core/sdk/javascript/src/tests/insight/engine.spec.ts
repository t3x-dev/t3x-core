import { jest } from "@jest/globals";
import { runAspectsEngine } from "../../insight/engine";
import { MiniLmxEnovaModel } from "../../insight/models/minilm_xenova";

jest.mock("../../insight/models/minilm_xenova", () => ({
  __esModule: true,
  MiniLmxEnovaModel: class MockMiniLM {
    readonly id = "mock-minilm@local";
    async embed(texts: string[]): Promise<number[][]> {
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
        role: "user" as const,
        timestamp: "2025-03-10T12:00:00Z",
      },
      {
        id: "turn-2",
        text: "预算不超过1800美元，时间是3月12号到3月16号。",
        role: "user" as const,
        timestamp: "2025-03-10T12:05:00Z",
      },
    ];

    const aspects = await runAspectsEngine(turns, { referenceTimestamp: "2025-03-20T00:00:00Z" });
    expect(aspects.length).toBeGreaterThan(0);

    const amountAspect = aspects.find(aspect => aspect.findings.some(finding => finding.kind === "amount"));
    if (!amountAspect) {
      throw new Error(`Amount aspect missing. Aspects: ${JSON.stringify(aspects, null, 2)}`);
    }
    expect(amountAspect.confidence).toBeGreaterThan(0);
    const summary = Array.isArray((amountAspect.meta as any)?.summary)
      ? ((amountAspect.meta as any).summary as string[])
      : [];
    expect(summary[0] ?? "").toContain("Trip · idea");
  });
});
