// C:\OOTDify\src\features\tryon\presets.ts
// Who can wear an outfit in photo try-on: the user (their own photo) or one
// of the preset models. The preset ids match PRESET_MODELS in
// backend/services/gemini_tryon.py; the backend describes each person, so no
// photo of anyone real is used for them.
import type { CreateTryOnJobInput, TryOnJob } from "../../services/aiApi";

export const PRESET_IDS = ["ava", "leo", "mia", "kai", "rin", "sam"] as const;
export type PresetId = (typeof PRESET_IDS)[number];

/** Display names (proper names, the same in every language). */
export const PRESET_NAMES: Record<PresetId, string> = {
  ava: "Ava",
  leo: "Leo",
  mia: "Mia",
  kai: "Kai",
  rin: "Rin",
  sam: "Sam",
};

export type Wearer = { kind: "you"; bodyPhotoId: string | null } | { kind: "preset"; id: PresetId };

export function isPresetId(value: unknown): value is PresetId {
  return typeof value === "string" && (PRESET_IDS as readonly string[]).includes(value);
}

/**
 * The try-on request for this wearer and outfit, or null when it can't be
 * made yet (no pieces, or "you" without a photo).
 */
export function tryOnRequest(wearer: Wearer, clothingIds: string[]): CreateTryOnJobInput | null {
  const ids = Array.from(new Set(clothingIds.filter(Boolean))).slice(0, 10);
  if (!ids.length) return null;
  if (wearer.kind === "preset") return { modelPreset: wearer.id, clothingIds: ids };
  return wearer.bodyPhotoId ? { bodyPhotoId: wearer.bodyPhotoId, clothingIds: ids } : null;
}

/** How to label a finished picture, so an AI-made body is never passed off as a real one. */
export function resultBadge(job: Pick<TryOnJob, "photo_kind" | "model_preset">): "preset" | "face_only" | "you" {
  if (job.photo_kind === "preset" || job.model_preset) return "preset";
  if (job.photo_kind === "face_only") return "face_only";
  return "you";
}
