import { renderBullets } from "../../insight/draft";

describe("renderBullets", () => {
  it("summarizes findings into concise bullet", () => {
    const bullets = renderBullets([
      {
        aspectId: "aspect-1",
        title: "Travel budget",
        findings: ["Budget not exceeding 2000 USD", "Additional notes"],
        confidence: 0.82,
      },
    ]);

    expect(bullets[0]).toContain("Travel budget");
    expect(bullets[0]).toContain("(82%)");
    expect(bullets[0]).toContain("Budget not exceeding 2000 USD");
  });

  it("indicates missing evidence when findings empty", () => {
    const bullets = renderBullets([
      {
        aspectId: "aspect-2",
        title: "Departure time",
        findings: [],
        confidence: 0.4,
      },
    ]);

    expect(bullets[0]).toContain("Missing evidence");
  });
});
