import { clearProfileCache, readProfileCache, writeProfileCache } from "../profileCache";

describe("profile cache", () => {
  beforeEach(() => clearProfileCache());

  it("is empty until something is loaded", () => {
    expect(readProfileCache("me")).toBeNull();
  });

  it("gives back the last load for the same account", () => {
    writeProfileCache("me", { n: 1 });
    writeProfileCache("me", { n: 2 });
    expect(readProfileCache("me")).toEqual({ n: 2 });
  });

  it("never shows one account's profile to another", () => {
    writeProfileCache("me", { n: 1 });
    expect(readProfileCache("someone-else")).toBeNull();
    expect(readProfileCache(null)).toBeNull();
  });

  it("forgets everything on sign-out", () => {
    writeProfileCache("me", { n: 1 });
    clearProfileCache();
    expect(readProfileCache("me")).toBeNull();
  });
});
