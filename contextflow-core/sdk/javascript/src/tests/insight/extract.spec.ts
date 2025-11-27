import { runExtractors } from "../../insight/extract";

describe("runExtractors", () => {
  it("extracts key findings from travel planning text", () => {
    const turn = {
      id: "turn-42",
      text: "我想去大阪吃夜市美食,预算不超过1800美元,时间是3月12号到3月16号.",
    };

    const findings = runExtractors(turn);

    const kinds = findings.map(item => item.kind);
    expect(kinds).toContain("amount");
    expect(kinds).toContain("date");
    expect(kinds).toContain("prefer");

    const amount = findings.find(item => item.kind === "amount");
    expect(amount?.text).toContain("1800");
    expect(amount?.meta).toMatchObject({ currency: "USD", value: 1800 });

    const date = findings.find(item => item.kind === "date");
    expect(date?.text).toContain("3月12号");
  });

  it("is deterministic for identical inputs", () => {
    const turn = { id: "turn-99", text: "Budget around $2000 for Osaka street food." };
    const first = runExtractors(turn);
    const second = runExtractors(turn);
    expect(first).toEqual(second);
  });
});

