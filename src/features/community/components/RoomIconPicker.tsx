// C:\OOTDify\src\features\community\components\RoomIconPicker.tsx
// Choose a community's icon: a photo (camera or gallery), one of the preset
// icons, or the initials of its name. A large live preview shows the result
// exactly as the Communities list will. Controlled: the caller saves.
import { Ionicons } from "@expo/vector-icons";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { pickAvatarPhoto, type AvatarSource } from "../../profile/avatar";
import type { TranslationKey } from "../../../shared/i18n/translate";
import { useT } from "../../../shared/i18n/useT";
import { makeStyles } from "../../../shared/theme/makeStyles";
import { useAppTheme } from "../../../shared/theme/ThemeProvider";
import { ROOM_ICON_PRESETS, type RoomIconPreset } from "../roomIcons";
import { RoomIcon } from "./RoomIcon";

export type RoomIconChoice =
  | { kind: "initials" }
  | { kind: "preset"; preset: RoomIconPreset }
  /** `uri` is a new local file, or the room's current photo URL. */
  | { kind: "photo"; uri: string; isNew: boolean };

const PREVIEW = 72;
const SWATCH = 44;

export function RoomIconPicker({
  title,
  value,
  onChange,
  disabled = false,
}: {
  title: string;
  value: RoomIconChoice;
  onChange: (next: RoomIconChoice) => void;
  disabled?: boolean;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();

  const pick = (source: AvatarSource) => {
    void (async () => {
      const picked = await pickAvatarPhoto(source, "square");
      if (picked) onChange({ kind: "photo", uri: picked.uri, isNew: true });
    })();
  };

  const choosePhoto = () => {
    Alert.alert(t("community.room_icon.photo_title"), undefined, [
      { text: t("community.room_icon.take_photo"), onPress: () => pick("camera") },
      { text: t("community.room_icon.from_library"), onPress: () => pick("library") },
      { text: t("community.room_icon.cancel"), style: "cancel" },
    ]);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <RoomIcon
          size={PREVIEW}
          title={title}
          iconUrl={value.kind === "photo" ? value.uri : null}
          iconPreset={value.kind === "preset" ? value.preset : null}
        />
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={choosePhoto}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <Ionicons name="image-outline" size={17} color={theme.colors.text} />
            <Text style={styles.actionText}>
              {value.kind === "photo" ? t("community.room_icon.change_photo") : t("community.room_icon.choose_photo")}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: value.kind === "initials" }}
            disabled={disabled || value.kind === "initials"}
            onPress={() => onChange({ kind: "initials" })}
            style={({ pressed }) => [
              styles.action,
              value.kind === "initials" && styles.actionCurrent,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="text-outline" size={17} color={theme.colors.text} />
            <Text style={styles.actionText}>{t("community.room_icon.initials")}</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.label}>{t("community.room_icon.presets_label")}</Text>
      <View style={styles.grid}>
        {ROOM_ICON_PRESETS.map((preset) => {
          const active = value.kind === "preset" && value.preset === preset;
          const name = t(`community.room_icon.preset.${preset}` as TranslationKey);
          return (
            <Pressable
              key={preset}
              accessibilityRole="button"
              accessibilityLabel={t("community.room_icon.preset_a11y", { name })}
              accessibilityState={{ selected: active }}
              disabled={disabled}
              onPress={() => onChange({ kind: "preset", preset })}
              style={({ pressed }) => [styles.swatchRing, active && styles.swatchRingActive, pressed && styles.pressed]}
            >
              <View style={[styles.swatch, active && styles.swatchActive]}>
                <Ionicons
                  name={preset}
                  size={20}
                  color={active ? theme.colors.onPrimary : theme.colors.text}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  wrap: { gap: 10 },
  top: { flexDirection: "row", alignItems: "center", gap: 16 },
  actions: { flex: 1, gap: 8 },
  action: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: theme.borderRadius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  actionCurrent: { borderColor: theme.colors.text, borderWidth: 1.5 },
  actionText: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  pressed: { opacity: 0.75 },
  label: { fontSize: 13, fontWeight: "700", color: theme.colors.textMuted, marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  // A ring around each swatch that only shows on the chosen one, so picking
  // never shifts the grid.
  swatchRing: {
    width: SWATCH + 6,
    height: SWATCH + 6,
    borderRadius: (SWATCH + 6) / 2,
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  swatchRingActive: { borderColor: theme.colors.text },
  swatch: {
    width: SWATCH,
    height: SWATCH,
    borderRadius: SWATCH / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceAlt,
  },
  swatchActive: { backgroundColor: theme.colors.primary },
}));
