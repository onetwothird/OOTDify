// C:\OOTDify\src\features\capture\CreateMenu.tsx
// The Create (+) button that sits last in the tab bar, after Profile, and the menu
// it opens. Tapping + turns it into an × and fans out the three ways to make
// something above the tab bar: add a piece, pick an outfit, or try one on.
// The button is the tab bar's item; the menu is drawn over the page once by
// the tabs layout. Both read useCreateMenuStore.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useReduceMotion } from "../../shared/hooks/useReduceMotion";
import { useT } from "../../shared/i18n/useT";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { useCaptureModalStore } from "./captureModalStore";
import { useCreateMenuStore } from "./createMenuStore";

const PLUS_W = 54;
const PLUS_H = 40;
const SMALL = 46;
const GAP = 12;

type Action = { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; run: () => void };

/** 0 → 1 as the menu opens; shared by the button's turn and the fan-out. */
function useMenuProgress(open: boolean) {
  const reduceMotion = useReduceMotion();
  const [progress] = useState(() => new Animated.Value(open ? 1 : 0));
  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(open ? 1 : 0);
      return;
    }
    const anim = Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: open ? 320 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [open, progress, reduceMotion]);
  return progress;
}

/** The (+) tab bar item. It opens the menu instead of switching tabs. */
export function CreateTabButton({ style }: { style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const open = useCreateMenuStore((s) => s.open);
  const toggle = useCreateMenuStore((s) => s.toggle);
  const progress = useMenuProgress(open);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={open ? t("common.close") : t("tab.create")}
      accessibilityState={{ expanded: open }}
      onPress={toggle}
      style={[style, styles.tabItem]}
    >
      {({ pressed }) => (
        <>
          <View style={[styles.plus, pressed && styles.pressed]}>
            <Animated.View
              style={{
                transform: [{ rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "45deg"] }) }],
              }}
            >
              <Ionicons name="add" size={30} color={theme.colors.onBrand} />
            </Animated.View>
          </View>
          <Text style={styles.tabLabel}>{t("tab.create")}</Text>
        </>
      )}
    </Pressable>
  );
}

/** The fanned-out choices and the scrim behind them. */
export function CreateMenu({
  bottom,
  slide,
}: {
  /** Where the lowest choice sits, measured from the screen's bottom. */
  bottom: number;
  /** How far the tab bar has slid down; the choices follow it. */
  slide: Animated.AnimatedInterpolation<number>;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const router = useRouter();
  const { t } = useT();
  const openCapture = useCaptureModalStore((s) => s.open);
  const open = useCreateMenuStore((s) => s.open);
  const close = useCreateMenuStore((s) => s.close);
  const progress = useMenuProgress(open);

  const actions: Action[] = [
    { key: "piece", icon: "camera-outline", label: t("create_menu.add_piece"), run: openCapture },
    { key: "pick", icon: "sparkles-outline", label: t("create_menu.pick_outfit"), run: () => router.push("/ai-picker") },
    { key: "try", icon: "body-outline", label: t("create_menu.try_on"), run: () => router.push("/(tabs)/scan") },
  ];

  const choose = (action: Action) => {
    close();
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
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        />
      </Animated.View>

      {/* The choices rise out of the tab bar one after another, nearest first. */}
      <Animated.View
        style={[styles.actions, { bottom, transform: [{ translateY: slide }] }]}
        pointerEvents="box-none"
      >
        {actions.map((action, i) => {
          const fromBar = actions.length - 1 - i;
          const start = fromBar * 0.15;
          const enter = { inputRange: [start, start + 0.55], extrapolate: "clamp" as const };
          return (
            <Animated.View
              key={action.key}
              pointerEvents={open ? "auto" : "none"}
              style={{
                opacity: progress.interpolate({ ...enter, outputRange: [0, 1] }),
                transform: [
                  { translateY: progress.interpolate({ ...enter, outputRange: [18 + fromBar * 14, 0] }) },
                  { scale: progress.interpolate({ ...enter, outputRange: [0.85, 1] }) },
                ],
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
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  scrim: { backgroundColor: theme.colors.background },
  pressed: { opacity: 0.8 },
  tabItem: { flex: 1, alignItems: "center", justifyContent: "center" },
  plus: {
    width: PLUS_W,
    height: PLUS_H,
    borderRadius: PLUS_H / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.brand,
  },
  tabLabel: { fontSize: 10, fontWeight: "500", marginTop: 1, color: theme.colors.textMuted },
  actions: {
    position: "absolute",
    right: theme.spacing.page,
    alignItems: "flex-end",
    gap: GAP,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.text,
  },
  actionIcon: {
    width: SMALL,
    height: SMALL,
    borderRadius: SMALL / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
}));
