import { createLabel } from "../../insight/label";

describe("createLabel", () => {
  it("prefers entity as label prefix", () => {
    const title = createLabel(
      {
        tokens: ["travel", "plan", "tokyo"],
        entities: ["东京", "日本"],
      },
      40,
    );
    expect(title.startsWith("东京")).toBe(true);
  });

  it("falls back to top-scored tokens when no entity", () => {
    const title = createLabel(
      {
        tokens: ["budget", "plan", "and", "trip"],
      },
      40,
    );
    expect(title).toBe("budget · plan · trip");
  });

  it("truncates overly long labels with ellipsis", () => {
    const title = createLabel(
      {
        tokens: ["supercalifragilisticexpialidocious", "longword", "example"],
      },
      10,
    );
    expect(title.endsWith("…")).toBe(true);
  });
});
