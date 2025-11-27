import { runExtractors } from "../../insight/extract";

describe("structural extractors", () => {
  it("detects headings, list items, blocks, and quotes", () => {
    const turn = {
      id: "turn-struct",
      text: [
        "## Budget and Itinerary",
        "- Not exceeding 1800 USD",
        "- Keep itinerary to 3 days",
        "> \"Osaka nightlife is great\"",
        "",
        "First paragraph describes Osaka night market food.",
        "",
        "Second paragraph emphasizes proximity to subway.",
      ].join("\n"),
    };

    const findings = runExtractors(turn);
    const kinds = findings.reduce<Record<string, number>>((acc, item) => {
      acc[item.kind] = (acc[item.kind] ?? 0) + 1;
      return acc;
    }, {});

    expect(kinds.heading).toBeGreaterThanOrEqual(1);
    expect(kinds.list_item).toBeGreaterThanOrEqual(2);
    expect(kinds.block).toBeGreaterThanOrEqual(2);
    expect(kinds.quote).toBeGreaterThanOrEqual(1);
  });
});
