// C:\OOTDify\src\shared\components\ToastHost.tsx
// Renders the single active toast from the toast store. Mounted once near the
// root so every screen (and the avatar-upload service) shares one look: a light
// card with a tinted icon tile — the same card language as the rest of the app.
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "../config/theme";
import { ToastRecord, ToastVariant, useToastStore } from "../lib/toast";

const META: Record<ToastVariant, { icon: keyof typeof Ionicons.glyphMap; tint: string }> = {
  success: { icon: "checkmark-circle", tint: theme.colors.success },
  error: { icon: "alert-circle", tint: theme.colors.danger },
  info: { icon: "information-circle", tint: theme.colors.primary },
  loading: { icon: "sync", tint: theme.colors.textMuted },
};

export function ToastHost() {
  const current = useToastStore((s) => s.current);
  const dismiss = useToastStore((s) => s.dismiss);
  const insets = useSafeAreaInsets();

  const [anim] = useState(() => new Animated.Value(0));
  const [shown, setShown] = useState<ToastRecord | null>(null);

  // Adopt / release the active toast during render (adjusting state while
  // rendering), so no synchronous setState runs inside an effect body.
  const [seen, setSeen] = useState<ToastRecord | null>(null);
  if (current !== seen) {
    setSeen(current);
    if (current) setShown(current);
  }

  useEffect(() => {
    if (current) {
      Animated.spring(anim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 18,
        stiffness: 220,
        mass: 0.7,
      }).start();
    } else if (shown) {
      Animated.timing(anim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setShown(null);
      });
    }
  }, [current, shown, anim]);

  useEffect(() => {
    if (!current || current.duration <= 0) return;
    const id = setTimeout(() => dismiss(current.id), current.duration);
    return () => clearTimeout(id);
  }, [current, dismiss]);

  if (!shown) return null;

  const meta = META[shown.variant];

  return (
    <View style={[styles.layer, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.animWrap,
          {
            opacity: anim,
            transform: [
              {
                translateY: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-16, 0],
                }),
              },
            ],
          },
        ]}
      >
        <Pressable
          accessibilityRole="alert"
          accessibilityLabel={`${shown.title}${shown.message ? `. ${shown.message}` : ""}`}
          onPress={() => dismiss(shown.id)}
          style={styles.card}
        >
          <View style={styles.tile}>
            {shown.variant === "loading" ? (
              <ActivityIndicator size="small" color={meta.tint} />
            ) : (
              <Ionicons name={meta.icon} size={18} color={meta.tint} />
            )}
          </View>
          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={2}>
              {shown.title}
            </Text>
            {shown.message ? (
              <Text style={styles.message} numberOfLines={2}>
                {shown.message}
              </Text>
            ) : null}
          </View>
          {shown.action ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={shown.action.label}
              onPress={() => {
                dismiss(shown.id);
                shown.action?.onPress();
              }}
              hitSlop={6}
              style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.actionText}>{shown.action.label}</Text>
            </Pressable>
          ) : shown.variant === "loading" ? null : (
            <Ionicons name="close" size={16} color={theme.colors.textMuted} />
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    alignItems: "center",
    zIndex: 1000,
    elevation: 1000,
  },
  animWrap: { width: "100%", maxWidth: 520 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    paddingVertical: 11,
    paddingHorizontal: 13,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  tile: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 13.5, fontWeight: "700", color: theme.colors.text },
  message: { fontSize: 12, color: theme.colors.textMuted, marginTop: 1, lineHeight: 16 },
  action: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.primary,
  },
  actionText: { color: theme.colors.onPrimary, fontWeight: "700", fontSize: 12.5 },
});
