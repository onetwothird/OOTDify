// C:\OOTDify\src\features\profile\avatar.ts
// Profile-picture helpers: pick a photo → upload to the PRIVATE `avatars`
// bucket (owner-only RLS) → persist the ref on the user's profile row through
// the backend. Nothing here fabricates an image: the stored ref only changes
// when the upload and the profile PATCH both succeed.
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";

import { updateProfile } from "../../services/aiApi";
import { supabase } from "../../shared/lib/supabase";
import { toast } from "../../shared/lib/toast";

export type AvatarSource = "library" | "camera";

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

/** Pick (or shoot) a square photo. Returns the local URI, or null if cancelled. */
export async function pickAvatarPhoto(source: AvatarSource): Promise<string | null> {
  if (source === "camera") {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Camera access needed",
        "We only use the camera for the profile photo you choose to take.",
      );
      return null;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });
    return result.canceled ? null : result.assets?.[0]?.uri ?? null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.7,
    allowsEditing: true,
    aspect: [1, 1],
  });
  return result.canceled ? null : result.assets?.[0]?.uri ?? null;
}

/**
 * Full flow: pick → upload → persist. Shows a themed progress toast that turns
 * into a success or error toast, and returns the new stored ref on success (or
 * null when the user cancelled).
 */
export async function changeProfileAvatar(source: AvatarSource): Promise<string | null> {
  const uri = await pickAvatarPhoto(source);
  if (!uri) return null;

  toast.loading("Updating profile photo", "Uploading to your private area…");
  try {
    const ref = await uploadAvatar(uri);
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
