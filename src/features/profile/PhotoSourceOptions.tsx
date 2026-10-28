// C:\OOTDify\src\features\profile\PhotoSourceOptions.tsx
// The two ways to set a profile photo, as tappable cards (the same look as the
// status picker on the Friends tab). Shared by every place that changes it.
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { useT } from "../../shared/i18n/useT";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import type { AvatarSource } from "./avatar";

export function PhotoSourceOptions({
  busy,
  locked = false,
  onPick,
}: {
  /** The source being uploaded right now; both cards lock while it runs. */
  busy: AvatarSource | null;
  /** Locks both cards without a spinner (something else is in progress). */
  locked?: boolean;
  onPick: (source: AvatarSource) => void;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();

  const options: { source: AvatarSource; icon: keyof typeof Ionicons.glyphMap; title: string; hint: string }[] = [
    {
      source: "camera",
      icon: "camera-outline",
      title: t("home.photo_sheet.take"),
      hint: t("home.photo_sheet.take_hint"),
    },
    {
      source: "library",
      icon: "images-outline",
      title: t("home.photo_sheet.library"),
      hint: t("home.photo_sheet.library_hint"),
    },
  ];

  return (
    <View style={styles.list}>
      {options.map((o) => (
        <Pressable
          key={o.source}
          accessibilityRole="button"
          disabled={busy !== null || locked}
          onPress={() => onPick(o.source)}
          style={({ pressed }) => [styles.row, (busy !== null && busy !== o.source || locked && busy === null) && styles.dim, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.icon}>
            {busy === o.source ? (
              <ActivityIndicator size="small" color={theme.colors.brand} />
            ) : (
              <Ionicons name={o.icon} size={21} color={theme.colors.brand} />
            )}
          </View>
          <View style={styles.text}>
            <Text style={styles.title}>{o.title}</Text>
            <Text style={styles.hint}>{o.hint}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  list: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  dim: { opacity: 0.5 },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primaryMuted,
  },
  text: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: "600", color: theme.colors.text },
  hint: { fontSize: 12.5, color: theme.colors.textMuted, marginTop: 1 },
}));
