// Which one line the live try-on sheet shows under the outfit name. Framing
// problems (no person, step back…) are the framing guide's job, not this line.

export type TrackerState = "loading" | "ready" | "failed";
export type CutoutState = "loading" | "ready" | "failed";

export type LiveStatusKey =
  | "tryon.live.unsupported"
  | "tryon.live.tracker_failed"
  | "tryon.live.loading"
  | "tryon.live.cutout_loading"
  | "tryon.live.cutout_failed"
  | "tryon.live.cant_show";

/** One outfit item, for the status line. */
export type ItemCutout = { name: string; placeable: boolean; cutout: CutoutState };

export type LiveStatus = { key: LiveStatusKey; names?: string } | null;

/**
 * The status line for an outfit, most important first; null when the framing
 * guide speaks instead. Items that can't be shown (no body slot, or a failed
 * cut-out) are named while the rest of the outfit is shown.
 */
export function liveStatus(items: ItemCutout[], tracker: TrackerState): LiveStatus {
  const placeable = items.filter((i) => i.placeable);
  if (placeable.length === 0) return { key: "tryon.live.unsupported" };
  if (tracker === "failed") return { key: "tryon.live.tracker_failed" };
  if (tracker === "loading") return { key: "tryon.live.loading" };
  if (placeable.every((i) => i.cutout === "loading")) return { key: "tryon.live.cutout_loading" };
  if (placeable.every((i) => i.cutout === "failed")) return { key: "tryon.live.cutout_failed" };
  const missing = items.filter((i) => !i.placeable || i.cutout === "failed").map((i) => i.name);
  if (missing.length > 0) return { key: "tryon.live.cant_show", names: missing.join(", ") };
  return null;
}
