// C:\OOTDify\src\features\community\__tests__\format.test.ts
// Pure-logic tests for the community time formatting (no Supabase involved).
import { timeAgo } from "../format";

const NOW = Date.parse("2026-10-20T12:00:00Z");

describe("timeAgo", () => {
  it("returns 'just now' inside the first minute", () => {
    expect(timeAgo("2026-10-20T11:59:30Z", NOW)).toBe("just now");
    expect(timeAgo("2026-10-20T12:00:00Z", NOW)).toBe("just now");
  });

  it("returns whole minutes up to an hour", () => {
    expect(timeAgo("2026-10-20T11:59:00Z", NOW)).toBe("1m");
    expect(timeAgo("2026-10-20T11:30:00Z", NOW)).toBe("30m");
  });

  it("returns whole hours up to a day", () => {
    expect(timeAgo("2026-10-20T11:00:00Z", NOW)).toBe("1h");
    expect(timeAgo("2026-10-20T02:15:00Z", NOW)).toBe("9h");
  });

  it("returns whole days up to a week", () => {
    expect(timeAgo("2026-10-19T12:00:00Z", NOW)).toBe("1d");
    expect(timeAgo("2026-10-15T12:00:00Z", NOW)).toBe("5d");
  });

  it("falls back to a date beyond a week", () => {
    const out = timeAgo("2026-10-01T12:00:00Z", NOW);
    expect(out).not.toMatch(/^\d+[mhd]$/);
    expect(out.length).toBeGreaterThan(0);
  });

  it("clamps future timestamps to 'just now' instead of negative values", () => {
    expect(timeAgo("2026-10-20T12:05:00Z", NOW)).toBe("just now");
  });

  it("renders empty string for null/undefined/invalid input", () => {
    expect(timeAgo(null, NOW)).toBe("");
    expect(timeAgo(undefined, NOW)).toBe("");
    expect(timeAgo("not-a-date", NOW)).toBe("");
  });
});
