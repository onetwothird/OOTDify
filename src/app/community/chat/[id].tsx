// C:\OOTDify\src\app\community\chat\[id].tsx
// One conversation: the shared community room or a 1:1 DM. Messages arrive live
// over Supabase Realtime; opening the thread (and each incoming message) marks
// it read so unread badges elsewhere stay truthful.
//
// Layout notes: the header renders outside the KeyboardAvoidingView so the
// keyboard only ever moves the thread + composer. The list is bottom-anchored
// (few messages rest at the floor) and auto-follows new messages only while the
// viewer is parked at the bottom — otherwise a tappable pill offers the jump
// instead of yanking their scroll position away.
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  COMMUNITY_ROOM_ID,
  communityErrorMessage,
  fetchMessages,
  fetchRoomMeta,
  fetchUserProfile,
  markConversationRead,
  sendMessage,
  sendPhotoMessage,
  subscribeToMessages,
} from "../../../features/community/service";
import type { ChatMessageEntry } from "../../../features/community/types";
import { CHAT_EMOJI, showsCaption } from "../../../features/community/chatMedia";
import { clockLabel, dayLabel } from "../../../features/community/format";
import { ChatPhotoSheet } from "../../../features/community/components/ChatPhotoSheet";
import { EditRoomIconSheet } from "../../../features/community/components/EditRoomIconSheet";
import { RoomIcon } from "../../../features/community/components/RoomIcon";
import { ProfileAvatar } from "../../../features/profile/ProfileAvatar";
import { ErrorState } from "../../../shared/components/StateViews";
import { SmartImage } from "../../../shared/components/SmartImage";
import { HeaderIconButton } from "../../../shared/components/ScreenHeader";
import { makeStyles } from "../../../shared/theme/makeStyles";
import { useAppTheme } from "../../../shared/theme/ThemeProvider";
import type { Theme } from "../../../shared/config/theme";
import { useT } from "../../../shared/i18n/useT";
import { supabase } from "../../../shared/lib/supabase";
import { toast } from "../../../shared/lib/toast";
import { fetchUnreadCount, markChatRead } from "../../../features/notifications/service";
import { useNotificationsStore } from "../../../features/notifications/store";
import { FlyingPreloader } from "../../../shared/components/FlyingPreloader";

// Consecutive messages from one sender cluster together for at most 5 minutes.
const CLUSTER_GAP_MS = 5 * 60_000;
// How close to the bottom (px) counts as "pinned" for auto-following.
const PIN_THRESHOLD_PX = 60;
// Corner radius used where a bubble tucks against its cluster neighbours.
const TUCK_RADIUS = 6;

/** Local calendar-day key so day separators match `dayLabel`'s boundaries. */
function dayKey(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : new Date(t).toDateString();
}

export default function ChatThreadScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = typeof id === "string" ? id : "";
  const { width } = useWindowDimensions();
  // Responsive bubble cap — ~78% of the viewport, never a fixed pixel width.
  const maxBubbleWidth = Math.max(180, Math.round(width * 0.78));

  const [meId, setMeId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [title, setTitle] = useState(() => t("community.chat.title.default"));
  // Set when this conversation is a public group room, so the header can show
  // its title/category and a group subtitle instead of a DM peer's.
  const [groupMeta, setGroupMeta] = useState<{
    title: string;
    category: string | null;
    /** True when the viewer created the room, so they may change its icon. */
    mine: boolean;
    iconUrl: string | null;
    iconPreset: string | null;
  } | null>(null);
  const [editingIcon, setEditingIcon] = useState(false);
  // The DM peer's id, kept so the header avatar can resolve alongside them.
  const [peerId, setPeerId] = useState<string | null>(null);
  // Resolved display names in state, so a late realtime name resolution
  // re-renders instead of sitting invisible behind a ref.
  const [names, setNames] = useState<Record<string, string>>({});
  // Real avatar refs resolved from the directory (null = honest initial).
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  // Messages that arrived while the viewer was scrolled up.
  const [newCount, setNewCount] = useState(0);

  const listRef = useRef<FlatList<ChatMessageEntry>>(null);
  // Sender-name cache so each realtime message resolves its name at most once.
  const nameCache = useRef<Map<string, string>>(new Map());
  // True while the viewer sits near the bottom (the only time we auto-follow).
  const atBottomRef = useRef(true);
  const loadedRef = useRef(false);

  const rememberName = useCallback((userId: string, name: string) => {
    if (!userId || !name) return;
    nameCache.current.set(userId, name);
    setNames((prev) => (prev[userId] === name ? prev : { ...prev, [userId]: name }));
  }, []);

  const rememberAvatar = useCallback((userId: string, avatar: string | null) => {
    if (!userId) return;
    setAvatars((prev) => (prev[userId] === avatar ? prev : { ...prev, [userId]: avatar }));
  }, []);

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

  // Resolve conversation title and peer info — inline async in effect to avoid setState-in-effect lint error.
  useEffect(() => {
    if (!conversationId) return;
    let alive = true;
    (async () => {
      try {
        // The pinned community room has a known title; DMs resolve the peer name.
        if (conversationId === COMMUNITY_ROOM_ID) {
          if (!alive) return;
          const fallback = t("community.chat.title.community_chat");
          setTitle(fallback);
          // Its admin (the room's creator) can rename it and give it a picture
          // like any room.
          const meta = await fetchRoomMeta(conversationId);
          if (!alive || !meta) return;
          const roomTitle = meta.title || fallback;
          setTitle(roomTitle);
          setGroupMeta({
            title: roomTitle,
            category: null,
            mine: meta.canEdit,
            iconUrl: meta.iconUrl,
            iconPreset: meta.iconPreset,
          });
          return;
        }
        // A public group room is named by its own title, not by a peer.
        const meta = await fetchRoomMeta(conversationId);
        if (!alive) return;
        if (meta?.isPublic && meta.title) {
          setGroupMeta({
            title: meta.title,
            category: meta.category,
            mine: meta.canEdit,
            iconUrl: meta.iconUrl,
            iconPreset: meta.iconPreset,
          });
          setTitle(meta.title);
          return;
        }
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
        const peer = await fetchUserProfile(otherId);
        if (!alive) return;
        setPeerId(otherId);
        rememberName(otherId, peer?.display_name || peer?.first_name || t("community.post.default_author"));
        rememberAvatar(otherId, peer?.avatar_url ?? null);
        setTitle(peer?.display_name || peer?.first_name || t("community.chat.title.default"));
      } catch {
        /* title stays "Chat" — non-fatal */
      }
    })();
    return () => {
      alive = false;
    };
  }, [conversationId, rememberName, rememberAvatar, t]);

  const load = useCallback(async () => {
    if (!conversationId) return;
    setError(null);
    try {
      const rows = await fetchMessages(conversationId);
      for (const m of rows) {
        nameCache.current.set(m.sender_id, m.senderName);
        rememberAvatar(m.sender_id, m.senderAvatar);
      }
      setMessages(rows);
      await markConversationRead(conversationId);
    } catch (e) {
      setError(communityErrorMessage(e));
    }
  }, [conversationId, rememberAvatar]);

  // Opening a chat reads its message notifications; while it stays open, new
  // ones are read on arrival (see NotificationsHost).
  const setActiveChat = useNotificationsStore((s) => s.setActiveChat);
  const setUnread = useNotificationsStore((s) => s.setUnread);
  useEffect(() => {
    if (!conversationId) return;
    setActiveChat(conversationId);
    void markChatRead(conversationId)
      .then(fetchUnreadCount)
      .then(setUnread)
      .catch(() => {});
    return () => setActiveChat(null);
  }, [conversationId, setActiveChat, setUnread]);

  // Load initial messages — inline async in effect to avoid setState-in-effect lint error.
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchMessages(conversationId);
        if (cancelled) return;
        for (const m of rows) {
          nameCache.current.set(m.sender_id, m.senderName);
          rememberAvatar(m.sender_id, m.senderAvatar);
        }
        setMessages(rows);
        await markConversationRead(conversationId);
      } catch (e) {
        if (cancelled) return;
        setError(communityErrorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, rememberAvatar]);

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
      // Viewer scrolled up? Count the arrival for the pill — the follow effect
      // below only auto-scrolls while atBottomRef says we're pinned, so nobody
      // gets yanked down mid-read.
      if (!atBottomRef.current) setNewCount((c) => c + 1);
      // Resolve the sender's identity once, lazily — realtime payloads carry
      // no join, so `senderName` arrives blank and must never render as an
      // empty header (state write → re-render once it resolves).
      if (message.sender_id && !nameCache.current.has(message.sender_id)) {
        void fetchUserProfile(message.sender_id)
          .then((peer) => {
            rememberName(
              message.sender_id,
              peer?.display_name || peer?.first_name || t("community.post.default_author"),
            );
            rememberAvatar(message.sender_id, peer?.avatar_url ?? null);
          })
          .catch(() => {});
      }
    });
    return unsubscribe;
  }, [conversationId, rememberName, rememberAvatar]);

  const jumpToBottom = useCallback((animated: boolean) => {
    atBottomRef.current = true;
    setNewCount(0);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated }));
  }, []);

  // Track scroll position: only stay pinned while the viewer is near the end.
  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const fromBottom =
      contentSize.height - layoutMeasurement.height - contentOffset.y;
    if (fromBottom <= PIN_THRESHOLD_PX) {
      if (!atBottomRef.current) {
        atBottomRef.current = true;
        setNewCount(0); // back at the floor — the pill has done its job
      }
    } else {
      atBottomRef.current = false;
    }
  }, []);

  // Follow the newest message into view — but never yank the viewer down when
  // they've scrolled up reading history (arrivals are counted for the pill by
  // the realtime callback instead).
  useEffect(() => {
    if (!messages) return;
    if (!loadedRef.current) {
      loadedRef.current = true;
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
      return;
    }
    if (atBottomRef.current) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages]);

  // Android (resize mode): opening the keyboard re-pins the thread to the
  // newest message; closing it only re-pins if we were already following.
  // iOS gets the same guarantee from KeyboardAvoidingView's "padding" behavior.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const showSub = Keyboard.addListener("keyboardDidShow", () =>
      jumpToBottom(true),
    );
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      if (atBottomRef.current) jumpToBottom(false);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [jumpToBottom]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending || !conversationId) return;
    setSending(true);
    try {
      await sendMessage(conversationId, body);
      setDraft("");
      // I just wrote — follow my own message to the floor.
      atBottomRef.current = true;
      setNewCount(0);
      await load(); // full refetch keeps ordering + names exact
    } catch (e) {
      toast.error(t("community.chat.send_error.title"), communityErrorMessage(e));
    } finally {
      setSending(false);
    }
  }, [draft, sending, conversationId, load, t]);

  /** Sends a picked photo, with whatever is typed as its caption. */
  const sendPhoto = useCallback(
    async (uri: string): Promise<boolean> => {
      if (!conversationId) return false;
      try {
        await sendPhotoMessage(conversationId, uri, draft);
        setDraft("");
        atBottomRef.current = true;
        setNewCount(0);
        await load();
        return true;
      } catch (e) {
        toast.error(t("community.chat.photo.error"), communityErrorMessage(e));
        return false;
      }
    },
    [conversationId, draft, load, t],
  );

  const headerInitial =
    conversationId === COMMUNITY_ROOM_ID
      ? "OC"
      : groupMeta
        ? groupMeta.title.slice(0, 2).toUpperCase()
        : (title.trim()[0] ?? "?").toUpperCase();
  // Honest subtitle: no presence feed exists, so nothing claims "online".
  const subtitle =
    conversationId === COMMUNITY_ROOM_ID
      ? t("community.chat.subtitle.everyone")
      : groupMeta
        ? groupMeta.category
          ? t("community.chat.subtitle.community_category", { category: groupMeta.category })
          : t("community.chat.subtitle.community")
        : t("community.chat.subtitle.dm");

  const showNewPill =
    newCount > 0 && Boolean(conversationId) && messages !== null && !error;

  return (
    <View style={styles.screen}>
      {/* ---------------------------------------------------------- Header
          Outside the KeyboardAvoidingView: the keyboard must never shove the
          identity row around. */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("community.chat.back_a11y")}
          hitSlop={8}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </Pressable>
        <View style={styles.headerIdentity}>
          {groupMeta ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("community.room_icon.change_a11y")}
              disabled={!groupMeta.mine}
              onPress={() => setEditingIcon(true)}
              style={({ pressed }) => pressed && { opacity: 0.8 }}
            >
              <RoomIcon
                size={38}
                title={groupMeta.title}
                iconUrl={groupMeta.iconUrl}
                iconPreset={groupMeta.iconPreset}
              />
            </Pressable>
          ) : (
            <ProfileAvatar
              size={38}
              initial={headerInitial}
              avatarRef={
                conversationId === COMMUNITY_ROOM_ID
                  ? null
                  : peerId
                    ? avatars[peerId] ?? null
                    : null
              }
            />
          )}
          <View style={styles.headerTexts}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        </View>
        <HeaderIconButton
          icon="refresh"
          accessibilityLabel={t("community.chat.reload_a11y")}
          onPress={() => void load()}
        />
      </View>

      {/* ------------------------------------------------- Thread + composer */}
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.thread}>
          {!conversationId ? (
            <View style={styles.stateFill}>
              <ErrorState message={t("community.chat.missing_id")} />
            </View>
          ) : messages === null && !error ? (
            <View style={styles.stateFill}>
              <FlyingPreloader size={88} />
            </View>
          ) : error ? (
            <View style={styles.stateFill}>
              <ErrorState message={error} onRetry={() => void load()} />
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={messages ?? []}
              keyExtractor={(m) => m.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              scrollEventThrottle={16}
              onScroll={handleScroll}
              onContentSizeChange={() => {
                // Re-pin on content growth only while already following —
                // never yank a viewer who scrolled up to read.
                if (atBottomRef.current) listRef.current?.scrollToEnd({ animated: false });
              }}
              ListEmptyComponent={
                <View style={styles.emptyThread}>
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={34}
                    color={theme.colors.textMuted}
                  />
                  <Text style={styles.emptyText}>{t("community.chat.empty_thread")}</Text>
                </View>
              }
              renderItem={({ item, index }) => {
                const rows = messages ?? [];
                const prev = index > 0 ? rows[index - 1] : null;
                const next = index < rows.length - 1 ? rows[index + 1] : null;
                const mine = item.sender_id === meId;

                // ---- Visual clustering: same sender inside 5 minutes -------
                const startsNewDay =
                  prev !== null && dayKey(prev.created_at) !== dayKey(item.created_at);
                const gapFromPrev = prev
                  ? Date.parse(item.created_at) - Date.parse(prev.created_at)
                  : Number.NaN;
                const gapToNext = next
                  ? Date.parse(next.created_at) - Date.parse(item.created_at)
                  : Number.NaN;
                const isFirst =
                  prev === null ||
                  startsNewDay ||
                  prev.sender_id !== item.sender_id ||
                  !(gapFromPrev >= 0 && gapFromPrev <= CLUSTER_GAP_MS);
                const isLast =
                  next === null ||
                  dayKey(next.created_at) !== dayKey(item.created_at) ||
                  next.sender_id !== item.sender_id ||
                  !(gapToNext >= 0 && gapToNext <= CLUSTER_GAP_MS);

                const displayName =
                  item.senderName || names[item.sender_id] || t("community.chat.default_member_name");
                const initial = (displayName[0] ?? "?").toUpperCase();
                // Real ref from the initial fetch, or one resolved lazily for
                // realtime inserts; null falls back to the honest initial.
                const rowAvatar = item.senderAvatar ?? avatars[item.sender_id] ?? null;

                // Tuck the cluster on the sender's side: smaller radius where a
                // bubble meets its neighbour, full radius everywhere else.
                const radius = theme.borderRadius.lg;
                const bubbleRadius = {
                  borderTopLeftRadius: isFirst || mine ? radius : TUCK_RADIUS,
                  borderBottomLeftRadius: isLast || mine ? radius : TUCK_RADIUS,
                  borderTopRightRadius: isFirst || !mine ? radius : TUCK_RADIUS,
                  borderBottomRightRadius: isLast || !mine ? radius : TUCK_RADIUS,
                };

                return (
                  <View
                    style={isFirst && index > 0 ? styles.msgBlockGap : undefined}
                  >
                    {startsNewDay ? (
                      <View style={styles.dayRow}>
                        <View style={styles.dayLine} />
                        <Text style={styles.dayText}>{dayLabel(item.created_at)}</Text>
                        <View style={styles.dayLine} />
                      </View>
                    ) : null}

                    <View style={[styles.msgRow, mine && styles.msgRowMine]}>
                      {!mine ? (
                        isFirst ? (
                          <ProfileAvatar size={32} initial={initial} avatarRef={rowAvatar} />
                        ) : (
                          <View style={styles.avatarSpacer} />
                        )
                      ) : null}
                      <View style={[styles.msgCol, { maxWidth: maxBubbleWidth }]}>
                        {!mine && isFirst ? (
                          <Text style={styles.msgName} numberOfLines={1}>
                            {displayName}
                          </Text>
                        ) : null}
                        <View
                          style={[styles.bubble, bubbleRadius, mine && styles.bubbleMine]}
                        >
                          {item.image_ref ? (
                            <SmartImage
                              source={item.image_ref}
                              style={styles.bubbleImage}
                              accessibilityLabel={t("community.chat.photo.a11y")}
                            />
                          ) : null}
                          {!item.image_ref || showsCaption(item.body) ? (
                            <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>
                              {item.body}
                            </Text>
                          ) : null}
                          {isLast ? (
                            <Text
                              style={[styles.bubbleClock, mine && styles.bubbleClockMine]}
                            >
                              {clockLabel(item.created_at)}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  </View>
                );
              }}
            />
          )}

          {/* Tappable jump pill, parked right above the composer. */}
          {showNewPill ? (
            <View style={styles.pillLayer} pointerEvents="box-none">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("community.chat.scroll_a11y", { count: newCount })}
                onPress={() => jumpToBottom(true)}
                style={({ pressed }) => [styles.newPill, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name="arrow-down" size={14} color={theme.colors.onBrand} />
                <Text style={styles.newPillText}>
                  {t("community.chat.new_pill", { count: newCount })}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* ---------------------------------------------------------- Composer */}
        {emojiOpen ? (
          <View style={styles.emojiTray}>
            {CHAT_EMOJI.map((emoji) => (
              <Pressable
                key={emoji}
                accessibilityRole="button"
                accessibilityLabel={emoji}
                onPress={() => setDraft((d) => d + emoji)}
                style={({ pressed }) => [styles.emojiBtn, pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.emoji}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("community.chat.photo.title")}
            onPress={() => setPhotoOpen(true)}
            style={({ pressed }) => [styles.composerBtn, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="image-outline" size={23} color={theme.colors.textMuted} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("community.chat.emoji_a11y")}
            accessibilityState={{ expanded: emojiOpen }}
            onPress={() => setEmojiOpen((o) => !o)}
            style={({ pressed }) => [styles.composerBtn, pressed && { opacity: 0.6 }]}
          >
            <Ionicons
              name={emojiOpen ? "happy" : "happy-outline"}
              size={23}
              color={emojiOpen ? theme.colors.brand : theme.colors.textMuted}
            />
          </Pressable>
          <TextInput
            style={styles.composerInput}
            value={draft}
            onChangeText={setDraft}
            placeholder={t("community.chat.composer_placeholder")}
            placeholderTextColor={theme.colors.textMuted}
            multiline
            maxLength={2000}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("community.chat.send_a11y")}
            disabled={!draft.trim() || sending}
            onPress={() => void send()}
            style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
          >
            {sending ? (
              <ActivityIndicator size="small" color={theme.colors.onBrand} />
            ) : (
              <Ionicons name="send" size={18} color={theme.colors.onBrand} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      <ChatPhotoSheet visible={photoOpen} onClose={() => setPhotoOpen(false)} onSend={sendPhoto} />
      {groupMeta?.mine && conversationId ? (
        <EditRoomIconSheet
          visible={editingIcon}
          onClose={() => setEditingIcon(false)}
          roomId={conversationId}
          title={groupMeta.title}
          current={{ iconUrl: groupMeta.iconUrl, iconPreset: groupMeta.iconPreset }}
          onSaved={(next) => {
            setGroupMeta((m) => (m ? { ...m, ...next } : m));
            setTitle(next.title);
          }}
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.page,
    paddingBottom: 10,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  headerBtn: { padding: 6 },
  headerIdentity: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 },
  headerTexts: { flex: 1, minWidth: 0 },
  headerTitle: {
    fontSize: 15.5,
    fontWeight: "700",
    color: theme.colors.text,
    letterSpacing: -0.2,
  },
  headerSubtitle: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 1 },
  kav: { flex: 1 },
  thread: { flex: 1 },
  stateFill: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: {
    flexGrow: 1,
    justifyContent: "flex-end", // few messages sit at the floor of the screen
    paddingHorizontal: theme.spacing.page,
    paddingVertical: 12,
    gap: 3, // tight inside a cluster; clusters open up via msgBlockGap
  },
  emptyThread: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 48,
  },
  emptyText: { fontSize: 13, color: theme.colors.textMuted },
  msgBlockGap: { marginTop: 7 },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 10,
  },
  dayLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border },
  dayText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: theme.colors.textMuted,
  },
  msgRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  msgRowMine: { justifyContent: "flex-end" },
  avatarSpacer: { width: 32 },
  msgCol: { flexShrink: 1, alignItems: "flex-start" },
  msgName: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textMuted,
    marginBottom: 3,
    marginLeft: 2,
  },
  bubble: {
    maxWidth: "100%",
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  bubbleMine: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  bubbleImage: {
    width: 220,
    aspectRatio: 3 / 4,
    maxWidth: "100%",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceAlt,
  },
  emojiTray: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: theme.spacing.page,
    paddingVertical: 8,
    backgroundColor: theme.colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  emojiBtn: { width: "12.5%", alignItems: "center", paddingVertical: 6 },
  emoji: { fontSize: 24 },
  composerBtn: { width: 36, height: 42, alignItems: "center", justifyContent: "center" },
  bubbleText: { fontSize: 14.5, lineHeight: 20, color: theme.colors.text },
  bubbleTextMine: { color: theme.colors.onPrimary },
  // Exactly one clock label per cluster, trailing on its final bubble.
  bubbleClock: {
    fontSize: 10,
    color: theme.colors.textMuted,
    marginTop: 2,
    alignSelf: "flex-end",
  },
  bubbleClockMine: { color: theme.colors.onPrimaryMuted },
  pillLayer: { position: "absolute", left: 0, right: 0, bottom: 12, alignItems: "center" },
  newPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.brand,
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  newPillText: { fontSize: 12.5, fontWeight: "600", color: theme.colors.onBrand },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: theme.spacing.page,
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
    backgroundColor: theme.colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
}));
