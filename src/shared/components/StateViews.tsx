// C:\OOTDify\src\shared\components\StateViews.tsx
// Empty / error states with actions. No hardcoded pixel sizes.
//
// The empty state is the header's hang tag drawn as a dashed outline — an
// unfilled tag reads as "nothing on this hanger yet" — with one clear action.
import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { useT } from "../i18n/useT";
import { makeStyles } from "../theme/makeStyles";
import { useAppTheme } from "../theme/ThemeProvider";

export function EmptyState({
  icon = "file-tray-outline",
  title,
  message,
  actionLabel,
  actionIcon,
  onAction,
  compact = false,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  /** Leading icon on the action button, e.g. "add" or "camera". */
  actionIcon?: keyof typeof Ionicons.glyphMap;
  onAction?: () => void;
  /** Tighter vertical padding, for empty states followed by more content. */
  compact?: boolean;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  return (
    <View style={[styles.box, compact && styles.boxCompact]} testID="empty-state">
      <View style={styles.tag} accessibilityElementsHidden importantForAccessibility="no">
        <View style={styles.tagHole} />
        <Ionicons name={icon} size={26} color={theme.colors.textMuted} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [styles.button, styles.emptyButton, pressed && styles.buttonPressed]}
        >
          {actionIcon ? <Ionicons name={actionIcon} size={17} color={theme.colors.onPrimary} /> : null}
          <Text style={[styles.buttonText, styles.emptyButtonText]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  return (
    <View style={styles.box} testID="error-state">
      <View style={[styles.tag, styles.tagError]} accessibilityElementsHidden importantForAccessibility="no">
        <View style={styles.tagHole} />
        <Ionicons name="alert-circle-outline" size={26} color={theme.colors.danger} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {t("common.error.title")}
      </Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Ionicons name="refresh" size={17} color={theme.colors.onBrand} />
          <Text style={styles.buttonText}>{t("common.retry")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  box: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 44,
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  boxCompact: { paddingVertical: 20 },
  // Same silhouette as ScreenHeader's tag, outlined instead of filled.
  tag: {
    width: 58,
    height: 68,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: theme.colors.textMuted,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 12,
    marginBottom: theme.spacing.sm,
    transform: [{ rotate: "-4deg" }],
  },
  tagError: { borderColor: theme.colors.danger },
  tagHole: {
    position: "absolute",
    top: 9,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: theme.colors.textMuted,
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: theme.colors.text,
    textAlign: "center",
  },
  message: {
    fontSize: 13.5,
    color: theme.colors.textMuted,
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 300,
  },
  button: {
    marginTop: theme.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 22,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.brand,
  },
  // The empty state's invitation: a light denim tint with denim ink and a
  // denim outline, so it stands apart from the app's solid blue buttons.
  emptyButton: {
    backgroundColor: theme.colors.primary,
    borderWidth: 1.5,
    borderColor: theme.colors.brand,
  },
  emptyButtonText: { color: theme.colors.onPrimary },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: theme.colors.onBrand, fontWeight: "600", fontSize: 14.5 },
}));
