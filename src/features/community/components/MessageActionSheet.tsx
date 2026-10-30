// C:\OOTDify\src\features\community\components\MessageActionSheet.tsx
// What a long-press on a chat message opens: a row of quick reactions (plus
// the full emoji tray), then the actions that message allows (chatThread.ts
// decides which). Unsending for everyone asks for a second tap, since it
// can't be undone.
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { CHAT_EMOJI } from "../chatMedia";
import { QUICK_REACTIONS, type MessageAction } from "../chatThread";
import { Sheet } from "../../../shared/components/Sheet";
import type { Theme } from "../../../shared/config/theme";
import { useT } from "../../../shared/i18n/useT";
import { makeStyles } from "../../../shared/theme/makeStyles";
import { useAppTheme } from "../../../shared/theme/ThemeProvider";

interface Props {
  visible: boolean;
  /** A one-line preview of the message, shown under the title. */
  preview: string;
  actions: MessageAction[];
  myReaction: string | null;
  onReact: (emoji: string) => void;
  onAction: (action: Exclude<MessageAction, "react">) => void;
  onClose: () => void;
}

const ICONS: Record<Exclude<MessageAction, "react">, keyof typeof Ionicons.glyphMap> = {
  reply: "arrow-undo-outline",
  edit: "create-outline",
  unsend_everyone: "trash-outline",
  remove_for_me: "eye-off-outline",
};

export function MessageActionSheet({ visible, preview, actions, myReaction, onReact, onAction, onClose }: Props) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const [moreEmoji, setMoreEmoji] = useState(false);
  const [confirmUnsend, setConfirmUnsend] = useState(false);

  const close = () => {
    setMoreEmoji(false);
    setConfirmUnsend(false);
    onClose();
  };
  const react = (emoji: string) => {
    setMoreEmoji(false);
    onReact(emoji);
  };
  const pick = (action: Exclude<MessageAction, "react">) => {
    if (action === "unsend_everyone" && !confirmUnsend) {
      setConfirmUnsend(true);
      return;
    }
    setConfirmUnsend(false);
    onAction(action);
  };

  const labels: Record<Exclude<MessageAction, "react">, string> = {
    reply: t("community.chat.action.reply"),
    edit: t("community.chat.action.edit"),
    unsend_everyone: confirmUnsend ? t("community.chat.action.unsend_confirm") : t("community.chat.action.unsend"),
    remove_for_me: t("community.chat.action.remove_for_me"),
  };

  return (
    <Sheet visible={visible} onClose={close} title={t("community.chat.action.title")} subtitle={preview} icon="chatbubble-outline">
      {actions.includes("react") ? (
        <>
          <View style={styles.reactRow}>
            {QUICK_REACTIONS.map((emoji) => (
              <Pressable
                key={emoji}
                accessibilityRole="button"
                accessibilityLabel={t("community.chat.react_a11y", { emoji })}
                accessibilityState={{ selected: myReaction === emoji }}
                onPress={() => react(emoji)}
                style={({ pressed }) => [styles.reactBtn, myReaction === emoji && styles.reactBtnOn, pressed && styles.pressed]}
              >
                <Text style={styles.reactEmoji}>{emoji}</Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("community.chat.more_reactions_a11y")}
              accessibilityState={{ expanded: moreEmoji }}
              onPress={() => setMoreEmoji((o) => !o)}
              style={({ pressed }) => [styles.reactBtn, pressed && styles.pressed]}
            >
              <Ionicons name={moreEmoji ? "chevron-up" : "add"} size={22} color={theme.colors.textMuted} />
            </Pressable>
          </View>
          {moreEmoji ? (
            <View style={styles.tray}>
              {CHAT_EMOJI.map((emoji) => (
                <Pressable
                  key={emoji}
                  accessibilityRole="button"
                  accessibilityLabel={t("community.chat.react_a11y", { emoji })}
                  onPress={() => react(emoji)}
                  style={({ pressed }) => [styles.trayBtn, myReaction === emoji && styles.reactBtnOn, pressed && styles.pressed]}
                >
                  <Text style={styles.trayEmoji}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      ) : null}

      <View style={styles.actions}>
        {actions
          .filter((a): a is Exclude<MessageAction, "react"> => a !== "react")
          .map((action) => {
            const danger = action === "unsend_everyone";
            return (
              <Pressable
                key={action}
                accessibilityRole="button"
                onPress={() => pick(action)}
                style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
              >
                <Ionicons name={ICONS[action]} size={20} color={danger ? theme.colors.danger : theme.colors.text} />
                <View style={styles.actionTexts}>
                  <Text style={[styles.actionText, danger && styles.danger]}>{labels[action]}</Text>
                  {action === "unsend_everyone" ? (
                    <Text style={styles.actionHint}>{t("community.chat.action.unsend_hint")}</Text>
                  ) : action === "remove_for_me" ? (
                    <Text style={styles.actionHint}>{t("community.chat.action.remove_for_me_hint")}</Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
      </View>
    </Sheet>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
  pressed: { opacity: 0.6 },
  reactRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.borderRadius.pill,
    padding: 6,
  },
  reactBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  reactBtnOn: { backgroundColor: theme.colors.surface, borderWidth: 1.5, borderColor: theme.colors.brand },
  reactEmoji: { fontSize: 26 },
  tray: { flexDirection: "row", flexWrap: "wrap", marginTop: theme.spacing.sm },
  trayBtn: { width: "12.5%", alignItems: "center", paddingVertical: 6, borderRadius: theme.borderRadius.md },
  trayEmoji: { fontSize: 24 },
  actions: { marginTop: theme.spacing.md },
  action: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13, paddingHorizontal: 4 },
  actionPressed: { backgroundColor: theme.colors.surfaceAlt },
  actionTexts: { flex: 1 },
  actionText: { ...theme.typography.body, color: theme.colors.text, fontWeight: "600" },
  actionHint: { ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 1 },
  danger: { color: theme.colors.danger },
}));
