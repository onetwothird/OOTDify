// C:\OOTDify\src\app\community\chat\[id].tsx
// One conversation: the shared community room or a 1:1 DM. Messages arrive live
// over Supabase Realtime; opening the thread (and each incoming message) marks
// it read so unread badges elsewhere stay truthful.
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  COMMUNITY_ROOM_ID,
  communityErrorMessage,
  fetchMessages,
  fetchUserDisplayName,
  markConversationRead,
  sendMessage,
  subscribeToMessages,
} from "../../../features/community/service";
import type { ChatMessageEntry } from "../../../features/community/types";
import { timeAgo } from "../../../features/community/format";
import { ErrorState } from "../../../shared/components/StateViews";
import { theme } from "../../../shared/config/theme";
import { supabase } from "../../../shared/lib/supabase";
import { toast } from "../../../shared/lib/toast";

export default function ChatThreadScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = typeof id === "string" ? id : "";

  const [meId, setMeId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [title, setTitle] = useState("Chat");

  const listRef = useRef<FlatList<ChatMessageEntry>>(null);
  // Sender-name cache so each realtime message resolves its name at most once.
  const nameCache = useRef<Map<string, string>>(new Map());

  // Viewer identity + conversation title.
  useEffect(() => {
    let alive = true;
    void supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (alive) setMeId(session?.user?.id ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    let alive = true;
    // The pinned community room has a known title; DMs resolve the peer name.
    if (conversationId === COMMUNITY_ROOM_ID) {
      setTitle("Community Chat");
      return;
    }
    void (async () => {
      try {
        const { data: mine } = await supabase.auth.getSession();
        const uid = mine?.session?.user?.id;
        if (!uid || !alive) return;
        const { data: others } = await supabase
          .from("conversation_participants")
          .select("user_id")
          .eq("conversation_id", conversationId)
          .neq("user_id", uid)
          .limit(1);
        const otherId = others?.[0]?.user_id;
        if (!otherId || !alive) return;
        nameCache.current.set(otherId, await fetchUserDisplayName(otherId));
        if (alive) setTitle(nameCache.current.get(otherId) ?? "Chat");
      } catch {
        /* title stays "Chat" — non-fatal */
      }
    })();
    return () => {
      alive = false;
    };
  }, [conversationId]);

  const load = useCallback(async () => {
    if (!conversationId) return;
    setError(null);
    try {
      const rows = await fetchMessages(conversationId);
      for (const m of rows) nameCache.current.set(m.sender_id, m.senderName);
      setMessages(rows);
      await markConversationRead(conversationId);
    } catch (e) {
      setError(communityErrorMessage(e));
    }
  }, [conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live messages: append (dedupe by id) and keep the newest in view.
  useEffect(() => {
    if (!conversationId) return;
    const unsubscribe = subscribeToMessages(conversationId, (message) => {
      setMessages((prev) => {
        if (!prev) return prev;
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
      // Mark read right away so the chat list badge doesn't linger.
      void markConversationRead(conversationId);
      // Resolve the sender's display name once, lazily.
      if (message.sender_id && !nameCache.current.has(message.sender_id)) {
        void fetchUserDisplayName(message.sender_id)
          .then((name) => {
            nameCache.current.set(message.sender_id, name);
          })
          .catch(() => {});
      }
    });
    return unsubscribe;
  }, [conversationId]);

  // Follow the newest message into view.
  useEffect(() => {
    if (messages?.length) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages?.length]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending || !conversationId) return;
    setSending(true);
    try {
      await sendMessage(conversationId, body);
      setDraft("");
      await load(); // full refetch keeps ordering + names exact
    } catch (e) {
      toast.error("Could not send", communityErrorMessage(e));
    } finally {
      setSending(false);
    }
  }, [draft, sending, conversationId, load]);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      {/* ---------------------------------------------------------- Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          onPress={() => router.back()}
          style={styles.headerBtn}
        >
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={{ width: 34 }} />
      </View>

      {/* ---------------------------------------------------------- Thread */}
      {!conversationId ? (
        <ErrorState message="This chat link is missing its conversation id." />
      ) : messages === null && !error ? (
        <ActivityIndicator color={theme.colors.primary} style={styles.centered} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : (
        <FlatList
          ref={listRef}
          data={messages ?? []}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyThread}>
              <Ionicons name="chatbubble-ellipses-outline" size={34} color={theme.colors.textMuted} />
              <Text style={styles.emptyText}>No messages yet — say hello.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.sender_id === meId;
            const showSender = !mine; // in a 1:1/room, the peer's name above their bubble
            const senderName =
              item.senderName || nameCache.current.get(item.sender_id) || "";
            return (
              <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
                <View style={[styles.bubble, mine && styles.bubbleMine]}>
                  {showSender && senderName ? (
                    <Text style={styles.bubbleSender}>{senderName}</Text>
                  ) : null}
                  <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>
                    {item.body}
                  </Text>
                  <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>
                    {timeAgo(item.created_at)}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* ---------------------------------------------------------- Composer */}
      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TextInput
          style={styles.composerInput}
          value={draft}
          onChangeText={setDraft}
          placeholder="Message…"
          placeholderTextColor={theme.colors.textMuted}
          multiline
          maxLength={2000}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          disabled={!draft.trim() || sending}
          onPress={() => void send()}
          style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
        >
          {sending ? (
            <ActivityIndicator size="small" color={theme.colors.onPrimary} />
          ) : (
            <Ionicons name="send" size={18} color={theme.colors.onPrimary} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  centered: { marginTop: 48 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  headerBtn: { padding: 6 },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 15, fontWeight: "800", color: theme.colors.text },
  listContent: { padding: 14, gap: 8, flexGrow: 1 },
  emptyThread: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 60 },
  emptyText: { fontSize: 13, color: theme.colors.textMuted },
  bubbleRow: { flexDirection: "row", justifyContent: "flex-start" },
  bubbleRowMine: { justifyContent: "flex-end" },
  bubble: {
    maxWidth: "80%",
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  bubbleMine: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  bubbleSender: { fontSize: 11, fontWeight: "800", color: theme.colors.textMuted },
  bubbleText: { fontSize: 14.5, lineHeight: 20, color: theme.colors.text },
  bubbleTextMine: { color: theme.colors.onPrimary },
  bubbleTime: { fontSize: 10, color: theme.colors.textMuted, marginTop: 2 },
  bubbleTimeMine: { color: "rgba(255,255,255,0.7)" },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: theme.colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  composerInput: {
    flex: 1,
    maxHeight: 120,
    minHeight: 42,
    fontSize: 14.5,
    color: theme.colors.text,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: "top",
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
});
