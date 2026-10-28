// C:\OOTDify\src\features\community\components\EditRoomIconSheet.tsx
// Edit a community from its chat header: its name and its icon. Only the room's
// creator (its admin) sees it; the database and backend enforce the same rule.
// A new photo uploads via the backend (Cloudinary); a preset or the initials
// save straight to the room.
import { useState } from "react";
import { StyleSheet, Text, TextInput } from "react-native";

import { uploadRoomIcon } from "../../../services/aiApi";
import { AppButton } from "../../../shared/components/AppButton";
import { Sheet } from "../../../shared/components/Sheet";
import { useT } from "../../../shared/i18n/useT";
import { makeStyles } from "../../../shared/theme/makeStyles";
import { useAppTheme } from "../../../shared/theme/ThemeProvider";
import { cleanRoomTitle, ROOM_TITLE_MAX, roomIconPreset } from "../roomIcons";
import { renameRoom, setRoomIconPreset } from "../service";
import { RoomIconPicker, type RoomIconChoice } from "./RoomIconPicker";

export interface RoomIconValue {
  iconUrl: string | null;
  iconPreset: string | null;
}

function choiceFor(icon: RoomIconValue): RoomIconChoice {
  if (icon.iconUrl) return { kind: "photo", uri: icon.iconUrl, isNew: false };
  const preset = roomIconPreset(icon.iconPreset);
  return preset ? { kind: "preset", preset } : { kind: "initials" };
}

export function EditRoomIconSheet({
  visible,
  onClose,
  roomId,
  title,
  current,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  title: string;
  current: RoomIconValue;
  onSaved: (next: RoomIconValue & { title: string }) => void;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const [name, setName] = useState(title);
  // Starts from the room's icon each time the sheet opens (render-phase reset).
  const [choice, setChoice] = useState<RoomIconChoice>(() => choiceFor(current));
  const [wasVisible, setWasVisible] = useState(visible);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setName(title);
      setChoice(choiceFor(current));
      setError(null);
    }
  }

  const unchanged =
    (choice.kind === "photo" && !choice.isNew) ||
    (choice.kind === "preset" && !current.iconUrl && current.iconPreset === choice.preset) ||
    (choice.kind === "initials" && !current.iconUrl && !roomIconPreset(current.iconPreset));

  const cleaned = cleanRoomTitle(name);
  const nameChanged = cleaned.ok && cleaned.title !== title;

  const save = async () => {
    if (saving || (unchanged && !nameChanged) || !cleaned.ok) return;
    setSaving(true);
    setError(null);
    try {
      let next: RoomIconValue = current;
      if (!unchanged) {
        if (choice.kind === "photo") {
          next = await uploadRoomIcon(roomId, choice.uri);
        } else {
          const preset = choice.kind === "preset" ? choice.preset : null;
          await setRoomIconPreset(roomId, preset);
          next = { iconUrl: null, iconPreset: preset };
        }
      }
      const savedTitle = nameChanged ? await renameRoom(roomId, cleaned.title) : title;
      onSaved({ ...next, title: savedTitle });
      onClose();
    } catch {
      setError(t("community.room_icon.error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      busy={saving}
      icon="image-outline"
      title={t("community.room_icon.edit_title")}
      subtitle={t("community.room_icon.edit_subtitle")}
      footer={
        <>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <AppButton
            label={saving ? t("community.room_icon.saving") : t("community.room_icon.save")}
            icon="checkmark"
            onPress={() => void save()}
            loading={saving}
            disabled={saving || !cleaned.ok || (unchanged && !nameChanged)}
          />
        </>
      }
    >
      <Text style={styles.label}>{t("community.create_room.name_label")}</Text>
      <TextInput
        value={name}
        onChangeText={(text) => {
          setName(text);
          if (error) setError(null);
        }}
        placeholder={t("community.create_room.name_placeholder")}
        placeholderTextColor={theme.colors.textMuted}
        style={styles.input}
        maxLength={ROOM_TITLE_MAX}
        editable={!saving}
        returnKeyType="done"
      />

      <Text style={styles.label}>{t("community.room_icon.label")}</Text>
      <RoomIconPicker title={cleaned.ok ? cleaned.title : title} value={choice} onChange={setChoice} disabled={saving} />
    </Sheet>
  );
}

const useStyles = makeStyles((theme) => ({
  error: { fontSize: 13, color: theme.colors.danger },
  label: { fontSize: 13, fontWeight: "600", color: theme.colors.text, marginTop: 4 },
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
}));
