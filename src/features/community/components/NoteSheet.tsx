// C:\OOTDify\src\features\community\components\NoteSheet.tsx
// Write the note that sits above your circle in Community for 24 hours: one
// short line your friends can read, like Messenger notes. Writing a new one
// replaces the old; you can also take it down.
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput } from "react-native";

import { AppButton } from "../../../shared/components/AppButton";
import { Sheet } from "../../../shared/components/Sheet";
import { useT } from "../../../shared/i18n/useT";
import { toast } from "../../../shared/lib/toast";
import { makeStyles } from "../../../shared/theme/makeStyles";
import { useAppTheme } from "../../../shared/theme/ThemeProvider";
import { cleanNote, NOTE_MAX } from "../social";
import { communityErrorMessage } from "../service";
import { deleteMyNote, setMyNote } from "../socialService";

export function NoteSheet({
  visible,
  onClose,
  current,
  onChanged,
}: {
  visible: boolean;
  onClose: () => void;
  /** Your live note, if you have one. */
  current: string | null;
  onChanged: () => void;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const [text, setText] = useState(current ?? "");
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);

  // Starts from your current note each time the sheet opens (render-phase reset).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setText(current ?? "");
  }

  const cleaned = cleanNote(text);

  const run = async (kind: "save" | "delete") => {
    if (busy) return;
    setBusy(kind);
    try {
      if (kind === "save") {
        await setMyNote(text);
        toast.success(t("note.toast.saved"));
      } else {
        await deleteMyNote();
        toast.success(t("note.toast.removed"));
      }
      onChanged();
      onClose();
    } catch (e) {
      toast.error(t("note.toast.error"), communityErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={() => !busy && onClose()}
      busy={busy !== null}
      icon="chatbubble-ellipses-outline"
      title={t("note.title")}
      subtitle={t("note.subtitle")}
      footer={
        <>
          <AppButton
            label={t("note.share")}
            icon="checkmark"
            loading={busy === "save"}
            disabled={!cleaned.ok || busy !== null}
            onPress={() => void run("save")}
          />
          {current ? (
            <Pressable
              accessibilityRole="button"
              disabled={busy !== null}
              onPress={() => void run("delete")}
              style={({ pressed }) => [styles.remove, pressed && { opacity: 0.7 }]}
            >
              {busy === "delete" ? (
                <ActivityIndicator size="small" color={theme.colors.danger} />
              ) : (
                <Ionicons name="trash-outline" size={17} color={theme.colors.danger} />
              )}
              <Text style={styles.removeText}>{t("note.remove")}</Text>
            </Pressable>
          ) : null}
        </>
      }
    >
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={t("note.placeholder")}
        placeholderTextColor={theme.colors.textMuted}
        style={styles.input}
        maxLength={NOTE_MAX}
        autoFocus
        editable={busy === null}
        returnKeyType="done"
        onSubmitEditing={() => cleaned.ok && void run("save")}
        accessibilityLabel={t("note.title")}
      />
      <Text style={styles.count}>
        {text.length}/{NOTE_MAX}
      </Text>
    </Sheet>
  );
}

const useStyles = makeStyles((theme) => ({
  input: {
    minHeight: 50,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.colors.text,
  },
  count: { alignSelf: "flex-end", fontSize: 12, color: theme.colors.textMuted, marginTop: 6 },
  remove: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  removeText: { fontSize: 14.5, fontWeight: "600", color: theme.colors.danger },
}));
