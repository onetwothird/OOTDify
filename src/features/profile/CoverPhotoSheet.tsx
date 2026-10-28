// C:\OOTDify\src\features\profile\CoverPhotoSheet.tsx
// "Cover photo" chooser opened from the Profile page: a wide preview of the
// current cover, the same take/choose cards as the profile photo, and a remove
// row once a cover is set. The page owns the upload and tells this sheet when
// it worked, so the sheet stays open (and locked) while a photo is on its way.
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { Pinstripes } from "../../shared/components/ClothesRail";
import { Sheet } from "../../shared/components/Sheet";
import { SmartImage } from "../../shared/components/SmartImage";
import { useT } from "../../shared/i18n/useT";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import type { AvatarSource } from "./avatar";
import { PhotoSourceOptions } from "./PhotoSourceOptions";

export function CoverPhotoSheet({
  visible,
  onClose,
  coverUrl,
  onPick,
  onRemove,
}: {
  visible: boolean;
  onClose: () => void;
  coverUrl: string | null;
  /** Resolves true once the new cover is saved (false when cancelled or failed). */
  onPick: (source: AvatarSource) => Promise<boolean>;
  /** Resolves true once the cover is removed. */
  onRemove: () => Promise<boolean>;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const [busy, setBusy] = useState<AvatarSource | "remove" | null>(null);

  const run = async (key: AvatarSource | "remove", action: () => Promise<boolean>) => {
    if (busy) return;
    setBusy(key);
    try {
      if (await action()) onClose();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={() => !busy && onClose()}
      busy={busy !== null}
      icon="image-outline"
      title={t("profile.page.cover.title")}
    >
      <View style={styles.preview}>
        {coverUrl ? <SmartImage source={coverUrl} style={StyleSheet.absoluteFill} /> : <Pinstripes />}
      </View>
      <Text style={styles.intro}>{t("profile.page.cover.message")}</Text>

      <PhotoSourceOptions
        busy={busy === "remove" ? null : busy}
        locked={busy !== null}
        onPick={(source) => void run(source, () => onPick(source))}
      />

      {coverUrl ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy !== null}
          onPress={() => void run("remove", onRemove)}
          style={({ pressed }) => [styles.remove, pressed && { opacity: 0.7 }]}
        >
          {busy === "remove" ? (
            <ActivityIndicator size="small" color={theme.colors.danger} />
          ) : (
            <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
          )}
          <Text style={styles.removeText}>{t("profile.page.cover.remove")}</Text>
        </Pressable>
      ) : null}
    </Sheet>
  );
}

const useStyles = makeStyles((theme) => ({
  preview: {
    height: 120,
    borderRadius: theme.borderRadius.md,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  intro: {
    fontSize: 13.5,
    lineHeight: 19,
    color: theme.colors.textMuted,
    marginTop: 10,
    marginBottom: 12,
  },
  remove: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  removeText: { color: theme.colors.danger, fontWeight: "600", fontSize: 15 },
}));
