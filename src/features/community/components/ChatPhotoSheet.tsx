// C:\OOTDify\src\features\community\components\ChatPhotoSheet.tsx
// "Send a photo" chooser from the chat composer: the same take/choose cards as
// the profile photo. Picks an uncropped photo, hands it to the caller to send,
// and stays open and locked until the send is finished.
import { useState } from "react";

import { Sheet } from "../../../shared/components/Sheet";
import { useT } from "../../../shared/i18n/useT";
import { pickAvatarPhoto, type AvatarSource } from "../../profile/avatar";
import { PhotoSourceOptions } from "../../profile/PhotoSourceOptions";

export function ChatPhotoSheet({
  visible,
  onClose,
  onSend,
}: {
  visible: boolean;
  onClose: () => void;
  /** Sends the picked photo; resolves true when it went through. */
  onSend: (uri: string) => Promise<boolean>;
}) {
  const { t } = useT();
  const [busy, setBusy] = useState<AvatarSource | null>(null);

  const pick = async (source: AvatarSource) => {
    if (busy) return;
    setBusy(source);
    try {
      const picked = await pickAvatarPhoto(source, "free");
      if (picked && (await onSend(picked.uri))) onClose();
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
      title={t("community.chat.photo.title")}
      subtitle={t("community.chat.photo.subtitle")}
    >
      <PhotoSourceOptions busy={busy} onPick={(s) => void pick(s)} />
    </Sheet>
  );
}
