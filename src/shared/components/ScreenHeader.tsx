// C:\OOTDify\src\shared\components\ScreenHeader.tsx
// Consistent monochrome screen header with optional actions.
//
// Two variants:
//   * "compact" (default) — title + subtitle, for screens pushed over the tabs;
//     pass `onBack` for a back arrow before the title.
//   * "tab" — top-level tabs: a hang-tag badge carrying the section's icon, a
//     display-weight title, and optional subtitle and meta lines.
import { Ionicons } from "@expo/vector-icons";
import { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { makeStyles } from "../theme/makeStyles";
import { useAppTheme } from "../theme/ThemeProvider";

interface Props {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  variant?: "compact" | "tab";
  /** Section icon on the hang tag ("tab" variant only). */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Short fact under the subtitle, e.g. "24 pieces" ("tab" variant only). */
  meta?: string;
  /** Shows a back arrow before the title ("compact" variant only). */
  onBack?: () => void;
  /** Accessibility label for the back arrow. */
  backLabel?: string;
}

export function ScreenHeader({
  title,
  subtitle,
  right,
  variant = "compact",
  icon,
  meta,
  onBack,
  backLabel,
}: Props) {
  const styles = useStyles();
  const theme = useAppTheme();

  if (variant === "tab") {
    return (
      <View style={styles.tabContainer}>
        <View style={styles.tabRow}>
          {icon ? (
            <View style={styles.tag} accessibilityElementsHidden importantForAccessibility="no">
              <View style={styles.tagHole} />
              <Ionicons name={icon} size={20} color={theme.colors.onPrimary} />
            </View>
          ) : null}
          <Text
            style={[styles.titleBlock, styles.tabTitle]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            accessibilityRole="header"
          >
            {title}
          </Text>
          {right ? <View style={styles.right}>{right}</View> : null}
        </View>
        {/* Full width under the tag row, so a long subtitle never squeezes the title or action. */}
        {subtitle ? (
          <Text style={[styles.subtitle, styles.tabSubtitle]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? <Text style={styles.meta} numberOfLines={1}>{meta}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          hitSlop={8}
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
        </Pressable>
      ) : null}
      <View style={styles.titleBlock}>
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

export function HeaderIconButton({
  icon,
  onPress,
  accessibilityLabel,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  /** Icon colour; defaults to the theme's text colour. */
  color?: string;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name={icon} size={22} color={color ?? theme.colors.text} />
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.md,
  },
  titleBlock: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: theme.colors.text,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginTop: 2,
    lineHeight: 18,
  },
  right: { flexShrink: 0 },
  iconButton: { padding: 6 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  tabContainer: {
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
  },
  tabRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  // Hang tag: squared top corners, rounded bottom, punched hole up top.
  tag: {
    width: 44,
    height: 52,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 9,
    transform: [{ rotate: "-4deg" }],
  },
  tagHole: {
    position: "absolute",
    top: 7,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.colors.background,
  },
  tabTitle: {
    ...theme.typography.display,
    fontSize: 30,
    lineHeight: 34,
    color: theme.colors.text,
  },
  tabSubtitle: { marginTop: 10, fontSize: 13.5, lineHeight: 19 },
  meta: {
    ...theme.typography.caption,
    fontWeight: "600",
    color: theme.colors.textMuted,
    marginTop: 6,
  },
}));
