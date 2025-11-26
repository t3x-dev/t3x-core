import { jest } from "@jest/globals";
import { runAspectsEngine } from "../../insight/engine";
import { allGoldConversations } from "./__fixtures__/goldDataset";

jest.mock("../../insight/models/minilm_xenova", () => ({
  __esModule: true,
  MiniLmxEnovaModel: class MockMiniLM {
    readonly id = "mock-minilm@local";
    async embed(texts: string[]): Promise<number[][]> {
      return texts.map(text => Array.from({ length: 6 }, (_, idx) => (text.length % 11) / (idx + 1)));
    }
  },
}));

describe("Insight engine evaluation", () => {
  it("achieves acceptable Evidence@1 on gold conversations", async () => {
    let hits = 0;

    const misses: string[] = [];
    for (const conversation of allGoldConversations) {
      const aspects = await runAspectsEngine(conversation.turns, {
        referenceTimestamp: "2025-12-31T00:00:00Z",
      });
      const topAspect = [...aspects].sort((a, b) => b.confidence - a.confidence)[0];
      const normalizedTitle = (topAspect?.title ?? "").toLowerCase();
      const findingsText = topAspect?.findings.map(finding => finding.text.toLowerCase()).join(" ") ?? "";
      const needle = conversation.expectedTopAspectContains.toLowerCase();
      if (normalizedTitle.includes(needle) || findingsText.includes(needle)) {
        hits += 1;
      } else {
        misses.push(`${conversation.id} -> "${topAspect?.title ?? ""}"`);
      }
    }

    const evidenceAt1 = hits / allGoldConversations.length;
    const message = `Evidence@1=${evidenceAt1.toFixed(2)}, misses=${misses.join(", ")}`;
    if (evidenceAt1 < 0.8) {
      throw new Error(message);
    }
  });

  it("produces deterministic output for same conversation", async () => {
    const conversation = allGoldConversations[0];
    const first = await runAspectsEngine(conversation.turns, {
      referenceTimestamp: "2025-12-31T00:00:00Z",
    });
    const second = await runAspectsEngine(conversation.turns, {
      referenceTimestamp: "2025-12-31T00:00:00Z",
    });

    expect(JSON.stringify(first)).toEqual(JSON.stringify(second));
  });
});
