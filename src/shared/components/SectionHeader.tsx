// C:\OOTDify\src\shared\components\SectionHeader.tsx
// Typography-led section heading with an optional trailing action. Not a card —
// hierarchy and whitespace carry the section.
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../config/theme";

interface Props {
  title: string;
  subtitle?: string;
  /** Trailing action label, e.g. "See all". Rendered as text + chevron. */
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, subtitle, actionLabel, onAction }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.textBlock}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          hitSlop={8}
          style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
          <Ionicons name="chevron-forward" size={15} color={theme.colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    marginTop: theme.spacing.section,
    marginBottom: theme.spacing.sm,
  },
  textBlock: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 12.5,
    color: theme.colors.textMuted,
    marginTop: 2,
    lineHeight: 17,
  },
  action: { flexDirection: "row", alignItems: "center", gap: 2, paddingBottom: 2 },
  actionText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.primary,
  },
});