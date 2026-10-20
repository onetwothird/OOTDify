// C:\OOTDify\src\features\community/format.ts
// Pure formatting helpers for the community feature (kept side-effect-free so
// they are unit-testable in the node Jest environment).

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WEEK_MS = 604_800_000;

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
