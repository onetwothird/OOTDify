// C:\OOTDify\src\features\profile\ProfileAvatar.tsx
// Tappable profile photo: renders the real, owner-scoped avatar (signed URL) or
// the user's initial, and lets them take/choose a new photo in place. Used by
// the home header and the profile hero so both stay identical.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { theme } from "../../shared/config/theme";
import { resolveMediaUrl } from "../../shared/lib/storageUrl";
import { changeProfileAvatar, promptAvatarSource } from "./avatar";

export function ProfileAvatar({
  size = 44,
  initial,
  avatarRef,
  onChanged,
  background = theme.colors.primary,
  color = theme.colors.onPrimary,
  badgeRing = theme.colors.surface,
  badgeBackground = theme.colors.primary,
  badgeColor = theme.colors.onPrimary,
}: {
  size?: number;
  initial: string;
  avatarRef: string | null;
  onChanged?: (ref: string) => void;
  background?: string;
  color?: string;
  /** Colour of the small camera badge's ring (matches the surface behind it). */
  badgeRing?: string;
  badgeBackground?: string;
  badgeColor?: string;
}) {
  const [uri, setUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Clear immediately when the ref is removed (render-phase adjust, so no
  // synchronous setState runs inside an effect).
  const [prevRef, setPrevRef] = useState<string | null>(avatarRef);
  if (avatarRef !== prevRef) {
    setPrevRef(avatarRef);
    if (!avatarRef) setUri(null);
  }

  useEffect(() => {
    if (!avatarRef) return;
    let alive = true;
    resolveMediaUrl(avatarRef, 3600).then((u) => {
      if (alive) setUri(u);
    });
    return () => {
      alive = false;
    };
  }, [avatarRef]);

  const pick = (source: "library" | "camera") => {
    void (async () => {
      setBusy(true);
      const ref = await changeProfileAvatar(source);
      setBusy(false);
      if (ref) onChanged?.(ref);
    })();
  };

  const badge = Math.round(size * 0.4);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Change profile photo"
      onPress={() => {
        if (!busy) promptAvatarSource(pick);
      }}
      hitSlop={8}
      style={({ pressed }) => [
        styles.wrap,
        { width: size, height: size },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View
        style={[
          styles.clip,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: background },
        ]}
      >
        {uri ? (
          <Image
            source={{ uri }}
            style={{ width: size, height: size }}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <Text style={[styles.initial, { color, fontSize: Math.round(size * 0.4) }]}>
            {initial || "?"}
          </Text>
        )}

        {busy ? (
          <View style={[styles.overlay, { borderRadius: size / 2 }]}>
            <ActivityIndicator size="small" color={theme.colors.onPrimary} />
          </View>
        ) : null}
      </View>

      <View
        style={[
          styles.badge,
          {
            width: badge,
            height: badge,
            borderRadius: badge / 2,
            right: -2,
            bottom: -2,
            borderColor: badgeRing,
            backgroundColor: badgeBackground,
          },
        ]}
      >
        <Ionicons name="camera" size={Math.round(badge * 0.55)} color={badgeColor} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  clip: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  initial: { fontWeight: "800" },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,17,17,0.45)",
  },
  badge: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
});
