import { authRedirect } from "../authRoute";

describe("authRedirect", () => {
  it("sends a signed-in, consented launch from the empty root to Home", () => {
    expect(authRedirect([], true, true)).toEqual({ to: "/(tabs)/home", replace: true });
  });

  it("sends a signed-in launch without consent from the root to the consent gate", () => {
    expect(authRedirect([], true, false)).toEqual({ to: "/consent", replace: true });
  });

  it("sends a signed-out launch to the landing page", () => {
    expect(authRedirect([], false, false)).toEqual({ to: "/(auth)", replace: false });
  });

  it("moves a signed-in user out of the auth screens", () => {
    expect(authRedirect(["(auth)", "login"], true, true)).toEqual({ to: "/(tabs)/home", replace: true });
    expect(authRedirect(["(auth)"], true, false)).toEqual({ to: "/consent", replace: true });
  });

  it("leaves signed-out visitors on the auth screens and the public legal documents", () => {
    expect(authRedirect(["(auth)", "signup"], false, false)).toBeNull();
    expect(authRedirect(["privacy", "terms"], false, false)).toBeNull();
    expect(authRedirect(["privacy", "policy"], false, false)).toBeNull();
  });

  it("keeps a signed-in user without consent at the gate or its documents", () => {
    expect(authRedirect(["consent"], true, false)).toBeNull();
    expect(authRedirect(["privacy", "terms"], true, false)).toBeNull();
    expect(authRedirect(["(tabs)", "home"], true, false)).toEqual({ to: "/consent", replace: true });
  });

  it("leaves a signed-in, consented user where they are", () => {
    expect(authRedirect(["(tabs)", "home"], true, true)).toBeNull();
  });
});
