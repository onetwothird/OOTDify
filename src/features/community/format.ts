// C:\OOTDify\src\features\community/format.ts
// Pure formatting helpers for the community feature (kept side-effect-free so
// they are unit-testable in the node Jest environment).

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WEEK_MS = 604_800_000;

// Intl-free name tables (manual, deterministic, testable in the node env).
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

/** Whole local-calendar days since the epoch — DST-safe day boundaries. */
function localDay(ms: number): number {
  const d = new Date(ms);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}

/**
 * Compact relative time for feed/chat rows: "just now", "12m", "3h", "2d",
 * and a localized date beyond a week. Invalid input renders as empty string
 * (the caller decides whether to hide the label).
 */
export function timeAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diff = Math.max(0, now - t);
  if (diff < MINUTE_MS) return "just now";
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)}m`;
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}h`;
  if (diff < WEEK_MS) return `${Math.floor(diff / DAY_MS)}d`;
  return new Date(t).toLocaleDateString();
}

/**
 * Day separator for chat threads: "Today", "Yesterday", the weekday name for
 * anything inside the last 7 days, and a short date ("Oct 12") beyond that.
 * Days are compared on the viewer's local calendar; future timestamps (clock
 * skew) read as "Today". Invalid input renders as an empty string.
 */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const t = Date.parse(iso);
  const n = now.getTime();
  if (Number.isNaN(t) || Number.isNaN(n)) return "";
  const diff = localDay(n) - localDay(t);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  const d = new Date(t);
  if (diff < 7) return WEEKDAYS[d.getDay()];
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Exact wall-clock time for the single clock label on a message cluster:
 * "3:42 PM" (seconds dropped, 12-hour). Invalid input renders as an empty
 * string (the caller decides whether to hide the label).
 */
export function clockLabel(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  const hour = d.getHours();
  const minute = String(d.getMinutes()).padStart(2, "0");
  return `${hour % 12 || 12}:${minute} ${hour < 12 ? "AM" : "PM"}`;
}
