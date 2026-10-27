// C:\OOTDify\src\shared\components\ConfirmSheet.tsx
// A designed "are you sure?" for actions that can't be undone (unfriend,
// delete a My Day post), in place of the system alert. Same shape as the
// log-out sheet: a picture of what is affected, one plain sentence, keeping
// things as the prominent safe choice, and the destructive action outlined
// in red underneath.
import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { makeStyles } from "../theme/makeStyles";
import { useAppTheme } from "../theme/ThemeProvider";
import { AppButton } from "./AppButton";
import { Sheet } from "./Sheet";

export function ConfirmSheet({
  visible,
  onClose,
  icon,
  title,
  message,
  confirmLabel,
  cancelLabel,
  busy = false,
  onConfirm,
  hero,
}: {
  visible: boolean;
  onClose: () => void;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  /** What the action is about (e.g. the friend's photo); an icon badge otherwise. */
  hero?: ReactNode;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      busy={busy}
      icon={icon}
      title={title}
      scroll={false}
      footer={
        <View style={styles.actions}>
          <AppButton label={cancelLabel} onPress={onClose} disabled={busy} />
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={onConfirm}
            style={({ pressed }) => [styles.danger, (pressed || busy) && styles.dim]}
          >
            {busy ? (
              <ActivityIndicator size="small" color={theme.colors.danger} />
            ) : (
              <Ionicons name={icon} size={18} color={theme.colors.danger} />
            )}
            <Text style={styles.dangerText}>{confirmLabel}</Text>
          </Pressable>
        </View>
      }
    >
      <View style={styles.body}>
        {hero ?? (
          <View style={styles.badge}>
            <Ionicons name={icon} size={30} color={theme.colors.danger} />
          </View>
        )}
        <Text style={styles.message}>{message}</Text>
      </View>
    </Sheet>
  );
}

const useStyles = makeStyles((theme) => ({
  body: { alignItems: "center", gap: 14, paddingTop: 4 },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  message: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
    textAlign: "center",
    maxWidth: 320,
  },
  actions: { gap: 10 },
  danger: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.danger,
  },
  dangerText: { fontSize: 15, fontWeight: "600", color: theme.colors.danger },
  dim: { opacity: 0.6 },
}));
