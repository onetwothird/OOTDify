import { nextWelcome } from "../welcome";

describe("nextWelcome", () => {
  it("celebrates once when the app opens already signed in", () => {
    expect(nextWelcome("INITIAL_SESSION", true, false)).toEqual({ show: true, welcomed: true });
    expect(nextWelcome("SIGNED_IN", true, true)).toEqual({ show: false, welcomed: true });
  });

  it("celebrates a fresh sign-in", () => {
    expect(nextWelcome("SIGNED_IN", true, false)).toEqual({ show: true, welcomed: true });
  });

  it("stays quiet for token refreshes and signed-out launches", () => {
    expect(nextWelcome("TOKEN_REFRESHED", true, true)).toEqual({ show: false, welcomed: true });
    expect(nextWelcome("INITIAL_SESSION", false, false)).toEqual({ show: false, welcomed: false });
  });

  it("celebrates again after signing out and back in", () => {
    const out = nextWelcome("SIGNED_OUT", false, true);
    expect(out).toEqual({ show: false, welcomed: false });
    expect(nextWelcome("SIGNED_IN", true, out.welcomed).show).toBe(true);
  });
});
