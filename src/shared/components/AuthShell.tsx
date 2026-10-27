// C:\OOTDify\src\shared\components\AuthShell.tsx
// Presentational shell for the auth screens: a brand lockup, a large left-aligned
// title and a surface card for the form. It is drawn entirely from theme tokens
// on the page background (no `primary` slab), so Light, Dark and System look
// right everywhere and the status bar set by the root layout stays legible.
// Shared so login, signup and password reset stay identical.
import { Ionicons } from "@expo/vector-icons";
import { ReactNode, useEffect, useState } from "react";
import {
  Animated,
  Easing,
  Image,
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
    <View style={[styles.hero, { paddingTop: insets.top + 12 }]}>
      <View style={styles.topRow}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBack}
            hitSlop={8}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
          </Pressable>
        ) : (
          <View style={styles.backSpacer} />
        )}

        <View style={styles.brandRow}>
          <Image
            source={require("../../../assets/images/ootdify-icon.png")}
            style={styles.brandIcon}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <Text style={styles.brandName}>OOTDify</Text>
        </View>

        <View style={styles.backSpacer} />
      </View>

      <Text style={styles.heroTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.heroSubtitle}>{subtitle}</Text>
    </View>
  );
}

/** Surface card for the form; fades/slides in on mount. */
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
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  backSpacer: { width: 40, height: 40 },
  pressed: { opacity: 0.7 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandIcon: { width: 30, height: 30, borderRadius: 9 },
  brandName: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "800",
    letterSpacing: -1,
    marginTop: theme.spacing.xl,
  },
  heroSubtitle: {
    color: theme.colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    maxWidth: 320,
  },
  card: {
    marginHorizontal: theme.spacing.md,
    padding: 20,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
}));
