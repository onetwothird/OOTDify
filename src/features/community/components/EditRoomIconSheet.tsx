// C:\OOTDify\src\features\community\components\EditRoomIconSheet.tsx
// Change a community's icon from its chat header. Only the room's creator sees
// it; the database and backend enforce the same rule. A new photo uploads via
// the backend (Cloudinary); a preset or the initials save straight to the room.
import { useState } from "react";
import { Text } from "react-native";

import { uploadRoomIcon } from "../../../services/aiApi";
import { AppButton } from "../../../shared/components/AppButton";
import { Sheet } from "../../../shared/components/Sheet";
import { useT } from "../../../shared/i18n/useT";
import { makeStyles } from "../../../shared/theme/makeStyles";
import { roomIconPreset } from "../roomIcons";
import { setRoomIconPreset } from "../service";
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
  onSaved: (next: RoomIconValue) => void;
}) {
  const styles = useStyles();
  const { t } = useT();
  // Starts from the room's icon each time the sheet opens (render-phase reset).
  const [choice, setChoice] = useState<RoomIconChoice>(() => choiceFor(current));
  const [wasVisible, setWasVisible] = useState(visible);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setChoice(choiceFor(current));
      setError(null);
    }
  }

  const unchanged =
    (choice.kind === "photo" && !choice.isNew) ||
    (choice.kind === "preset" && !current.iconUrl && current.iconPreset === choice.preset) ||
    (choice.kind === "initials" && !current.iconUrl && !roomIconPreset(current.iconPreset));

  const save = async () => {
    if (saving || unchanged) return;
    setSaving(true);
    setError(null);
    try {
      let next: RoomIconValue;
      if (choice.kind === "photo") {
        next = await uploadRoomIcon(roomId, choice.uri);
      } else {
        const preset = choice.kind === "preset" ? choice.preset : null;
        await setRoomIconPreset(roomId, preset);
        next = { iconUrl: null, iconPreset: preset };
      }
      onSaved(next);
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
            disabled={saving || unchanged}
          />
        </>
      }
    >
      <RoomIconPicker title={title} value={choice} onChange={setChoice} disabled={saving} />
    </Sheet>
  );
}

const useStyles = makeStyles((theme) => ({
  error: { fontSize: 13, color: theme.colors.danger },
}));
