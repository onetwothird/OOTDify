// C:\OOTDify\src\features\profile\avatar.ts
// Profile-picture helpers: pick a photo → upload to the PRIVATE `avatars`
// bucket (owner-only RLS) → persist the ref on the user's profile row through
// the backend. Nothing here fabricates an image: the stored ref only changes
// when the upload and the profile PATCH both succeed.
//
// Two ages of photo exist:
//   * signed in  → `changeProfileAvatar` uploads immediately (used by Profile).
//   * signed out → `savePendingAvatar` remembers the LOCAL file only. The
//     signup wizard must not upload anything, because there is no account to
//     own the object yet and an anonymous upload would have no owner scope.
//     `applyPendingAvatar` uploads it, once, right after the account exists.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";

import { updateProfile } from "../../services/aiApi";
import { checkProfilePhoto } from "../../services/aiApi";
import { supabase } from "../../shared/lib/supabase";
import { toast } from "../../shared/lib/toast";
import type { PhotoCheckResult } from "./avatarStore";

export type AvatarSource = "library" | "camera";

/** A photo chosen on this device but not uploaded yet. */
export interface PickedPhoto {
  uri: string;
  /** Pixels, as reported by the OS (0 when it could not be determined). */
  width: number;
  height: number;
  /** Bytes, as reported by the OS (null when unavailable). */
  fileSize: number | null;
  mimeType: string | null;
  fileName: string | null;
  /** "camera" means it was captured live on the spot, not chosen from the library. */
  source: AvatarSource;
}

// Local-only keys. These never hold a remote URL — just a file:// path in the
// app's own cache that the OS may reclaim at any time (handled below).
const PENDING_PHOTO_KEY = "ootdify.pending-avatar";
const PENDING_SELFIE_KEY = "ootdify.pending-selfie";

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Upload a local image URI to `avatars/<uid>/…`; returns the stored ref. */
export async function uploadAvatar(uri: string): Promise<string> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const objectPath = `${uid}/avatar-${Date.now()}.jpg`;
  const res = await fetch(uri);
  const blob = await res.blob();
  const { data, error } = await supabase.storage
    .from("avatars")
    .upload(objectPath, blob, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
  return `avatars/${data.path}`;
}

/** True when the local file is still readable (cache may be reclaimed). */
async function localFileExists(uri: string): Promise<boolean> {
  try {
    await fetch(uri);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pick (or shoot) a square photo and return its real metadata.
 * Returns null when the user cancelled or denied the camera.
 */
export async function pickAvatarPhoto(source: AvatarSource): Promise<PickedPhoto | null> {
  if (source === "camera") {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Camera access needed",
        "We only use the camera for the photo you choose to take.",
      );
      return null;
    }
  }

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    quality: 0.7,
    allowsEditing: true,
    aspect: [1, 1],
  };

  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({ ...options, cameraType: ImagePicker.CameraType.front as any })
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;

  const asset = result.assets?.[0];
  if (!asset) return null;

  return {
    uri: asset.uri,
    width: asset.width ?? 0,
    height: asset.height ?? 0,
    fileSize: asset.fileSize ?? null,
    mimeType: asset.mimeType ?? null,
    fileName: asset.fileName ?? null,
    source,
  };
}

/**
 * Take an unedited selfie straight from the front camera. No crop step, so the
 * file is provably the camera's own capture rather than a library pick.
 */
export async function captureSelfie(): Promise<PickedPhoto | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== "granted") {
    Alert.alert(
      "Camera access needed",
      "The selfie check needs the camera for a few seconds. The photo is analysed and discarded.",
    );
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.6,
    allowsEditing: false,
    cameraType: ImagePicker.CameraType.front as any,
  });
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset) return null;
  return {
    uri: asset.uri,
    width: asset.width ?? 0,
    height: asset.height ?? 0,
    fileSize: asset.fileSize ?? null,
    mimeType: asset.mimeType ?? null,
    fileName: asset.fileName ?? null,
    source: "camera",
  };
}

/**
 * Full flow for a signed-in user: pick → upload → persist. Shows a themed
 * progress toast that turns into a success or error toast, and returns the new
 * stored ref on success (or null when the user cancelled).
 */
export async function changeProfileAvatar(source: AvatarSource): Promise<string | null> {
  const picked = await pickAvatarPhoto(source);
  if (!picked) return null;

  toast.loading("Updating profile photo", "Uploading to your private area…");
  try {
    const ref = await uploadAvatar(picked.uri);
    const profile = await updateProfile({ avatar_url: ref });
    toast.success("Profile photo updated", "Looking good.");
    return profile.avatar_url ?? ref;
  } catch (e) {
    toast.error(
      "Couldn't update your photo",
      e instanceof Error ? e.message : "Please try again in a moment.",
    );
    return null;
  }
}

/** The chooser shown when an avatar is tapped. */
export function promptAvatarSource(onPick: (source: AvatarSource) => void) {
  Alert.alert("Profile photo", "Your photo stays in your private account area.", [
    { text: "Take photo", onPress: () => onPick("camera") },
    { text: "Choose from library", onPress: () => onPick("library") },
    { text: "Cancel", style: "cancel" },
  ]);
}

/**
 * Chooser → pick → upload → persist, reporting the new ref.
 * For screens that offer their own "Change photo" button.
 */
export function promptAvatarChange(onChanged: (ref: string) => void): void {
  promptAvatarSource((source) => {
    void (async () => {
      const ref = await changeProfileAvatar(source);
      if (ref) onChanged(ref);
    })();
  });
}

// ---------------------------------------------------------------------------
// Photos chosen before the account exists (signup wizard)
// ---------------------------------------------------------------------------
// Only the local URI is remembered here. Nothing is uploaded while signed out:
// private buckets are owner-scoped by RLS, so an anonymous upload could never
// belong to the new account (and anything public would leak a face).
//
// Each entry is tagged with the email used at signup, and is only ever applied
// to that same account. Otherwise a photo chosen during one signup could be
// inherited by whoever logs in next on the same device.

interface PendingEntry {
  uri: string;
  email: string;
}

async function readPending(key: string): Promise<PendingEntry | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingEntry>;
    if (typeof parsed.uri !== "string" || typeof parsed.email !== "string") return null;
    return { uri: parsed.uri, email: parsed.email };
  } catch {
    return null;
  }
}

async function writePending(key: string, uri: string, email: string): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify({ uri, email } satisfies PendingEntry));
}

/** True when the pending entry belongs to the currently signed-in account. */
function belongsTo(
  entry: PendingEntry,
  user: { email?: string | null } | null | undefined,
): boolean {
  const mine = (user?.email ?? "").trim().toLowerCase();
  return Boolean(mine) && mine === entry.email.trim().toLowerCase();
}

export async function savePendingAvatar(uri: string, email: string): Promise<void> {
  await writePending(PENDING_PHOTO_KEY, uri, email);
}

export async function clearPendingAvatar(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_PHOTO_KEY);
}

export async function savePendingSelfie(uri: string, email: string): Promise<void> {
  await writePending(PENDING_SELFIE_KEY, uri, email);
}

export async function clearPendingSelfie(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_SELFIE_KEY);
}

/**
 * Upload the photo chosen during signup and attach it to the profile.
 *
 * Called after the account exists. Returns the stored ref, or null when there
 * is nothing to apply / it could not be applied:
 *   * a pending photo belonging to a different account is left untouched;
 *   * a local file the OS reclaimed is dropped (it can never succeed again);
 *   * a network or backend failure keeps it pending for the next app run.
 */
export async function applyPendingAvatar(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;

  const pending = await readPending(PENDING_PHOTO_KEY);
  if (!pending) return null;
  if (!belongsTo(pending, user)) return null;

  if (!(await localFileExists(pending.uri))) {
    await clearPendingAvatar();
    return null;
  }

  try {
    const ref = await uploadAvatar(pending.uri);
    const profile = await updateProfile({ avatar_url: ref });
    await clearPendingAvatar();
    return profile.avatar_url ?? ref;
  } catch {
    // Transient: keep it and try again on a later launch.
    return null;
  }
}

// The selfie check is attempted at most once per app run, so a failing backend
// cannot turn every screen focus into another request.
let photoCheckAttempted = false;

/**
 * Run the real photo check on the selfie captured during signup and hand back
 * the verdict. Returns null when there is nothing to check, the file is gone,
 * or the check could not run — in which case the pending selfie is kept.
 */
export async function runPendingPhotoCheck(): Promise<PhotoCheckResult | null> {
  if (photoCheckAttempted) return null;

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;

  const pending = await readPending(PENDING_SELFIE_KEY);
  if (!pending) return null;
  if (!belongsTo(pending, user)) return null;

  photoCheckAttempted = true;

  if (!(await localFileExists(pending.uri))) {
    await clearPendingSelfie();
    return null;
  }

  try {
    const check = await checkProfilePhoto(pending.uri);
    await clearPendingSelfie();
    return { ...check, checkedAt: new Date().toISOString() };
  } catch {
    return null;
  }
}
