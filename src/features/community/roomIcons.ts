// C:\OOTDify\src\features\community\roomIcons.ts
// The preset icons a community room can use instead of a photo or its
// initials. Each key is an Ionicons glyph name and is stored as-is in
// conversations.icon_preset (format enforced by migration 20261028130000).
// Pure: no React Native imports, so Jest can test it.
import type { Ionicons } from "@expo/vector-icons";

export const ROOM_ICON_PRESETS = [
  "shirt",
  "sparkles",
  "heart",
  "star",
  "diamond",
  "glasses",
  "color-palette",
  "camera",
  "flame",
  "leaf",
  "sunny",
  "moon",
  "cafe",
  "musical-notes",
  "basketball",
  "airplane",
] as const satisfies readonly (keyof typeof Ionicons.glyphMap)[];

export type RoomIconPreset = (typeof ROOM_ICON_PRESETS)[number];

/** The preset for a stored key, or null when it is empty or not one we ship. */
export function roomIconPreset(key: string | null | undefined): RoomIconPreset | null {
  return (ROOM_ICON_PRESETS as readonly string[]).includes(key ?? "") ? (key as RoomIconPreset) : null;
}

export const ROOM_TITLE_MAX = 60;

/** A community name ready to save, or the message to show when it can't be. */
export function cleanRoomTitle(raw: string): { ok: true; title: string } | { ok: false; error: string } {
  const title = raw.trim();
  if (!title) return { ok: false, error: "Give your community a name" };
  if (title.length > ROOM_TITLE_MAX) return { ok: false, error: "Keep the name under 60 characters" };
  return { ok: true, title };
}
