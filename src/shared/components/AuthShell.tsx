// C:\OOTDify\src\shared\components\AuthShell.tsx
// Presentational shell for the auth screens: a wordmark, a large left-aligned
// title and the form card hung from a clothes rail (matching the landing
// page; see ClothesRail.tsx). Drawn entirely from theme tokens. Shared so
// login, signup and password reset stay identical.
import { Ionicons } from "@expo/vector-icons";
import { ReactNode } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Rail, useSwing } from "./ClothesRail";
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

        <Text style={styles.brandName}>OOTDify</Text>

        <View style={styles.backSpacer} />
      </View>

      <Text style={styles.heroTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.heroSubtitle}>{subtitle}</Text>
    </View>
  );
}

// Where the card's two strings loop over the rail, as fractions of its width.
const CARD_RINGS = [0.18, 0.82];

/**
 * The form card, hung from a rail on two strings like a garment tag. It swings
 * a few degrees into place once on mount (skipped under Reduce Motion).
 */
export function AuthCard({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const rotate = useSwing({ from: 4, rest: 0, duration: 900 });

  return (
    <View style={styles.cardWrap}>
      <Rail rings={CARD_RINGS} />
      <Animated.View style={[styles.hung, { transform: [{ rotate }] }]}>
        <View style={styles.strings}>
          {CARD_RINGS.map((at) => (
            <View key={at} style={[styles.string, { left: `${at * 100}%` }]} />
          ))}
        </View>
        <View style={styles.card}>
          {CARD_RINGS.map((at) => (
            <View key={at} style={[styles.hole, { left: `${at * 100}%` }]} />
          ))}
          {children}
        </View>
      </Animated.View>
    </View>
  );
}

const STRING = 22;
const HOLE = 10;

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
  cardWrap: { marginHorizontal: theme.spacing.md },
  hung: { transformOrigin: "top" },
  strings: { height: STRING },
  string: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth * 2,
    marginLeft: -StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.textMuted,
  },
  card: {
    padding: 20,
    paddingTop: 20 + HOLE + 6,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  // The punched holes the strings pass through.
  hole: {
    position: "absolute",
    top: 10,
    width: HOLE,
    height: HOLE,
    marginLeft: -HOLE / 2,
    borderRadius: HOLE / 2,
    backgroundColor: theme.colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
}));
