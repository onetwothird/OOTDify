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
//
// Long-press a message for reactions, reply, edit, unsend for everyone or
// remove for you (rules in features/community/chatThread.ts). The info button
// opens the conversation's settings (theme, mute, members, photos).
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
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
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  COMMUNITY_ROOM_ID,
  communityErrorMessage,
  editMessage,
  fetchChatTheme,
  subscribeToChatTheme,
  fetchMessages,
  fetchReadState,
  fetchPostsByIds,
  fetchReactions,
  fetchRoomMeta,
  fetchUserProfile,
  hideMessage,
  markConversationRead,
  sendMessage,
  sendPhotoMessage,
  setReaction,
  subscribeToMessages,
  subscribeToReactions,
  unsendMessage,
} from "../../../features/community/service";
import type { ChatMessageEntry, FeedPost } from "../../../features/community/types";
import { SHARED_POST_BODY } from "../../../features/community/postShare";
import { SharedPostCard } from "../../../features/community/components/SharedPostCard";
import { CHAT_EMOJI, showsCaption } from "../../../features/community/chatMedia";
import { chatTheme } from "../../../features/community/chatSettings";
import { firstUnreadId, seenState } from "../../../features/community/chatThread";
import {
  applyReaction,
  mergeMessage,
  messageActions,
  nextReaction,
  quoteOf,
  reactionChips,
  type MessageAction,
  type ReactionRow,
} from "../../../features/community/chatThread";
import { MessageActionSheet } from "../../../features/community/components/MessageActionSheet";
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

/** The actions a message offers as of the moment it is long-pressed. */
function actionsNow(message: ChatMessageEntry, meId: string | null): MessageAction[] {
  return messageActions(message, meId, Date.now());
}

/** Local calendar-day key so day separators match `dayLabel`'s boundaries. */
function dayKey(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : new Date(t).toDateString();
}

/** How often an open DM re-checks whether the other person has seen my last message. */
const PEER_READ_POLL_MS = 20_000;

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
  // Where "Unread messages" goes, fixed when the thread opens; and when the
  // other person in a DM last read it (for "Seen").
  const [unreadFromId, setUnreadFromId] = useState<string | null>(null);
  const [peerReadAt, setPeerReadAt] = useState<string | null>(null);
  // Resolved display names in state, so a late realtime name resolution
  // re-renders instead of sitting invisible behind a ref.
  const [names, setNames] = useState<Record<string, string>>({});
  // Real avatar refs resolved from the directory (null = honest initial).
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  // Messages that arrived while the viewer was scrolled up.
  const [newCount, setNewCount] = useState(0);
  const [reactions, setReactions] = useState<ReactionRow[]>([]);
  // Posts sent in this chat, by id (null = deleted), fetched as messages arrive.
  const [sharedPosts, setSharedPosts] = useState<Map<string, FeedPost | null>>(new Map());
  const [sharedLoading, setSharedLoading] = useState(false);
  // The long-pressed message and the actions it offered at that moment.
  const [selected, setSelected] = useState<{ message: ChatMessageEntry; actions: MessageAction[] } | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessageEntry | null>(null);
  const [editing, setEditing] = useState<ChatMessageEntry | null>(null);
  const [themeKey, setThemeKey] = useState<string | null>(null);
  // Briefly outlines the message a reply quote jumped to.
  const [highlightId, setHighlightId] = useState<string | null>(null);

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
        // Read my last-read time before marking the thread read, so the
        // divider shows what was new when I opened it.
        const { data: session } = await supabase.auth.getSession();
        const uid = session.session?.user?.id ?? null;
        const reads = await fetchReadState(conversationId).catch(() => null);
        if (cancelled) return;
        setUnreadFromId(reads && uid ? firstUnreadId(rows, reads.get(uid) ?? null, uid) : null);
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

  // DMs show "Seen" under my last message: re-check the other person's read
  // time when messages change and every 20s while the thread is open.
  const messageCount = messages?.length ?? 0;
  useEffect(() => {
    if (!conversationId || !peerId) return;
    let alive = true;
    const check = () =>
      void fetchReadState(conversationId)
        .then((reads) => {
          if (alive) setPeerReadAt(reads.get(peerId) ?? null);
        })
        .catch(() => {});
    check();
    const timer = setInterval(check, PEER_READ_POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [conversationId, peerId, messageCount]);

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
    }, (row) => {
      // An edit or an unsend, from me on another device or from the other side.
      setMessages((prev) => (prev ? mergeMessage(prev, row) : prev));
    });
    return unsubscribe;
  }, [conversationId, rememberName, rememberAvatar]);

  // Reactions: one load, then live changes (a removal arrives as a null emoji).
  useEffect(() => {
    if (!conversationId) return;
    let alive = true;
    void fetchReactions(conversationId)
      .then((rows) => {
        if (alive) setReactions(rows);
      })
      .catch(() => {});
    const unsubscribe = subscribeToReactions(conversationId, (row) =>
      setReactions((prev) => applyReaction(prev, row)),
    );
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [conversationId]);

  // Someone else changing the theme repaints this thread while it's open.
  useEffect(() => {
    if (!conversationId) return;
    let alive = true;
    const unsubscribe = subscribeToChatTheme(conversationId, () => {
      void fetchChatTheme(conversationId)
        .then((key) => {
          if (alive) setThemeKey(key);
        })
        .catch(() => {});
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [conversationId]);

  // The shared theme and the room's name/icon can change in settings, so
  // re-read them whenever the thread comes back into view.
  useFocusEffect(
    useCallback(() => {
      if (!conversationId) return;
      let alive = true;
      void fetchChatTheme(conversationId)
        .then((key) => {
          if (alive) setThemeKey(key);
        })
        .catch(() => {});
      void fetchRoomMeta(conversationId)
        .then((meta) => {
          if (!alive || !meta) return;
          setGroupMeta((g) =>
            g ? { ...g, title: meta.title || g.title, iconUrl: meta.iconUrl, iconPreset: meta.iconPreset, mine: meta.canEdit } : g,
          );
          if (meta.title && (meta.isPublic || conversationId === COMMUNITY_ROOM_ID)) setTitle(meta.title);
        })
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, [conversationId]),
  );

  // Load the posts carried by messages we haven't resolved yet.
  const missingPostIds = useMemo(
    () => [
      ...new Set(
        (messages ?? [])
          .map((m) => m.shared_post_id)
          .filter((id): id is string => id !== null && !sharedPosts.has(id)),
      ),
    ],
    [messages, sharedPosts],
  );
  const missingKey = missingPostIds.join(",");
  useEffect(() => {
    if (!missingKey) return;
    const ids = missingKey.split(",");
    let alive = true;
    void Promise.resolve()
      .then(() => {
        if (alive) setSharedLoading(true);
        return fetchPostsByIds(ids);
      })
      .then((found) => {
        if (!alive) return;
        setSharedPosts((prev) => {
          const next = new Map(prev);
          for (const id of ids) next.set(id, found.get(id) ?? null);
          return next;
        });
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setSharedLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [missingKey]);

  const byId = useMemo(() => new Map((messages ?? []).map((m) => [m.id, m])), [messages]);
  const reactionsByMessage = useMemo(() => {
    const map = new Map<string, ReactionRow[]>();
    for (const r of reactions) {
      const list = map.get(r.message_id);
      if (list) list.push(r);
      else map.set(r.message_id, [r]);
    }
    return map;
  }, [reactions]);
  const chatColors = chatTheme(themeKey);
  // The chat theme repaints the thread: background, both sides' bubbles, the
  // accent and the muted text on the background. Null keeps the app's colours.
  const themed = useMemo(() => {
    const c = chatColors;
    if (!c) return null;
    return {
      thread: { backgroundColor: c.background },
      muted: { color: c.muted },
      line: { backgroundColor: c.muted, opacity: 0.35 },
      mine: { backgroundColor: c.mine, borderColor: c.mine },
      onMine: { color: c.onMine },
      theirs: { backgroundColor: c.theirs, borderColor: c.theirs },
      onTheirs: { color: c.onTheirs },
      accentBg: { backgroundColor: c.accent },
      accentBorder: { borderColor: c.accent },
      unsent: { backgroundColor: c.background, borderColor: c.muted },
      quoteMine: { borderLeftColor: c.onMine },
      quoteTheirs: { borderLeftColor: c.accent, backgroundColor: c.background },
      chip: { backgroundColor: c.theirs, borderColor: c.theirs },
      // Header, reply bar, emoji tray and composer use the theirs pair, so the
      // whole screen changes with the theme, not just the thread.
      bar: { backgroundColor: c.theirs, borderTopColor: c.theirs, borderBottomColor: c.theirs },
      onBar: { color: c.onTheirs },
      input: { backgroundColor: c.background, color: c.onTheirs },
    };
  }, [chatColors]);

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
      if (editing) {
        await editMessage(editing.id, body);
        setEditing(null);
        setDraft("");
        await load();
        return;
      }
      await sendMessage(conversationId, body, replyTo?.id ?? null);
      setReplyTo(null);
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
  }, [draft, sending, conversationId, load, t, editing, replyTo]);

  /** Sends a picked photo, with whatever is typed as its caption. */
  const sendPhoto = useCallback(
    async (uri: string): Promise<boolean> => {
      if (!conversationId) return false;
      try {
        await sendPhotoMessage(conversationId, uri, draft, replyTo?.id ?? null);
        setReplyTo(null);
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
    [conversationId, draft, load, t, replyTo],
  );

  const nameOf = useCallback(
    (m: ChatMessageEntry) =>
      m.sender_id === meId
        ? t("community.chat.you")
        : m.senderName || names[m.sender_id] || t("community.chat.default_member_name"),
    [meId, names, t],
  );

  const openActions = (message: ChatMessageEntry) =>
    setSelected({ message, actions: actionsNow(message, meId) });

  const myReactionOn = (messageId: string) =>
    reactions.find((r) => r.message_id === messageId && r.user_id === meId)?.emoji ?? null;

  const react = async (message: ChatMessageEntry, emoji: string) => {
    setSelected(null);
    if (!meId) return;
    const current = myReactionOn(message.id);
    const next = nextReaction(current, emoji);
    const at = new Date().toISOString();
    // Optimistic; the realtime echo carries the same row.
    setReactions((prev) => applyReaction(prev, { message_id: message.id, user_id: meId, emoji: next, created_at: at }));
    try {
      await setReaction(message.id, next);
    } catch (e) {
      setReactions((prev) => applyReaction(prev, { message_id: message.id, user_id: meId, emoji: current, created_at: at }));
      toast.error(t("community.chat.react_error"), communityErrorMessage(e));
    }
  };

  const runAction = async (message: ChatMessageEntry, action: Exclude<MessageAction, "react">) => {
    setSelected(null);
    if (action === "reply") {
      setEditing(null);
      setReplyTo(message);
      return;
    }
    if (action === "edit") {
      setReplyTo(null);
      setEditing(message);
      setDraft(message.body);
      return;
    }
    try {
      if (action === "unsend_everyone") {
        await unsendMessage(message);
        setMessages((prev) =>
          prev ? mergeMessage(prev, { ...message, body: "", image_ref: null, unsent_at: new Date().toISOString() }) : prev,
        );
        setReactions((prev) => prev.filter((r) => r.message_id !== message.id));
      } else {
        await hideMessage(message.id);
        setMessages((prev) => (prev ? prev.filter((m) => m.id !== message.id) : prev));
      }
      if (replyTo?.id === message.id) setReplyTo(null);
      if (editing?.id === message.id) {
        setEditing(null);
        setDraft("");
      }
    } catch (e) {
      toast.error(
        action === "unsend_everyone" ? t("community.chat.unsend_error") : t("community.chat.remove_error"),
        communityErrorMessage(e),
      );
    }
  };

  /** Scroll to the message a reply quotes and outline it for a moment. */
  const jumpTo = (messageId: string) => {
    const index = (messages ?? []).findIndex((m) => m.id === messageId);
    if (index < 0) {
      toast.info(t("community.chat.quote_gone"));
      return;
    }
    atBottomRef.current = false;
    listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.4 });
    setHighlightId(messageId);
    setTimeout(() => setHighlightId((h) => (h === messageId ? null : h)), 1600);
  };

  const cancelContext = () => {
    if (editing) setDraft("");
    setEditing(null);
    setReplyTo(null);
  };

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
      <View style={[styles.header, themed?.bar, { paddingTop: insets.top + 6 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("community.chat.back_a11y")}
          hitSlop={8}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="arrow-back" size={22} color={chatColors?.onTheirs ?? theme.colors.text} />
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
            <Text style={[styles.headerTitle, themed?.onBar]} numberOfLines={1}>
              {title}
            </Text>
            <Text style={[styles.headerSubtitle, themed?.onBar]} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        </View>
        {conversationId ? (
          <HeaderIconButton
            icon="information-circle-outline"
            color={chatColors?.onTheirs}
            accessibilityLabel={t("community.chat.settings_a11y")}
            onPress={() => router.push({ pathname: "/community/chat-settings/[id]", params: { id: conversationId } })}
          />
        ) : null}
      </View>

      {/* ------------------------------------------------- Thread + composer */}
      <KeyboardAvoidingView
        style={styles.kav}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <View style={[styles.thread, themed?.thread]}>
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
              onScrollToIndexFailed={(info) => {
                // Rows are measured lazily: get close, then aim again.
                listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
                setTimeout(
                  () => listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.4 }),
                  120,
                );
              }}
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
                  <Text style={[styles.emptyText, themed?.muted]}>{t("community.chat.empty_thread")}</Text>
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

                const seen =
                  peerId && !groupMeta && index === (messages?.length ?? 0) - 1
                    ? seenState(item, peerReadAt, meId)
                    : null;
                return (
                  <View
                    style={isFirst && index > 0 ? styles.msgBlockGap : undefined}
                  >
                    {item.id === unreadFromId ? (
                      <View style={styles.unreadRow} accessibilityRole="header">
                        <View style={[styles.unreadLine, themed?.accentBg]} />
                        <Text style={[styles.unreadLabel, chatColors ? { color: chatColors.muted } : null]}>
                          {t("community.chat.unread_divider")}
                        </Text>
                        <View style={[styles.unreadLine, themed?.accentBg]} />
                      </View>
                    ) : null}
                    {startsNewDay ? (
                      <View style={styles.dayRow}>
                        <View style={[styles.dayLine, themed?.line]} />
                        <Text style={[styles.dayText, themed?.muted]}>{dayLabel(item.created_at)}</Text>
                        <View style={[styles.dayLine, themed?.line]} />
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
                          <Text style={[styles.msgName, themed?.muted]} numberOfLines={1}>
                            {displayName}
                          </Text>
                        ) : null}
                        {item.unsent_at ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityHint={t("community.chat.actions_hint")}
                            onLongPress={() => openActions(item)}
                            delayLongPress={280}
                            style={[styles.bubble, styles.bubbleUnsent, themed?.unsent, bubbleRadius]}
                          >
                            <View style={styles.unsentRow}>
                              <Ionicons name="arrow-undo-outline" size={14} color={chatColors?.muted ?? theme.colors.textMuted} />
                              <Text style={[styles.unsentText, themed?.muted]}>
                                {mine
                                  ? t("community.chat.unsent.mine")
                                  : t("community.chat.unsent.theirs", { name: displayName })}
                              </Text>
                            </View>
                            {isLast ? <Text style={[styles.bubbleClock, themed?.muted]}>{clockLabel(item.created_at)}</Text> : null}
                          </Pressable>
                        ) : (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityHint={t("community.chat.actions_hint")}
                            onLongPress={() => openActions(item)}
                            delayLongPress={280}
                            style={[
                              styles.bubble,
                              bubbleRadius,
                              mine && styles.bubbleMine,
                              themed ? (mine ? themed.mine : themed.theirs) : null,
                              highlightId === item.id && styles.bubbleHighlight,
                            ]}
                          >
                            {item.reply_to ? (
                              (() => {
                                const original = byId.get(item.reply_to);
                                const quote = quoteOf(original);
                                const text =
                                  quote.kind === "missing"
                                    ? t("community.chat.quote.missing")
                                    : quote.kind === "unsent"
                                      ? t("community.chat.quote.unsent")
                                      : quote.kind === "photo"
                                        ? quote.text || t("community.chat.quote.photo")
                                        : quote.text;
                                return (
                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={t("community.chat.quote.a11y", {
                                      name: original ? nameOf(original) : "",
                                    })}
                                    onPress={() => item.reply_to && jumpTo(item.reply_to)}
                                    style={[styles.quote, mine && styles.quoteMine, themed ? (mine ? themed.quoteMine : themed.quoteTheirs) : null]}
                                  >
                                    {original ? (
                                      <Text
                                        style={[styles.quoteName, mine && styles.quoteTextMine, themed ? (mine ? themed.onMine : themed.onTheirs) : null]}
                                        numberOfLines={1}
                                      >
                                        {nameOf(original)}
                                      </Text>
                                    ) : null}
                                    <Text
                                      style={[
                                        styles.quoteText,
                                        mine && styles.quoteTextMine,
                                        themed ? [mine ? themed.onMine : themed.onTheirs, styles.clockOnTheme] : null,
                                        quote.kind !== "text" && quote.kind !== "photo" && styles.quoteGone,
                                      ]}
                                      numberOfLines={2}
                                    >
                                      {quote.kind === "photo" ? `📷 ${text}` : text}
                                    </Text>
                                  </Pressable>
                                );
                              })()
                            ) : null}
                            {item.shared_post_id ? (
                              <SharedPostCard
                                post={sharedPosts.get(item.shared_post_id)}
                                loading={sharedLoading}
                                onOpen={(postId) => router.push({ pathname: "/community/post/[id]", params: { id: postId } })}
                              />
                            ) : null}
                            {item.image_ref ? (
                              <SmartImage
                                source={item.image_ref}
                                style={styles.bubbleImage}
                                accessibilityLabel={t("community.chat.photo.a11y")}
                              />
                            ) : null}
                            {(!item.image_ref || showsCaption(item.body)) &&
                            !(item.shared_post_id && item.body === SHARED_POST_BODY) ? (
                              <Text
                                style={[
                                  styles.bubbleText,
                                  mine && styles.bubbleTextMine,
                                  themed ? (mine ? themed.onMine : themed.onTheirs) : null,
                                ]}
                              >
                                {item.body}
                              </Text>
                            ) : null}
                            {isLast || item.edited_at ? (
                              <Text
                                style={[
                                  styles.bubbleClock,
                                  mine && styles.bubbleClockMine,
                                  themed ? [mine ? themed.onMine : themed.onTheirs, styles.clockOnTheme] : null,
                                ]}
                              >
                                {[item.edited_at ? t("community.chat.edited") : null, isLast ? clockLabel(item.created_at) : null]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </Text>
                            ) : null}
                          </Pressable>
                        )}
                        {(() => {
                          const chips = reactionChips(reactionsByMessage.get(item.id) ?? [], meId);
                          if (chips.length === 0 || item.unsent_at) return null;
                          return (
                            <View style={[styles.chips, mine && styles.chipsMine]}>
                              {chips.map((chip) => (
                                <Pressable
                                  key={chip.emoji}
                                  accessibilityRole="button"
                                  accessibilityState={{ selected: chip.mine }}
                                  accessibilityLabel={t("community.chat.reaction_chip_a11y", {
                                    emoji: chip.emoji,
                                    count: chip.count,
                                  })}
                                  onPress={() => void react(item, chip.emoji)}
                                  style={({ pressed }) => [
                                    styles.chip,
                                    themed?.chip,
                                    chip.mine && (themed ? themed.accentBorder : styles.chipMine),
                                    pressed && { opacity: 0.7 },
                                  ]}
                                >
                                  <Text style={styles.chipEmoji}>{chip.emoji}</Text>
                                  {chip.count > 1 ? <Text style={[styles.chipCount, themed?.onTheirs]}>{chip.count}</Text> : null}
                                </Pressable>
                              ))}
                            </View>
                          );
                        })()}
                      </View>
                    </View>
                    {seen ? (
                      <Text style={[styles.seenText, themed?.muted]}>
                        {seen === "seen" ? t("community.chat.seen") : t("community.chat.sent")}
                      </Text>
                    ) : null}
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
        {replyTo || editing ? (
          <View style={[styles.contextBar, themed?.bar]}>
            <Ionicons
              name={editing ? "create-outline" : "arrow-undo-outline"}
              size={18}
              color={chatColors?.accent ?? theme.colors.brand}
            />
            <View style={styles.contextTexts}>
              <Text style={[styles.contextTitle, themed?.onBar]} numberOfLines={1}>
                {editing
                  ? t("community.chat.editing")
                  : t("community.chat.replying_to", { name: replyTo ? nameOf(replyTo) : "" })}
              </Text>
              <Text style={[styles.contextPreview, themed?.onBar]} numberOfLines={1}>
                {(() => {
                  const target = editing ?? replyTo;
                  if (!target) return "";
                  const q = quoteOf(target);
                  return q.kind === "photo" ? `📷 ${q.text || t("community.chat.quote.photo")}` : q.kind === "text" ? q.text : "";
                })()}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={editing ? t("community.chat.cancel_edit_a11y") : t("community.chat.cancel_reply_a11y")}
              hitSlop={8}
              onPress={cancelContext}
              style={({ pressed }) => [styles.composerBtn, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="close" size={20} color={chatColors?.onTheirs ?? theme.colors.textMuted} />
            </Pressable>
          </View>
        ) : null}
        {emojiOpen ? (
          <View style={[styles.emojiTray, themed?.bar]}>
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
        <View style={[styles.composer, themed?.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("community.chat.photo.title")}
            disabled={editing !== null}
            onPress={() => setPhotoOpen(true)}
            style={({ pressed }) => [styles.composerBtn, editing && styles.sendBtnDisabled, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="image-outline" size={23} color={chatColors?.onTheirs ?? theme.colors.textMuted} />
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
              color={chatColors?.onTheirs ?? (emojiOpen ? theme.colors.brand : theme.colors.textMuted)}
            />
          </Pressable>
          <TextInput
            style={[styles.composerInput, themed?.input]}
            value={draft}
            onChangeText={setDraft}
            placeholder={editing ? t("community.chat.edit_placeholder") : t("community.chat.composer_placeholder")}
            placeholderTextColor={chatColors?.muted ?? theme.colors.textMuted}
            multiline
            maxLength={2000}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={editing ? t("community.chat.save_edit_a11y") : t("community.chat.send_a11y")}
            disabled={!draft.trim() || sending}
            onPress={() => void send()}
            style={[styles.sendBtn, themed?.accentBg, (!draft.trim() || sending) && styles.sendBtnDisabled]}
          >
            {sending ? (
              <ActivityIndicator size="small" color={chatColors?.onAccent ?? theme.colors.onBrand} />
            ) : (
              <Ionicons name={editing ? "checkmark" : "send"} size={18} color={chatColors?.onAccent ?? theme.colors.onBrand} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      <ChatPhotoSheet visible={photoOpen} onClose={() => setPhotoOpen(false)} onSend={sendPhoto} />
      <MessageActionSheet
        visible={selected !== null}
        preview={(() => {
          if (!selected) return "";
          const q = quoteOf(selected.message);
          return q.kind === "unsent"
            ? t("community.chat.quote.unsent")
            : q.kind === "photo"
              ? `📷 ${q.text || t("community.chat.quote.photo")}`
              : q.kind === "text"
                ? q.text
                : "";
        })()}
        actions={selected?.actions ?? []}
        myReaction={selected ? myReactionOn(selected.message.id) : null}
        onReact={(emoji) => selected && void react(selected.message, emoji)}
        onAction={(action) => selected && void runAction(selected.message, action)}
        onClose={() => setSelected(null)}
      />
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
  unreadRow: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 12 },
  unreadLine: { flex: 1, height: 1.5, backgroundColor: theme.colors.brand },
  unreadLabel: { fontSize: 12, fontWeight: "700", color: theme.colors.brand },
  seenText: { alignSelf: "flex-end", fontSize: 11.5, color: theme.colors.textMuted, marginTop: 3, marginRight: 4 },
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
  // "Unsent" is a mark, not a message: an outline with no fill.
  bubbleUnsent: { backgroundColor: theme.colors.background, borderStyle: "dashed", borderColor: theme.colors.border, borderWidth: 1 },
  bubbleHighlight: { borderColor: theme.colors.brand, borderWidth: 2 },
  unsentRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  unsentText: { fontSize: 13.5, fontStyle: "italic", color: theme.colors.textMuted },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.brand,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 4,
  },
  quoteMine: { borderLeftColor: theme.colors.onPrimaryMuted, backgroundColor: "transparent" },
  quoteName: { fontSize: 11.5, fontWeight: "700", color: theme.colors.text },
  quoteText: { fontSize: 12.5, color: theme.colors.textMuted },
  quoteTextMine: { color: theme.colors.onPrimaryMuted },
  quoteGone: { fontStyle: "italic" },
  clockOnTheme: { opacity: 0.75 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: -4, marginLeft: 8 },
  chipsMine: { alignSelf: "flex-end", marginLeft: 0, marginRight: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipMine: { borderColor: theme.colors.brand },
  chipEmoji: { fontSize: 13 },
  chipCount: { fontSize: 11.5, fontWeight: "600", color: theme.colors.text, fontVariant: ["tabular-nums"] },
  contextBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: theme.spacing.page,
    paddingRight: theme.spacing.page - 8,
    paddingVertical: 6,
    backgroundColor: theme.colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  contextTexts: { flex: 1, minWidth: 0 },
  contextTitle: { fontSize: 12.5, fontWeight: "700", color: theme.colors.text },
  contextPreview: { fontSize: 12.5, color: theme.colors.textMuted },
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
