// C:\OOTDify\src\features\community\components\CreateRoomModal.tsx
// "Create a community" — name a public group room and pick one of the fixed
// categories (ROOM_CATEGORIES). Creating the room also joins it, so the caller
// just navigates to the returned id. Same bottom-sheet shell as
// ShareOutfitModal so the community modals feel like one surface.
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton } from "../../../shared/components/AppButton";
import { makeStyles } from "../../../shared/theme/makeStyles";
import { useAppTheme } from "../../../shared/theme/ThemeProvider";
import { useT } from "../../../shared/i18n/useT";
import { createRoom } from "../service";
import { ROOM_CATEGORIES } from "../types";

export function CreateRoomModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (roomId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(ROOM_CATEGORIES[0]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const trimmed = title.trim();
  const canCreate = trimmed.length > 0 && !creating;

  const reset = () => {
    setTitle("");
    setCategory(ROOM_CATEGORIES[0]);
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
      const roomId = await createRoom({ title: trimmed, category });
      reset();
      onCreated(roomId);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("community.create_room.error"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={close}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheetWrap}
        >
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.handleWrap}>
              <View style={styles.handle} />
            </View>

            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t("community.create_room.title")}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("common.close")}
                hitSlop={8}
                onPress={close}
                style={({ pressed }) => pressed && { opacity: 0.6 }}
              >
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.sheetBody}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.intro}>
                {t("community.create_room.intro")}
              </Text>

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
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {c}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <AppButton
                label={creating ? t("community.create_room.submitting") : t("community.create_room.submit")}
                icon="people-outline"
                onPress={() => void submit()}
                loading={creating}
                disabled={!canCreate}
                style={[styles.submit, { marginBottom: 4 }]}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((theme) => ({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheetWrap: { flex: 1, justifyContent: "flex-end", width: "100%" },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    maxHeight: "86%",
  },
  handleWrap: { alignItems: "center", paddingTop: 8 },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  sheetBody: { paddingHorizontal: 20, paddingBottom: 24, gap: 10 },
  intro: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 18 },
  groupLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: theme.colors.textMuted,
    marginTop: 8,
  },
  input: {
    minHeight: 46,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
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
    paddingVertical: 8,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.surfaceAlt,
  },
  chipActive: { backgroundColor: theme.colors.primary },
  chipText: { fontSize: 13, fontWeight: "700", color: theme.colors.textMuted },
  chipTextActive: { color: theme.colors.onPrimary },
  error: { fontSize: 13, color: theme.colors.danger, marginTop: 4 },
  submit: { marginTop: 12 },
}));