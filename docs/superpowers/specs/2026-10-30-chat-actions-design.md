# Chat actions and community settings

Status: approved by delegation ("do it all", "go"), 2026-10-30.

## What the user asked for

In community chats and private messages: reply to a message, react to it,
unsend it for me or for everyone, with a mark when someone unsent for
everyone, "and many more". Communities get settings for appearance, mute,
members "and many more".

## Message actions

Long-press a message to open its action sheet:

| Action | Who | Notes |
| --- | --- | --- |
| React | anyone, not on unsent messages | One reaction per person per message (6 quick emoji plus the full tray). Tapping your own reaction again removes it. Chips under the bubble show counts; tapping a chip toggles yours. |
| Reply | anyone, not on unsent messages | A reply bar sits above the composer; the sent bubble shows a quote of the original. Tapping the quote scrolls to it. A quote of an unsent message reads "Message unsent". |
| Edit | sender, text only, within 15 minutes | The bubble shows "Edited". |
| Unsend for everyone | sender, any time | Body and photo are wiped in the database, reactions removed, the bubble becomes "You unsent a message" / "{name} unsent a message". Unread message notifications carrying its text are removed. A push already delivered cannot be recalled. |
| Remove for you | anyone | Hides the message only for the viewer (`message_hidden`). |

Copy is left out: no clipboard module is linked and adding one needs a new
native build.

## Conversation settings (`/community/chat-settings/[id]`)

Opened from an info button in the chat header, for DMs and communities.

- **Header:** icon, name, category, member count. Admins rename it and
  change its icon (existing sheet).
- **Appearance:** chat theme, one of eight colour presets for the bubbles of
  the person sending. Shared by everyone in the conversation. In communities
  only admins change it; in DMs either person can.
- **Notifications:** mute for 1 hour, 8 hours, 24 hours, or until turned back
  on. Muting stops message notifications for this chat (the database trigger
  skips muted participants).
- **Members** (communities): everyone in the room, with Creator / Admin / You
  badges. Admins can remove members other than the creator. The creator can
  make a member an admin or remove admin.
- **Photos:** a grid of photos shared in the chat (not unsent ones).
- **Leave community** (members other than the creator) and **Delete
  community** (creator). Both need a second tap to confirm.

## Data (migration `20261030120000_chat_actions.sql`, not applied by Claude)

- `messages.reply_to`, `edited_at`, `unsent_at`. A participant may update only
  their own messages, and a trigger allows exactly two changes: an edit
  (text, unsent, within 15 minutes) or an unsend (wipes body and photo).
  `reply_to` must point into the same conversation.
- `message_reactions(message_id, user_id, conversation_id, emoji, ...)`, one
  row per person per message. Removing a reaction sets `emoji` to null, so
  every change is an INSERT or UPDATE that realtime can filter by
  conversation.
- `message_hidden(message_id, user_id)`, own rows only.
- `conversation_participants.muted_until`; `conversations.chat_theme`
  (format-checked, guarded as above).
- Participants can see a room's admins; admins can remove non-creator
  members; `set_room_admin()` lets the creator grant or revoke admin.

## Testing

Pure rules live in `features/community/chatThread.ts` and
`features/community/chatSettings.ts` with Jest tests: which actions a message
offers, the edit window, reaction grouping, reply quotes, merging live
updates, mute times, theme presets and member roles/actions.
