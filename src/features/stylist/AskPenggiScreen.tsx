// C:\OOTDify\src\features\stylist\AskPenggiScreen.tsx
// Ask Penggi: a styling chat over your own closet. Penggi stands on a small
// stage at the top and acts out the conversation (PenggiStage): greets you,
// thinks while the answer comes, and explains while it types out. His answers
// sit in speech bubbles with photos of the closet pieces he picked; tap one
// to open it. He answers in the language you write in (English, Filipino or
// Taglish), falling back to the app language.
//
// Nothing is faked or saved: answers come from the backend (routes/stylist.py,
// which reads your closet for your session), the conversation lives only on
// this screen, and failures say what went wrong.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { type ComponentRef, useCallback, useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, askPenggi, stylistErrorCode } from "../../services/aiApi";
import { SmartImage } from "../../shared/components/SmartImage";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";
import type { TranslationKey } from "../../shared/i18n/translate";
import { getCurrentPlace } from "../../shared/lib/location";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { fetchMyCloset } from "../clothing/service";
import type { ClothingItem } from "../clothing/types";
import { useSettingsStore } from "../settings/settingsStore";
import { historyForApi, penggiPose, type ChatMessage } from "./chat";
import { PenggiStage } from "./PenggiStage";

const MAX_LENGTH = 1000;
/** Typing speed of Penggi's answer, per character. */
const TYPE_MS = 16;
const STARTERS: TranslationKey[] = [
  "stylist.starter.today",
  "stylist.starter.date",
  "stylist.starter.rain",
  "stylist.starter.missing",
];

let seq = 0;
const nextId = () => `m${(seq += 1)}`;

export function AskPenggiScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const language = useSettingsStore((s) => s.language);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [waiting, setWaiting] = useState(false);
  // The newest answer types out; this is how much of it is shown.
  const [typingId, setTypingId] = useState<string | null>(null);
  const [typed, setTyped] = useState(0);
  const [closet, setCloset] = useState<Map<string, ClothingItem>>(new Map());
  const [place, setPlace] = useState<string | null>(null);
  const listRef = useRef<ComponentRef<typeof FlatList<ChatMessage>>>(null);

  // Photos for the pieces Penggi picks, and the place shown on Home (without
  // asking for location permission here).
  useEffect(() => {
    let alive = true;
    void fetchMyCloset()
      .then((items) => alive && setCloset(new Map(items.map((i) => [i.id, i]))))
      .catch(() => {});
    void getCurrentPlace(false).then((p) => alive && setPlace(p?.label ?? null));
    return () => {
      alive = false;
    };
  }, []);

  const typingText = typingId ? (messages.find((m) => m.id === typingId)?.text ?? "") : "";
  useEffect(() => {
    if (!typingId) return;
    if (typed >= typingText.length) {
      const id = setTimeout(() => setTypingId(null), 0);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setTyped((n) => Math.min(typingText.length, n + 2)), TYPE_MS);
    return () => clearTimeout(id);
  }, [typingId, typed, typingText.length]);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const send = async (raw: string) => {
    const text = raw.trim().slice(0, MAX_LENGTH);
    if (!text || waiting) return;
    const mine: ChatMessage = { id: nextId(), role: "user", text, pieceIds: [] };
    const next = [...messages, mine];
    setMessages(next);
    setDraft("");
    setTypingId(null);
    setWaiting(true);
    scrollToEnd();
    try {
      const now = new Date();
      const answer = await askPenggi(historyForApi(next), {
        language: language === "fil" ? "fil" : "en",
        place,
        localTime: `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`,
      });
      const reply: ChatMessage = { id: nextId(), role: "assistant", text: answer.reply, pieceIds: answer.pieceIds };
      setMessages((m) => [...m, reply]);
      setTyped(0);
      setTypingId(reply.id);
    } catch (e) {
      setMessages((m) => [...m, { id: nextId(), role: "note", text: errorText(e, t), pieceIds: [] }]);
    } finally {
      setWaiting(false);
      scrollToEnd();
    }
  };

  const pose = penggiPose({ messages, waiting, typing: typingId !== null });
  const stageLine =
    pose === "thinking"
      ? t("stylist.stage.thinking")
      : pose === "explaining"
        ? t(typingId ? "stylist.stage.explaining" : "stylist.stage.more")
        : t(messages.length ? "stylist.stage.again" : "stylist.stage.hello");

  const renderItem = ({ item }: { item: ChatMessage }) => {
    if (item.role === "user") {
      return (
        <View style={styles.mineRow}>
          <Text style={styles.mine}>{item.text}</Text>
        </View>
      );
    }
    if (item.role === "note") {
      return (
        <View style={styles.note} accessibilityRole="alert">
          <Ionicons name="alert-circle-outline" size={16} color={theme.colors.danger} />
          <Text style={styles.noteText}>{item.text}</Text>
        </View>
      );
    }
    const isTyping = item.id === typingId;
    const pieces = item.pieceIds.map((id) => closet.get(id)).filter((p): p is ClothingItem => Boolean(p));
    return (
      <Pressable
        accessibilityLabel={item.text}
        // Tap to skip the typing.
        onPress={() => isTyping && setTyped(item.text.length)}
        style={styles.penggiRow}
      >
        <View style={styles.bubbleTail} />
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>{isTyping ? item.text.slice(0, typed) : item.text}</Text>
          {!isTyping && pieces.length ? (
            <View style={styles.pieces}>
              {pieces.map((p) => (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityLabel={t("stylist.open_piece", { name: p.name || t("stylist.piece") })}
                  onPress={() => router.push(`/item/${p.id}`)}
                  style={({ pressed }) => [styles.piece, pressed && styles.pressed]}
                >
                  <SmartImage source={p.image_url} style={styles.pieceImage} />
                  <Text style={styles.pieceName} numberOfLines={1}>
                    {p.name || t("stylist.piece")}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const { length } = draft.trim();
  const canSend = length > 0 && !waiting;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={styles.nav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("stylist.back")}
          hitSlop={8}
          onPress={() => router.back()}
          style={styles.navBtn}
        >
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          {t("stylist.title")}
        </Text>
      </View>

      <PenggiStage pose={pose} typing={typingId !== null} line={stageLine} />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => typingId && listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.starters}>
              <Text style={styles.startersLabel}>{t("stylist.starters")}</Text>
              {STARTERS.map((key) => (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  onPress={() => void send(t(key))}
                  style={({ pressed }) => [styles.starter, pressed && styles.pressed]}
                >
                  <Text style={styles.starterText}>{t(key)}</Text>
                </Pressable>
              ))}
              <Text style={styles.privacy}>{t("stylist.privacy")}</Text>
            </View>
          }
        />

        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            onFocus={scrollToEnd}
            placeholder={t("stylist.placeholder")}
            placeholderTextColor={theme.colors.textMuted}
            accessibilityLabel={t("stylist.placeholder")}
            maxLength={MAX_LENGTH}
            multiline
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("stylist.send")}
            accessibilityState={{ disabled: !canSend, busy: waiting }}
            disabled={!canSend}
            onPress={() => void send(draft)}
            style={({ pressed }) => [styles.send, !canSend && styles.sendOff, pressed && styles.pressed]}
          >
            <Ionicons name="arrow-up" size={20} color={theme.colors.onBrand} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function errorText(e: unknown, t: ReturnType<typeof useT>["t"]): string {
  const code = stylistErrorCode(e);
  if (code === "not_configured") return t("stylist.error.not_configured");
  if (code === "refused") return t("stylist.error.refused");
  if (e instanceof ApiError && e.status === 429) {
    const minutes = Math.max(1, Math.ceil((e.retryAfterSeconds ?? 60) / 60));
    return t("stylist.error.busy", { count: minutes });
  }
  if (e instanceof ApiError) return e.message;
  return t("stylist.error.generic");
}

const useStyles = makeStyles((theme: Theme) => ({
  flex: { flex: 1 },
  pressed: { opacity: 0.8 },
  screen: { flex: 1, backgroundColor: theme.colors.background },
  nav: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingBottom: 2 },
  navBtn: { padding: 6 },
  title: { ...theme.typography.heading, color: theme.colors.text },
  list: { paddingHorizontal: theme.spacing.page, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.md, gap: 12 },
  mineRow: { alignItems: "flex-end" },
  mine: {
    maxWidth: "82%",
    ...theme.typography.body,
    color: theme.colors.onBrand,
    backgroundColor: theme.colors.brand,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderBottomRightRadius: 6,
    overflow: "hidden",
  },
  // Penggi's answers point up at him on the stage.
  penggiRow: { alignItems: "flex-start", paddingTop: 6 },
  bubbleTail: {
    position: "absolute",
    top: 0,
    left: 22,
    width: 14,
    height: 14,
    borderRadius: 3,
    transform: [{ rotate: "45deg" }],
    backgroundColor: theme.colors.surface,
  },
  bubble: {
    maxWidth: "92%",
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  bubbleText: { ...theme.typography.body, color: theme.colors.text },
  pieces: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  piece: { width: 76 },
  pieceImage: { width: 76, height: 92, borderRadius: 12, backgroundColor: theme.colors.surfaceAlt },
  pieceName: { ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 4 },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 4 },
  noteText: { flex: 1, ...theme.typography.caption, color: theme.colors.danger },
  starters: { gap: 8, paddingTop: 4 },
  startersLabel: { ...theme.typography.caption, color: theme.colors.textMuted, marginBottom: 2 },
  starter: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  starterText: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
  privacy: { ...theme.typography.caption, color: theme.colors.textMuted, marginTop: theme.spacing.md },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: theme.spacing.page,
    paddingTop: 8,
    backgroundColor: theme.colors.background,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 130,
    paddingHorizontal: 16,
    paddingTop: 13,
    paddingBottom: 13,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    fontSize: 15,
  },
  send: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.brand,
  },
  sendOff: { opacity: 0.45 },
}));
