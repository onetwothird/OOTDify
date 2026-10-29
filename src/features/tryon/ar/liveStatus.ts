// Which one line the live try-on sheet shows under the garment name. Framing
// problems (no person, step back…) are the framing guide's job, not this line.
import type { MeshFit } from "./bodyMesh";

export type TrackerState = "loading" | "ready" | "failed";
export type CutoutState = "loading" | "ready" | "failed";

export type LiveStatusKey =
  | "tryon.live.unsupported"
  | "tryon.live.tracker_failed"
  | "tryon.live.loading"
  | "tryon.live.cutout_loading"
  | "tryon.live.cutout_failed";

/** The status to show, most important first; null when the framing guide speaks instead. */
export function liveStatusKey(
  fitKind: MeshFit["kind"],
  tracker: TrackerState,
  cutout: CutoutState,
): LiveStatusKey | null {
  if (fitKind === "unsupported") return "tryon.live.unsupported";
  if (tracker === "failed") return "tryon.live.tracker_failed";
  if (tracker === "loading") return "tryon.live.loading";
  if (cutout === "loading") return "tryon.live.cutout_loading";
  if (cutout === "failed") return "tryon.live.cutout_failed";
  return null;
}
