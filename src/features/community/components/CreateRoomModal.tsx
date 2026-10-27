// C:\OOTDify\src\features\community\components\CreateRoomModal.tsx
// "Create a community" — name a public group room, give it an icon (photo,
// preset or initials) and pick one of the fixed categories (ROOM_CATEGORIES).
// Creating the room also joins it, so the caller just navigates to the
// returned id. A photo uploads once the room exists; if that alone fails the
// room is still created and the toast says how to retry. Uses the Sheet shell.
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { AppButton } from "../../../shared/components/AppButton";
import { Sheet } from "../../../shared/components/Sheet";
import { makeStyles } from "../../../shared/theme/makeStyles";
import { useAppTheme } from "../../../shared/theme/ThemeProvider";
import { useT } from "../../../shared/i18n/useT";
import { toast } from "../../../shared/lib/toast";
import { uploadRoomIcon } from "../../../services/aiApi";
import { createRoom } from "../service";
import { ROOM_CATEGORIES } from "../types";
import { RoomIconPicker, type RoomIconChoice } from "./RoomIconPicker";

export function CreateRoomModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (roomId: string) => void;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(ROOM_CATEGORIES[0]);
  const [icon, setIcon] = useState<RoomIconChoice>({ kind: "initials" });
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const trimmed = title.trim();
  const canCreate = trimmed.length > 0 && !creating;

  const reset = () => {
    setTitle("");
    setCategory(ROOM_CATEGORIES[0]);
    setIcon({ kind: "initials" });
    setError(null);
  };

  const close = () => {
    if (creating) return;
    reset();
    onClose();
  };

  const submit = async () => {
    if (!canCreate) return;
    setCreating(true);
    setError(null);
    try {
      const roomId = await createRoom({
        title: trimmed,
        category,
        iconPreset: icon.kind === "preset" ? icon.preset : null,
      });
      if (icon.kind === "photo") {
        try {
          await uploadRoomIcon(roomId, icon.uri);
        } catch {
          toast.error(t("community.room_icon.error"), t("community.room_icon.upload_failed"));
        }
      }
      reset();
      onCreated(roomId);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("community.create_room.error"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      busy={creating}
      icon="people"
      title={t("community.create_room.title")}
      subtitle={t("community.create_room.intro")}
      footer={
        <>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <AppButton
            label={creating ? t("community.create_room.submitting") : t("community.create_room.submit")}
            icon="people-outline"
            onPress={() => void submit()}
            loading={creating}
            disabled={!canCreate}
          />
        </>
      }
    >
      <Text style={styles.groupLabel}>{t("community.create_room.name_label")}</Text>
      <TextInput
        value={title}
        onChangeText={(text) => {
          setTitle(text);
          if (error) setError(null);
        }}
        placeholder={t("community.create_room.name_placeholder")}
        placeholderTextColor={theme.colors.textMuted}
        style={styles.input}
        maxLength={60}
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
        autoCapitalize="sentences"
      />

      <Text style={styles.groupLabel}>{t("community.room_icon.label")}</Text>
      <RoomIconPicker
        title={trimmed || t("community.create_room.name_placeholder")}
        value={icon}
        onChange={setIcon}
        disabled={creating}
      />

      <Text style={styles.groupLabel}>{t("community.create_room.category_label")}</Text>
      <View style={styles.chipRow}>
        {ROOM_CATEGORIES.map((c) => {
          const active = c === category;
          return (
            <Pressable
              key={c}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setCategory(c)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const useStyles = makeStyles((theme) => ({
  groupLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text,
    marginTop: 4,
  },
  input: {
    minHeight: 48,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.colors.text,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.surfaceAlt,
  },
  chipActive: { backgroundColor: theme.colors.primary },
  chipText: { fontSize: 13, fontWeight: "700", color: theme.colors.textMuted },
  chipTextActive: { color: theme.colors.onPrimary },
  error: { fontSize: 13, color: theme.colors.danger },
}));
