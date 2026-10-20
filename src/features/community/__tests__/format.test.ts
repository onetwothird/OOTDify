// C:\OOTDify\src\features\community\__tests__\format.test.ts
// Pure-logic tests for the community time formatting (no Supabase involved).
import { clockLabel, dayLabel, timeAgo } from "../format";

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

// 2026-10-20 is a Tuesday. Timestamps below are local ISO strings (no zone)
// so every assertion holds in any test-runner timezone.
const DAY_NOW = new Date("2026-10-20T09:30:00");

describe("dayLabel", () => {
  it("returns 'Today' for the same local calendar day", () => {
    expect(dayLabel("2026-10-20T08:00:00", DAY_NOW)).toBe("Today");
    // Just after midnight is still today.
    expect(dayLabel("2026-10-20T00:00:00", DAY_NOW)).toBe("Today");
    expect(dayLabel("2026-10-20T00:05:00", DAY_NOW)).toBe("Today");
  });

  it("returns 'Yesterday', including just before midnight", () => {
    expect(dayLabel("2026-10-19T18:00:00", DAY_NOW)).toBe("Yesterday");
    expect(dayLabel("2026-10-19T23:59:00", DAY_NOW)).toBe("Yesterday");
    expect(dayLabel("2026-10-19T00:05:00", DAY_NOW)).toBe("Yesterday");
  });

  it("returns the weekday name inside the last 7 days", () => {
    expect(dayLabel("2026-10-17T12:00:00", DAY_NOW)).toBe("Saturday");
    expect(dayLabel("2026-10-16T12:00:00", DAY_NOW)).toBe("Friday");
    expect(dayLabel("2026-10-14T12:00:00", DAY_NOW)).toBe("Wednesday");
    // 6 days back is still a weekday label.
    expect(dayLabel("2026-10-14T23:30:00", DAY_NOW)).toBe("Wednesday");
  });

  it("returns a short date from 7 days back", () => {
    expect(dayLabel("2026-10-13T12:00:00", DAY_NOW)).toBe("Oct 13");
    expect(dayLabel("2026-10-12T12:00:00", DAY_NOW)).toBe("Oct 12");
    expect(dayLabel("2026-10-01T12:00:00", DAY_NOW)).toBe("Oct 1");
  });

  it("clamps future timestamps (clock skew) to 'Today'", () => {
    expect(dayLabel("2026-10-21T00:05:00", DAY_NOW)).toBe("Today");
  });

  it("defaults to the real current day and rejects invalid input", () => {
    expect(dayLabel(new Date().toISOString())).toBe("Today");
    expect(dayLabel("not-a-date", DAY_NOW)).toBe("");
    expect(dayLabel("2026-10-20T12:00:00", new Date("nope"))).toBe("");
  });
});

describe("clockLabel", () => {
  it("formats 12-hour wall-clock time without seconds", () => {
    expect(clockLabel("2026-10-20T15:42:00")).toBe("3:42 PM");
    expect(clockLabel("2026-10-20T09:07:03")).toBe("9:07 AM");
    expect(clockLabel("2026-10-20T12:00:00")).toBe("12:00 PM");
  });

  it("handles midnight-adjacent times", () => {
    expect(clockLabel("2026-10-20T00:05:00")).toBe("12:05 AM");
    expect(clockLabel("2026-10-20T00:00:00")).toBe("12:00 AM");
    expect(clockLabel("2026-10-20T23:59:00")).toBe("11:59 PM");
  });

  it("renders empty string for invalid input", () => {
    expect(clockLabel("not-a-time")).toBe("");
  });
});
