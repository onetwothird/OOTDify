// C:\OOTDify\src\features\capture\isolate.ts
// Garment isolation for captured photos: send the photo to the backend, which
// cuts the main garment out onto a white background, and write the cut-out to
// the app cache so it can be previewed and uploaded like any picked photo.
//
// Honest by construction: when the backend doesn't trust its cut-out (or the
// request fails) we report "kept" / "error" and the caller keeps the user's
// original photo — a bad crop is never silently swapped in.
import { File, Paths } from "expo-file-system";

import {
  isolateClothing,
  type GarmentDescription,
  type IsolationReason,
} from "../../services/aiApi";

export type IsolationOutcome =
  | { status: "isolated"; uri: string; garment: GarmentDescription | null }
  | { status: "kept"; reason: IsolationReason | null; garment: GarmentDescription | null }
  | { status: "error" };

export async function isolateCapturedPhoto(uri: string): Promise<IsolationOutcome> {
  try {
    const result = await isolateClothing(uri);
    if (!result.ok || !result.image_base64) {
      return { status: "kept", reason: result.reason, garment: result.garment };
    }
    const file = new File(
      Paths.cache,
      `cutout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`,
    );
    file.write(result.image_base64, { encoding: "base64" });
    return { status: "isolated", uri: file.uri, garment: result.garment };
  } catch (e) {
    console.warn("Garment isolation failed:", e);
    return { status: "error" };
  }
}
