// C:\OOTDify\src\features\profile\AvatarSourceSheet.tsx
// "Profile photo" chooser opened from an avatar or a Change photo button: take
// or pick a photo, upload it (`changeProfileAvatar` reports progress and errors
// as toasts) and hand back the stored ref. The Home sheet has its own, larger
// version with a preview and sign out (ProfilePhotoSheet).
import { Text } from "react-native";
import { useState } from "react";

import { Sheet } from "../../shared/components/Sheet";
import { useT } from "../../shared/i18n/useT";
import { makeStyles } from "../../shared/theme/makeStyles";
import { changeProfileAvatar, type AvatarSource } from "./avatar";
import { PhotoSourceOptions } from "./PhotoSourceOptions";

export function AvatarSourceSheet({
  visible,
  onClose,
  onChanged,
}: {
  visible: boolean;
  onClose: () => void;
  onChanged: (ref: string) => void;
}) {
  const styles = useStyles();
  const { t } = useT();
  const [busy, setBusy] = useState<AvatarSource | null>(null);

  const pick = async (source: AvatarSource) => {
    if (busy) return;
    setBusy(source);
    try {
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
      onClose={() => !busy && onClose()}
      busy={busy !== null}
      icon="person"
      title={t("home.photo_sheet.title")}
    >
      <Text style={styles.intro}>{t("home.photo_sheet.intro")}</Text>
      <PhotoSourceOptions busy={busy} onPick={(s) => void pick(s)} />
    </Sheet>
  );
}

const useStyles = makeStyles((theme) => ({
  intro: {
    fontSize: 13.5,
    lineHeight: 19,
    color: theme.colors.textMuted,
    marginBottom: 12,
  },
}));
