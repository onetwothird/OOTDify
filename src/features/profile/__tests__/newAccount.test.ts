import { isFirstSignIn } from "../newAccount";

describe("isFirstSignIn", () => {
  it("is true when the account was created by this sign-in", () => {
    expect(isFirstSignIn({ created_at: "2026-10-31T09:00:00.000Z", last_sign_in_at: "2026-10-31T09:00:01.200Z" })).toBe(true);
  });

  it("is false for an account that signed in before", () => {
    expect(isFirstSignIn({ created_at: "2026-10-01T09:00:00Z", last_sign_in_at: "2026-10-31T09:00:00Z" })).toBe(false);
  });

  it("is false when the times are missing or unreadable", () => {
    expect(isFirstSignIn({ created_at: "2026-10-31T09:00:00Z" })).toBe(false);
    expect(isFirstSignIn({ created_at: "nope", last_sign_in_at: "2026-10-31T09:00:00Z" })).toBe(false);
    expect(isFirstSignIn(null)).toBe(false);
  });
});
