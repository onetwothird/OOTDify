// C:\OOTDify\src\features\profile\ProfilePhotoSheet.tsx
// "Profile photo" bottom sheet opened from the Home header avatar: a large
// preview of the current photo, take/choose a new one (same upload flow as the
// Profile screen, `changeProfileAvatar`), or sign out. The full profile is the
// Profile tab.
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { AppButton } from "../../shared/components/AppButton";
import { Sheet } from "../../shared/components/Sheet";
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
  onClose,
  onSignOut,
}: {
  visible: boolean;
  initial: string;
  avatarRef: string | null;
  onChanged: (ref: string) => void;
  onClose: () => void;
  /** Opens the log-out confirmation (this sheet closes first). */
  onSignOut: () => void;
}) {
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
    <Sheet
      visible={visible}
      onClose={close}
      busy={busy !== null}
      icon="person"
      title={t("home.photo_sheet.title")}
    >
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
      <Pressable
        accessibilityRole="button"
        disabled={busy !== null}
        onPress={() => {
          onClose();
          onSignOut();
        }}
        style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="log-out-outline" size={18} color={theme.colors.danger} />
        <Text style={styles.signOutText}>{t("profile.sign_out")}</Text>
      </Pressable>
    </Sheet>
  );
}

const useStyles = makeStyles((theme) => ({
  preview: { alignItems: "center", gap: 12, paddingVertical: 8 },
  intro: {
    fontSize: 13.5,
    color: theme.colors.textMuted,
    lineHeight: 19,
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
  signOutText: { color: theme.colors.danger, fontWeight: "600", fontSize: 15 },
}));
