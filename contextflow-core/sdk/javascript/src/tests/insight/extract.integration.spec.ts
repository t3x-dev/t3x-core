import { runExtractors } from "../../insight/extract";

describe("extractors integration (current capabilities)", () => {
  const turn = {
    id: "turn-100",
    text: [
      "我想去大阪吃夜市美食，预算不超过1800美元，时间是3月12号到3月16号。",
      "避免太远的酒店，最好靠近地铁。",
      "更多灵感可以看这个链接：https://travel.example/osaka-night-market",
    ].join(" "),
  };

  const findings = runExtractors(turn);

  it("detects Ring A surface signals (amount/date/url/phrases)", () => {
    const kinds = findings.map(item => item.kind);
    expect(kinds).toEqual(expect.arrayContaining(["amount", "date", "url", "phrase"]));

    const amount = findings.find(item => item.kind === "amount");
    expect(amount?.meta).toMatchObject({ currency: "USD", value: 1800 });

    const url = findings.find(item => item.kind === "url");
    expect(url?.text).toContain("https://travel.example");

    const phrases = findings.filter(item => item.kind === "phrase").map(item => item.text);
    expect(phrases.some(text => text.includes("夜市美食"))).toBe(true);
    expect(phrases.some(text => text.includes("地铁"))).toBe(true);
  });

  it("detects Ring B relational signals (preference/constraint)", () => {
    const preference = findings.find(item => item.kind === "prefer");
    expect(preference?.text).toContain("大阪");

    const constraint = findings.find(item => item.kind === "constraint");
    expect(constraint?.text).toContain("不超过1800");
  });

  it("detects structural findings (Ring C)", () => {
    const kinds = new Set(findings.map(item => item.kind));
    expect(kinds.has("block")).toBe(true);
  });
});
