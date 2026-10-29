// Which one line the live try-on sheet shows under the garment name.
import { garmentKind, type MeshFit } from "./bodyMesh";

export type TrackerState = "loading" | "ready" | "failed";
export type CutoutState = "loading" | "ready" | "failed";

export type LiveStatusKey =
  | "tryon.live.unsupported"
  | "tryon.live.tracker_failed"
  | "tryon.live.loading"
  | "tryon.live.cutout_loading"
  | "tryon.live.cutout_failed"
  | "tryon.live.starting"
  | "tryon.live.no_pose.upper"
  | "tryon.live.no_pose.dress"
  | "tryon.live.no_pose.lower";

function noPoseKey(category: string | null): LiveStatusKey {
  switch (garmentKind(category)) {
    case "dress":
      return "tryon.live.no_pose.dress";
    case "bottom":
      return "tryon.live.no_pose.lower";
    default:
      return "tryon.live.no_pose.upper";
  }
}

/**
 * The status to show, most important first; null when the garment is placed.
 * `personSeen` is true when any keypoint scores at least 0.3 in the current frame.
 */
export function liveStatusKey(
  category: string | null,
  fitKind: MeshFit["kind"],
  tracker: TrackerState,
  personSeen: boolean,
  cutout: CutoutState,
): LiveStatusKey | null {
  if (fitKind === "unsupported") return "tryon.live.unsupported";
  if (tracker === "failed") return "tryon.live.tracker_failed";
  if (tracker === "loading") return "tryon.live.loading";
  if (cutout === "loading") return "tryon.live.cutout_loading";
  if (cutout === "failed") return "tryon.live.cutout_failed";
  if (!personSeen) return "tryon.live.starting";
  if (fitKind === "no_pose") return noPoseKey(category);
  return null;
}
