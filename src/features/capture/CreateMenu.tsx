// C:\OOTDify\src\features\capture\CreateMenu.tsx
// The floating (+) above the tab bar, with the Settings gear just above it.
// Tapping + turns it into an × and fans out the three ways to make something:
// add a piece, pick an outfit, or try one on. Rendered once by the tabs
// layout, over every tab, and slides down with the tab bar while scrolling.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";

import { useReduceMotion } from "../../shared/hooks/useReduceMotion";
import { useT } from "../../shared/i18n/useT";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { useCaptureModalStore } from "./captureModalStore";

const FAB = 58;

type Action = { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; run: () => void };

export function CreateMenu({
  bottom,
  slide,
}: {
  bottom: number;
  /** How far the tab bar has slid down; the stack follows it. */
  slide: Animated.AnimatedInterpolation<number>;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const router = useRouter();
  const { t } = useT();
  const reduceMotion = useReduceMotion();
  const openCapture = useCaptureModalStore((s) => s.open);
  const [open, setOpen] = useState(false);
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(open ? 1 : 0);
      return;
    }
    const anim = Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: open ? 240 : 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [open, progress, reduceMotion]);

  const actions: Action[] = [
    { key: "piece", icon: "camera-outline", label: t("create_menu.add_piece"), run: openCapture },
    { key: "pick", icon: "sparkles-outline", label: t("create_menu.pick_outfit"), run: () => router.push("/ai-picker") },
    { key: "try", icon: "body-outline", label: t("create_menu.try_on"), run: () => router.push("/(tabs)/scan") },
  ];

  const choose = (action: Action) => {
    setOpen(false);
    action.run();
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Fades the page so the choices stand out; tapping it closes the menu. */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.scrim, { opacity: progress }]}
        pointerEvents={open ? "auto" : "none"}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        />
      </Animated.View>

      <Animated.View style={[styles.stack, { bottom, transform: [{ translateY: slide }] }]} pointerEvents="box-none">
        {actions.map((action, i) => {
          // The nearest choice arrives first; each sits a little further out.
          const rise = (actions.length - i) * 14;
          return (
            <Animated.View
              key={action.key}
              pointerEvents={open ? "auto" : "none"}
              style={{
                opacity: progress,
                transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }) }],
              }}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => choose(action)}
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}
              >
                <Text style={styles.actionLabel}>{action.label}</Text>
                <View style={styles.actionIcon}>
                  <Ionicons name={action.icon} size={20} color={theme.colors.text} />
                </View>
              </Pressable>
            </Animated.View>
          );
        })}

        {/* Settings rides above +, out of the way while the menu is open. */}
        <Animated.View
          pointerEvents={open ? "none" : "auto"}
          style={{ opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("home.settings_a11y")}
            onPress={() => router.push("/settings/general")}
            style={({ pressed }) => [styles.settingsBtn, pressed && styles.pressed]}
          >
            <Ionicons name="settings-outline" size={21} color={theme.colors.text} />
          </Pressable>
        </Animated.View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={open ? t("common.close") : t("tab.create")}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((o) => !o)}
          style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
        >
          <Animated.View
            style={{
              transform: [{ rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "45deg"] }) }],
            }}
          >
            <Ionicons name="add" size={32} color={theme.colors.onPrimary} />
          </Animated.View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  scrim: { backgroundColor: theme.colors.background },
  stack: {
    position: "absolute",
    right: theme.spacing.page,
    alignItems: "flex-end",
    gap: 12,
  },
  pressed: { opacity: 0.8 },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.text,
  },
  actionIcon: {
    width: 46,
    height: 46,
    marginRight: (FAB - 46) / 2,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  settingsBtn: {
    width: 46,
    height: 46,
    marginRight: (FAB - 46) / 2,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  fab: {
    width: FAB,
    height: FAB,
    borderRadius: FAB / 2,
    marginTop: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
}));
