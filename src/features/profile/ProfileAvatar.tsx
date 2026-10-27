// C:\OOTDify\src\features\profile\ProfileAvatar.tsx
// The user's profile photo as a circle: renders the real, owner-scoped avatar
// (signed URL), a local preview, or their initial. Shared by the home header,
// the profile hero and the signup wizard so all three stay identical.
//
// Interaction is opt-in:
//   * `onPress`   → tap runs that handler (the header opens Profile).
//   * `onChanged` → tap opens the take/choose-photo chooser (Profile).
//   * neither     → a plain visual (the signup preview).
// The camera badge is only drawn when explicitly asked for, so a display-only
// avatar never promises a capability it does not have.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { resolveMediaUrl } from "../../shared/lib/storageUrl";
import { changeProfileAvatar, promptAvatarSource } from "./avatar";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { useT } from "../../shared/i18n/useT";

interface Props {
  size?: number;
  initial: string;
  avatarRef: string | null;
  /** Local file to show instead of `avatarRef` (preview before an upload). */
  uri?: string | null;
  onChanged?: (ref: string) => void;
  onPress?: () => void;
  /** Draws the small camera badge — only meaningful with `onChanged`. */
  badge?: boolean;
  /** Forces the spinner (e.g. a wizard upload in flight). */
  busy?: boolean;
  background?: string;
  color?: string;
  /** Optional outline colour for the circle. */
  ring?: string;
  /** Colour of the camera badge's ring (matches the surface behind it). */
  badgeRing?: string;
  badgeBackground?: string;
  badgeColor?: string;
}

export function ProfileAvatar({
  size = 44,
  initial,
  avatarRef,
  uri,
  onChanged,
  onPress,
  badge = false,
  busy: busyProp = false,
  background,
  color,
  ring,
  badgeRing,
  badgeBackground,
  badgeColor,
}: Props) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const [resolved, setResolved] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  // Clear immediately when the ref is removed (render-phase adjust, so no
  // synchronous setState runs inside an effect).
  const [prevRef, setPrevRef] = useState<string | null>(avatarRef);
  if (avatarRef !== prevRef) {
    setPrevRef(avatarRef);
    if (!avatarRef) setResolved(null);
  }

  useEffect(() => {
    if (!avatarRef) return;
    let alive = true;
    resolveMediaUrl(avatarRef, 3600).then((u) => {
      if (alive) setResolved(u);
    });
    return () => {
      alive = false;
    };
  }, [avatarRef]);

  const shown = uri ?? resolved;
  const busy = picking || busyProp;

  const pick = (source: "library" | "camera") => {
    void (async () => {
      setPicking(true);
      const ref = await changeProfileAvatar(source);
      setPicking(false);
      if (ref) onChanged?.(ref);
    })();
  };

  const interactive = Boolean(onPress || onChanged);
  const handlePress = () => {
    if (busy) return;
    if (onPress) {
      onPress();
      return;
    }
    if (onChanged) promptAvatarSource(pick);
  };

  const badgeSize = Math.max(20, Math.round(size * 0.34));
  const initialSize = Math.round(size * 0.4);

  const effectiveBackground = background ?? theme.colors.primary;
  const effectiveColor = color ?? theme.colors.onPrimary;
  const effectiveBadgeRing = badgeRing ?? theme.colors.surface;
  const effectiveBadgeBackground = badgeBackground ?? theme.colors.primary;
  const effectiveBadgeColor = badgeColor ?? theme.colors.onPrimary;

  const inner = (
    <View
      style={[
        styles.clip,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: effectiveBackground,
          borderColor: ring ?? "transparent",
          borderWidth: ring ? 2 : 0,
        },
      ]}
    >
      {shown ? (
        <Image
          source={{ uri: shown }}
          style={{ width: size, height: size }}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <Text style={[styles.initial, { color: effectiveColor, fontSize: initialSize }]}>
          {initial || "?"}
        </Text>
      )}

      {busy ? (
        <View style={[styles.overlay, { borderRadius: size / 2 }]}>
          <ActivityIndicator size="small" color="#FFFFFF" />
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ width: size, height: size }}>
      {interactive ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={onPress ? t("profile.avatar.open_a11y") : t("profile.avatar.change_a11y")}
          onPress={handlePress}
          hitSlop={8}
          style={({ pressed }) => [styles.wrap, pressed && { opacity: 0.85 }]}
        >
          {inner}
        </Pressable>
      ) : (
        <View style={styles.wrap}>{inner}</View>
      )}

      {badge ? (
        <View
          pointerEvents="none"
          style={[
            styles.badge,
            {
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
              right: -1,
              bottom: -1,
              borderColor: effectiveBadgeRing,
              backgroundColor: effectiveBadgeBackground,
            },
          ]}
        >
          <Ionicons name="camera" size={Math.round(badgeSize * 0.52)} color={effectiveBadgeColor} />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  wrap: { alignItems: "center", justifyContent: "center" },
  clip: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  initial: { fontWeight: "700" },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,20,24,0.5)",
  },
  badge: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
}));