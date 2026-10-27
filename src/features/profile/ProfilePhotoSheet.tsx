// C:\OOTDify\src\features\profile\ProfilePhotoSheet.tsx
// "Profile photo" bottom sheet opened from the Home header avatar: a large
// preview of the current photo, take/choose a new one (same upload flow as the
// Profile screen, `changeProfileAvatar`), jump to the full Profile, or sign out.
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton } from "../../shared/components/AppButton";
import { supabase } from "../../shared/lib/supabase";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { useT } from "../../shared/i18n/useT";
import { changeProfileAvatar, type AvatarSource } from "./avatar";
import { ProfileAvatar } from "./ProfileAvatar";

export function ProfilePhotoSheet({
  visible,
  initial,
  avatarRef,
  onChanged,
  onOpenProfile,
  onClose,
}: {
  visible: boolean;
  initial: string;
  avatarRef: string | null;
  onChanged: (ref: string) => void;
  onOpenProfile: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const [busy, setBusy] = useState<AvatarSource | null>(null);

  const close = () => {
    if (busy) return;
    onClose();
  };

  const change = async (source: AvatarSource) => {
    if (busy) return;
    setBusy(source);
    try {
      // Picks, uploads and persists; reports progress and errors as toasts.
      const ref = await changeProfileAvatar(source);
      if (ref) {
        onChanged(ref);
        onClose();
      }
    } finally {
      setBusy(null);
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
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel={t("common.close")}>
        {/* Swallow taps on the sheet so only the dimmed area closes it. */}
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          onPress={() => {}}
        >
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{t("home.photo_sheet.title")}</Text>
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

          <View style={styles.body}>
            <View style={styles.preview}>
              <ProfileAvatar
                size={120}
                initial={initial}
                avatarRef={avatarRef}
                busy={busy !== null}
                background={theme.colors.surfaceAlt}
                color={theme.colors.text}
                ring={theme.colors.border}
              />
              <Text style={styles.intro}>{t("home.photo_sheet.intro")}</Text>
            </View>

            <AppButton
              label={t("home.photo_sheet.take")}
              icon="camera-outline"
              loading={busy === "camera"}
              disabled={busy !== null}
              onPress={() => void change("camera")}
            />
            <AppButton
              label={t("home.photo_sheet.library")}
              icon="images-outline"
              variant="secondary"
              loading={busy === "library"}
              disabled={busy !== null}
              onPress={() => void change("library")}
            />
            <AppButton
              label={t("home.photo_sheet.view_profile")}
              icon="person-outline"
              variant="ghost"
              disabled={busy !== null}
              onPress={() => {
                onClose();
                onOpenProfile();
              }}
            />
            <Pressable
              accessibilityRole="button"
              disabled={busy !== null}
              onPress={() => {
                onClose();
                // The root layout sends signed-out users to the auth screens.
                void supabase.auth.signOut();
              }}
              style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="log-out-outline" size={18} color={theme.colors.danger} />
              <Text style={styles.signOutText}>{t("profile.sign_out")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles((theme) => ({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
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
  body: { paddingHorizontal: 20, paddingBottom: 8, gap: 10 },
  preview: { alignItems: "center", gap: 12, paddingVertical: 12 },
  intro: {
    fontSize: 13,
    color: theme.colors.textMuted,
    lineHeight: 18,
    textAlign: "center",
    maxWidth: 280,
  },
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  signOutText: { color: theme.colors.danger, fontWeight: "700", fontSize: 15 },
}));
