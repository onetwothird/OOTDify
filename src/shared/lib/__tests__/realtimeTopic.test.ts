import { realtimeTopic } from "../realtimeTopic";

describe("realtimeTopic", () => {
  it("keeps the base name readable", () => {
    expect(realtimeTopic("community-feed").startsWith("community-feed:")).toBe(true);
  });

  it("never hands out the same topic twice, so a resubscribe can't reuse a joined channel", () => {
    const a = realtimeTopic("community-messages:c1");
    const b = realtimeTopic("community-messages:c1");
    expect(a).not.toBe(b);
  });
});
