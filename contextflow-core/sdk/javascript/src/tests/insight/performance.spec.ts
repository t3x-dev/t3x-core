import { jest } from "@jest/globals";
import { performance } from "perf_hooks";
import { runAspectsEngine } from "../../insight/engine";
import { goldConversations } from "./__fixtures__/goldDataset";

jest.mock("../../insight/models/minilm_xenova", () => ({
  __esModule: true,
  MiniLmxEnovaModel: class MockMiniLM {
    readonly id = "mock-minilm@local";
    async embed(texts: string[]): Promise<number[][]> {
      return texts.map(text => Array.from({ length: 6 }, (_, idx) => (text.length % 13) / (idx + 1)));
    }
  },
}));

describe("Insight engine performance baseline", () => {
  it("processes conversations within the baseline threshold", async () => {
    const iterations = 15;
    const dataset = goldConversations;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      const conversation = dataset[i % dataset.length];
      await runAspectsEngine(conversation.turns, {
        referenceTimestamp: "2025-12-31T00:00:00Z",
      });
    }

    const durationMs = performance.now() - start;
    const avgPerRun = durationMs / iterations;
    // eslint-disable-next-line no-console
    console.info(`[Insight baseline] avg ${avgPerRun.toFixed(2)}ms per run over ${iterations} iterations`);
    expect(avgPerRun).toBeLessThan(150);
  });
});
