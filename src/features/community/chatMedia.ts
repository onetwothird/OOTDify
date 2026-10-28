// C:\OOTDify\src\features\community\chatMedia.ts
// Pure rules for photos and emoji in chats, kept apart from Expo and Supabase
// so they can be tested. A photo message still has a text body, so previews,
// notifications and the chat list need no special case for it.

/** The body of a photo sent with no caption. */
export const PHOTO_BODY = "📷 Photo";
const CAPTION_MAX = 500;

/** Where a chat photo lives inside the private 'chat' bucket. */
export function chatPhotoPath(conversationId: string, userId: string, fileId: string): string {
  return `${conversationId}/${userId}/${fileId}.jpg`;
}

/** The ref stored on the message (bucket/path), as the database check expects. */
export function chatPhotoRef(path: string): string {
  return `chat/${path}`;
}

export function photoMessageBody(caption: string): string {
  return caption.trim().slice(0, CAPTION_MAX) || PHOTO_BODY;
}

/** True when the body is something someone wrote, not the default label. */
export function showsCaption(body: string): boolean {
  return body.trim() !== "" && body !== PHOTO_BODY;
}

/** The quick emoji tray in the composer. */
export const CHAT_EMOJI = [
  "😀", "😂", "🥹", "😍", "😘", "😎", "🤩", "🥳",
  "😭", "😅", "🤔", "😴", "😡", "🙄", "😇", "🤗",
  "👍", "👎", "👏", "🙌", "🙏", "💪", "🤝", "✌️",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💖",
  "🔥", "✨", "🎉", "💯", "👀", "🌈", "⭐", "💫",
  "👗", "👕", "👖", "🧥", "👟", "👠", "👜", "🕶️",
] as const;
