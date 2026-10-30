// C:\OOTDify\src\shared\components\ToastHost.tsx
// Renders the single active toast from the toast store. Mounted once near the
// root so every screen (and the avatar-upload service) shares one look: a light
// card where Penggi says the message. He "talks" when a toast arrives (quick
// head bobs with a tilt), keeps bobbing while something loads, and a small
// badge on his corner says what kind of message it is. Reduce Motion keeps
// him still.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Theme } from "../config/theme";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { buzz } from "../lib/haptics";
import { ToastRecord, ToastVariant, useToastStore } from "../lib/toast";
import { makeStyles } from "../theme/makeStyles";
import { useAppTheme } from "../theme/ThemeProvider";

// Resolved per render (not captured at module load) so the toast tinting
// follows appearance-mode swaps of `theme.colors` instead of freezing the
// boot palette. The palette is passed in because this is a plain function, not
// a component, so it cannot call a hook itself.
function toastMeta(
  variant: ToastVariant,
  theme: Theme,
): {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
} {
  switch (variant) {
    case "success":
      return { icon: "checkmark-circle", tint: theme.colors.success };
    case "error":
      return { icon: "alert-circle", tint: theme.colors.danger };
    case "info":
      return { icon: "information-circle", tint: theme.colors.brand };
    case "loading":
      return { icon: "sync", tint: theme.colors.textMuted };
  }
}

const PENGGI = require("../../../assets/images/toast-penggi.png");
const PENGGI_SIZE = 40;
/** Head bobs per "sentence" when a toast arrives. */
const TALK_BOBS = 4;

/** Penggi saying the toast: talks once on arrival, keeps bobbing while loading. */
function TalkingPenggi({ toastId, variant, tint }: { toastId: number; variant: ToastVariant; tint: string }) {
  const styles = useStyles();
  const theme = useAppTheme();
  const reduceMotion = useReduceMotion();
  const [talk] = useState(() => new Animated.Value(0));

  useEffect(() => {
    talk.setValue(0);
    if (reduceMotion) return;
    const bob = Animated.sequence([
      Animated.timing(talk, { toValue: 1, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(talk, { toValue: 0, duration: 140, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]);
    const anim =
      variant === "loading"
        ? Animated.loop(Animated.sequence([bob, Animated.delay(260)]))
        : Animated.loop(bob, { iterations: TALK_BOBS });
    anim.start();
    return () => anim.stop();
  }, [toastId, variant, talk, reduceMotion]);

  return (
    <View style={styles.penggi} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View
        style={{
          transform: [
            { translateY: talk.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) },
            { rotate: talk.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-7deg"] }) },
            { scaleY: talk.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) },
          ],
        }}
      >
        <Image source={PENGGI} style={styles.penggiImage} contentFit="contain" />
      </Animated.View>
      <View style={[styles.badge, { backgroundColor: variant === "loading" ? theme.colors.surface : tint }]}>
        {variant === "loading" ? (
          <ActivityIndicator size={10} color={tint} />
        ) : (
          <Ionicons
            name={variant === "success" ? "checkmark" : variant === "error" ? "alert" : "information"}
            size={10}
            color={theme.colors.onBrand}
          />
        )}
      </View>
    </View>
  );
}

export function ToastHost() {
  const styles = useStyles();
  const theme = useAppTheme();
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

  // A short buzz for outcomes (Settings > Vibration); info and loading stay still.
  useEffect(() => {
    if (current?.variant === "success" || current?.variant === "error") buzz(current.variant);
  }, [current]);

  useEffect(() => {
    if (!current || current.duration <= 0) return;
    const id = setTimeout(() => dismiss(current.id), current.duration);
    return () => clearTimeout(id);
  }, [current, dismiss]);

  if (!shown) return null;

  const meta = toastMeta(shown.variant, theme);

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
          <TalkingPenggi toastId={shown.id} variant={shown.variant} tint={meta.tint} />
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

const useStyles = makeStyles((theme) => ({
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
  penggi: { width: PENGGI_SIZE, height: PENGGI_SIZE },
  penggiImage: { width: PENGGI_SIZE, height: PENGGI_SIZE },
  badge: {
    position: "absolute",
    right: -3,
    bottom: -2,
    width: 17,
    height: 17,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: theme.colors.surface,
  },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 13.5, fontWeight: "600", color: theme.colors.text },
  message: { fontSize: 12, color: theme.colors.textMuted, marginTop: 1, lineHeight: 16 },
  action: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.brand,
  },
  actionText: { color: theme.colors.onBrand, fontWeight: "500", fontSize: 12.5 },
}));