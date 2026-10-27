// C:\OOTDify\src\shared\components\AuthShell.tsx
// Presentational shell for the auth screens: a full-bleed dark hero (brand +
// title) that bleeds under the status bar, with a light card overlapping its
// bottom edge and a short entrance animation. Pure layout/styling — no data,
// no placeholder content. Shared so login, signup and password reset stay
// pixel-identical without duplicating the composition three times.
import { Ionicons } from "@expo/vector-icons";
import { ReactNode, useEffect, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles } from "../theme/makeStyles";
import { useAppTheme } from "../theme/ThemeProvider";

interface HeroProps {
  title: string;
  subtitle: string;
  /** Omit on screens with nothing to go back to (e.g. the landing page). */
  onBack?: () => void;
}

export function AuthHero({ title, subtitle, onBack }: HeroProps) {
  const styles = useStyles();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.hero, { paddingTop: insets.top + 10 }]}>
      {/* Decorative washes — plain views (no gradients, no images). */}
      <View style={[styles.blob, styles.blobA]} pointerEvents="none" />
      <View style={[styles.blob, styles.blobB]} pointerEvents="none" />

      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={onBack}
          hitSlop={8}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <Ionicons name="arrow-back" size={20} color={theme.colors.onPrimary} />
        </Pressable>
      ) : null}

      <View style={styles.brandRow}>
        <View style={styles.brandTile}>
          <Ionicons name="shirt-outline" size={15} color={theme.colors.onPrimary} />
        </View>
        <Text style={styles.brandName}>OOTDify</Text>
      </View>

      <Text style={styles.heroTitle}>{title}</Text>
      <Text style={styles.heroSubtitle}>{subtitle}</Text>
    </View>
  );
}

/** Light card that overlaps the hero and fades/slides in on mount. */
export function AuthCard({ children }: { children: ReactNode }) {
  // Lazy state holds one Animated.Value for the lifetime of the screen. A ref
  // would be equivalent at runtime but reads as a render-time access here.
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 380,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress]);

  const styles = useStyles();

  return (
    <Animated.View
      style={[
        styles.card,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [18, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const useStyles = makeStyles((theme) => ({
  hero: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: 66,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: "hidden",
  },
  blob: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: theme.colors.onPrimaryFaint,
  },
  blobA: { width: 230, height: 230, top: -90, right: -70 },
  blobB: {
    width: 150,
    height: 150,
    bottom: -60,
    left: -50,
    backgroundColor: theme.colors.onPrimaryFaint,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.onPrimarySubtle,
  },
  pressed: { opacity: 0.7 },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: theme.spacing.lg,
  },
  brandTile: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.onPrimarySubtle,
  },
  brandName: {
    color: theme.colors.onPrimary,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  heroTitle: {
    color: theme.colors.onPrimary,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
    letterSpacing: -0.8,
    marginTop: 18,
  },
  heroSubtitle: {
    color: theme.colors.onPrimaryMuted,
    fontSize: 14.5,
    lineHeight: 21,
    marginTop: 8,
    maxWidth: 320,
  },
  card: {
    marginTop: -42,
    marginHorizontal: theme.spacing.md,
    padding: 20,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 6,
  },
}));