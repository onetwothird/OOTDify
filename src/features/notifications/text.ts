// C:\OOTDify\src\features\notifications\text.ts
// The words and icon for one notification, in the app's language. The
// database writes the same sentences for phone push (migration
// 20261028150000); keep the two in step.
import type { Ionicons } from "@expo/vector-icons";

import type { TranslateParams, TranslationKey } from "../../shared/i18n/translate";
import type { DirectoryProfile } from "../community/types";
import type { InboxRow, NotificationType } from "./inbox";

type T = (key: TranslationKey, params?: TranslateParams) => string;

export const NOTIFICATION_ICON: Record<NotificationType, keyof typeof Ionicons.glyphMap> = {
  message: "chatbubble",
  friend_request: "person-add",
  friend_accepted: "people",
  post_like: "heart",
  post_comment: "chatbox-ellipses",
  comment_thread: "chatbox-ellipses",
  my_day: "sunny",
  room_join: "enter",
  my_day_like: "heart",
  my_day_comment: "chatbox-ellipses",
};

export function inboxText(
  t: T,
  row: Pick<InboxRow, "type" | "preview">,
  actor: DirectoryProfile | null,
  roomTitle: string | null,
  count: number,
): { title: string; body: string } {
  const name = actor?.display_name || actor?.first_name || t("notifications.someone");
  const preview = row.preview ?? "";
  switch (row.type) {
    case "message":
      if (count > 1) {
        return {
          title: roomTitle ?? name,
          body: t("notifications.text.messages", { count }),
        };
      }
      return { title: roomTitle ?? name, body: roomTitle ? `${name}: ${preview}` : preview };
    case "room_join":
      return { title: roomTitle ?? t("notifications.title.community"), body: t("notifications.text.room_join", { name }) };
    default:
      return {
        title: name,
        body: t(`notifications.text.${row.type}` as TranslationKey, { name, preview }),
      };
  }
}
