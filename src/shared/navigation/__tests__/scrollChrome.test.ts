import { nextChromeHidden, SCROLL_TOP_ZONE } from "../scrollChrome";

describe("nextChromeHidden", () => {
  it("hides when scrolling down past the top zone", () => {
    expect(nextChromeHidden(100, 140, false)).toBe(true);
  });

  it("shows again when scrolling up", () => {
    expect(nextChromeHidden(400, 360, true)).toBe(false);
  });

  it("always shows near the top of the list", () => {
    expect(nextChromeHidden(0, SCROLL_TOP_ZONE, true)).toBe(false);
  });

  it("ignores tiny movements so the bar does not flicker", () => {
    expect(nextChromeHidden(300, 303, false)).toBe(false);
    expect(nextChromeHidden(300, 297, true)).toBe(true);
  });
});
