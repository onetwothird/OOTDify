// C:\OOTDify\src\features\profile\avatarStore.ts
// The signed-in user's profile photo, shared by every screen that shows it.
//
// Why a store: the header (Home) and the Profile hero both render the same
// photo. Without a single source of truth, changing it in Profile leaves a
// stale image in the header until the next profile fetch. Here a change is
// broadcast immediately, so the photo updates everywhere in the same frame.
//
// Only real values live here — a stored ref that came back from the backend,
// or a local preview URI of a file the user just picked. Nothing is invented.
import { create } from "zustand";

import { supabase } from "../../shared/lib/supabase";

/** Outcome of the server-side photo check (models actually ran on the image). */
export interface PhotoCheckResult {
  ok: boolean;
  personDetected: boolean;
  personConfidence: number | null;
  /** How many of the five face keypoints were confidently located. */
  faceKeypoints: number;
  /** How many of the 17 body keypoints were confidently located. */
  keypointsVisible: number;
  /** Machine-readable reason when `ok` is false (rendered by the UI). */
  reason: string | null;
  checkedAt: string;
}

interface AvatarState {
  /** Stored ref of the current avatar (`avatars/<uid>/…` or an https URL). */
  ref: string | null;
  /** Local file being shown while its upload is still in flight. */
  preview: string | null;
  /** Last photo check for the current session, if one has run. */
  check: PhotoCheckResult | null;
  setRef: (ref: string | null) => void;
  setPreview: (uri: string | null) => void;
  setCheck: (check: PhotoCheckResult | null) => void;
  clear: () => void;
}

export const useAvatarStore = create<AvatarState>((set) => ({
  ref: null,
  preview: null,
  check: null,
  setRef: (ref) => set({ ref, preview: null }),
  setPreview: (preview) => set({ preview }),
  setCheck: (check) => set({ check }),
  clear: () => set({ ref: null, preview: null, check: null }),
}));

// One account's photo must never be shown to the next one.
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") useAvatarStore.getState().clear();
});
