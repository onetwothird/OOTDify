// C:\OOTDify\src\features\notifications\QuickActions.tsx
// The notifications bell and the Settings gear side by side in one small pill.
// It sits in the top corner of each tab's header (tone "header": white on the
// dark-mode night sky, a light pill on the light-mode sky), or on the page on
// Home.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { useT } from "../../shared/i18n/useT";
import { useHeaderSky } from "../../shared/components/PenggiHeader";
import { mixHex } from "../../shared/lib/mixHex";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { NotificationBell } from "./NotificationBell";

const BUTTON = 38;

export function QuickActions({ tone = "default" }: { tone?: "default" | "header" }) {
  const styles = useStyles();
  const theme = useAppTheme();
  const router = useRouter();
  const { t } = useT();
  const sky = useHeaderSky();
  const onSky = tone === "header" && sky.dark;
  const fill = onSky ? mixHex(theme.colors.feature, theme.colors.onFeature, 0.14) : theme.colors.surface;
  const ink = onSky ? theme.colors.onFeature : theme.colors.text;
  const line = onSky ? mixHex(theme.colors.feature, theme.colors.onFeature, 0.28) : theme.colors.border;

  return (
    <View style={[styles.pill, { backgroundColor: fill, borderColor: line }]}>
      <NotificationBell size={BUTTON} flat color={ink} badgeRing={fill} />
      <View style={[styles.divider, { backgroundColor: line }]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("home.settings_a11y")}
        hitSlop={6}
        onPress={() => router.push("/settings/general")}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Ionicons name="settings-outline" size={20} color={ink} />
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  pill: {
    height: BUTTON + 4,
    paddingHorizontal: 2,
    borderRadius: (BUTTON + 4) / 2,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
  },
  divider: { width: StyleSheet.hairlineWidth, height: 18 },
  button: { width: BUTTON, height: BUTTON, borderRadius: BUTTON / 2, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.7 },
}));
