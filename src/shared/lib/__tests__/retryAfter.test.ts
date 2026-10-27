import { parseRetryAfter } from "../retryAfter";

describe("parseRetryAfter", () => {
  it("reads whole seconds", () => {
    expect(parseRetryAfter("7")).toBe(7);
  });

  it("trims whitespace", () => {
    expect(parseRetryAfter(" 12 ")).toBe(12);
  });

  it("reads an HTTP date relative to now", () => {
    const now = Date.parse("2026-10-27T10:00:00Z");
    expect(parseRetryAfter("Tue, 27 Oct 2026 10:00:30 GMT", now)).toBe(30);
  });

  it("never returns a negative wait", () => {
    const now = Date.parse("2026-10-27T10:00:00Z");
    expect(parseRetryAfter("Tue, 27 Oct 2026 09:59:00 GMT", now)).toBe(0);
  });

  it.each([null, "", "soon", "-3"])("ignores %p", (value) => {
    expect(parseRetryAfter(value)).toBeUndefined();
  });
});
