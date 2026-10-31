// C:\OOTDify\src\features\notifications\NotificationBell.tsx
// The notifications bell, shown in the header's quick actions beside the
// Settings gear. Its badge is the unread count (99+ past 99), and it gives a
// small ring when a new notification arrives.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";

import { useReduceMotion } from "../../shared/hooks/useReduceMotion";
import { useT } from "../../shared/i18n/useT";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { useNotificationsStore } from "./store";

export function NotificationBell({
  size = 44,
  flat = false,
  color,
  badgeRing,
}: {
  size?: number;
  /** Inside a container that already draws the surface (the quick actions pill). */
  flat?: boolean;
  /** Icon colour; the text colour by default. */
  color?: string;
  /** The badge's outline, matching whatever the bell sits on. */
  badgeRing?: string;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const router = useRouter();
  const { t } = useT();
  const reduceMotion = useReduceMotion();
  const unread = useNotificationsStore((s) => s.unread);
  const [swing] = useState(() => new Animated.Value(0));
  const [lastUnread, setLastUnread] = useState(unread);

  // Ring once each time the count goes up (render-phase compare, no refs).
  const [ringKey, setRingKey] = useState(0);
  if (unread !== lastUnread) {
    setLastUnread(unread);
    if (unread > lastUnread) setRingKey((k) => k + 1);
  }
  useEffect(() => {
    if (!ringKey || reduceMotion) return;
    swing.setValue(0);
    const anim = Animated.timing(swing, {
      toValue: 1,
      duration: 700,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [ringKey, reduceMotion, swing]);

  const rotate = swing.interpolate({
    inputRange: [0, 0.15, 0.35, 0.55, 0.75, 1],
    outputRange: ["0deg", "16deg", "-13deg", "9deg", "-5deg", "0deg"],
  });
  const label = unread > 99 ? "99+" : String(unread);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread ? t("notifications.bell_a11y_unread", { count: unread }) : t("notifications.title")}
      hitSlop={6}
      onPress={() => router.push("/notifications")}
      style={({ pressed }) => [
        flat ? styles.flat : styles.bell,
        { width: size, height: size, borderRadius: size / 2 },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Animated.View style={[styles.icon, { transform: [{ rotate }] }]}>
        <Ionicons name={unread ? "notifications" : "notifications-outline"} size={21} color={color ?? theme.colors.text} />
      </Animated.View>
      {unread > 0 ? (
        <View style={[styles.badge, badgeRing ? { borderColor: badgeRing } : null]}>
          <Text style={styles.badgeText}>{label}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  bell: {
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
  flat: { alignItems: "center", justifyContent: "center" },
  // Swings from the top, like a real bell.
  icon: { transformOrigin: "50% 15%" },
  badge: {
    position: "absolute",
    top: -3,
    right: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.danger,
    borderWidth: 2,
    borderColor: theme.colors.background,
  },
  badgeText: { fontSize: 10.5, fontWeight: "700", color: theme.colors.surface },
}));
