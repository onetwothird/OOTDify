// Which one line the live try-on sheet shows under the garment name.
import type { LiveLoopState } from "./liveLoop";
import type { OverlayFit } from "./overlayGeometry";

export type LiveStatusKey =
  | "tryon.live.unsupported"
  | "tryon.live.signed_out"
  | "tryon.live.rate_limited"
  | "tryon.live.lost"
  | "tryon.live.starting"
  | "tryon.live.no_pose.upper"
  | "tryon.live.no_pose.dress"
  | "tryon.live.no_pose.lower";

function noPoseKey(category: string | null): LiveStatusKey {
  switch (category?.toLowerCase()) {
    case "dresses":
      return "tryon.live.no_pose.dress";
    case "bottoms":
      return "tryon.live.no_pose.lower";
    default:
      return "tryon.live.no_pose.upper";
  }
}

/** The status to show, most important first; null when the garment is placed. */
export function liveStatusKey(category: string | null, fit: OverlayFit, loop: LiveLoopState): LiveStatusKey | null {
  if (fit.kind === "unsupported") return "tryon.live.unsupported";
  if (loop.signedOut) return "tryon.live.signed_out";
  if (loop.rateLimited) return "tryon.live.rate_limited";
  if (loop.lost) return "tryon.live.lost";
  if (fit.kind === "no_pose") return loop.pose ? noPoseKey(category) : "tryon.live.starting";
  return null;
}
