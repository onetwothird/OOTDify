// C:\OOTDify\src\features\profile\avatar.ts
// Profile-picture helpers: pick a photo → send it to the backend, which hosts
// it on Cloudinary and saves the HTTPS URL on the user's profile row. Older
// avatars stored as `avatars/<uid>/…` Supabase refs keep rendering through
// resolveMediaUrl(). Nothing here fabricates an image: the stored ref only
// changes when the backend upload succeeds.
//
// Two ages of photo exist:
//   * signed in  → `changeProfileAvatar` uploads immediately (used by Profile).
//   * signed out → `savePendingAvatar` remembers the LOCAL file only. The
//     signup wizard must not upload anything, because there is no account to
//     own the object yet and an anonymous upload would have no owner scope.
//     `applyPendingAvatar` uploads it, once, right after the account exists.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";

import { uploadProfileAvatar } from "../../services/aiApi";
import { supabase } from "../../shared/lib/supabase";
import { toast } from "../../shared/lib/toast";

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

// Local-only key. This never holds a remote URL — just a file:// path in the
// app's own cache that the OS may reclaim at any time (handled below).
const PENDING_PHOTO_KEY = "ootdify.pending-avatar";

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/**
 * Upload a local image as the profile photo; returns the stored ref.
 * The backend hosts it on Cloudinary and saves the HTTPS URL on the profile
 * row in the same request, so no separate profile PATCH is needed.
 */
export async function uploadAvatar(uri: string): Promise<string> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const profile = await uploadProfileAvatar(uri);
  if (!profile.avatar_url) throw new Error("The photo was uploaded but not saved.");
  return profile.avatar_url;
}

/**
 * True when the local file is still there (cache may be reclaimed). Uses the
 * file system directly: `fetch(file://…)` is unreliable on Android and made
 * a perfectly good photo look missing, so it was silently discarded.
 */
function localFileExists(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

/**
 * Pick (or shoot) a photo and return its real metadata: square from the front
 * camera for an avatar, a 16:9 banner from the back camera for a cover.
 * Returns null when the user cancelled or denied the camera.
 */
export async function pickAvatarPhoto(
  source: AvatarSource,
  shape: "square" | "cover" = "square",
): Promise<PickedPhoto | null> {
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
    aspect: shape === "cover" ? [16, 9] : [1, 1],
  };
  const cameraType = shape === "cover" ? ImagePicker.CameraType.back : ImagePicker.CameraType.front;

  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({ ...options, cameraType: cameraType as any })
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

  toast.loading("Updating profile photo", "Uploading your photo…");
  try {
    const ref = await uploadAvatar(picked.uri);
    toast.success("Profile photo updated", "Looking good.");
    return ref;
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
  Alert.alert("Profile photo", "Your photo appears on your profile and in Community.", [
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

  if (!localFileExists(pending.uri)) {
    await clearPendingAvatar();
    toast.error(
      "Your signup photo is gone",
      "This phone cleared it before it could upload. Tap your picture to add it again.",
    );
    return null;
  }

  toast.loading("Adding your profile photo", "Uploading the photo you chose at signup…");
  try {
    const ref = await uploadAvatar(pending.uri);
    await clearPendingAvatar();
    toast.success("Profile photo added", "Looking good.");
    return ref;
  } catch (e) {
    // Transient: keep it and try again on a later launch, but say so.
    console.warn("[applyPendingAvatar] upload failed:", e);
    toast.error(
      "Couldn't add your profile photo",
      `${e instanceof Error ? e.message : "Please try again in a moment."} We'll retry next time you open the app.`,
    );
    return null;
  }
}


