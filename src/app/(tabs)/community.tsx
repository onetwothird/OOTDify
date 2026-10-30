// C:\OOTDify\src\app\(tabs)\community.tsx
// Community — the social half of OOTDify:
//   Feed  · other users' shared outfits, likes, comments, DM shortcut
//   Chats · the shared Community Chat room + your 1:1 conversations
//   Friends · requests, your friends with online dots, and finding people
// My Day circles sit above the feed.
//
// Real data only: everything comes from the community tables in
// supabase/schema.sql through the community service. Until that schema is
// applied the screen says so plainly instead of inventing content.
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PostCard } from "../../features/community/components/PostCard";
import { ShareOutfitModal } from "../../features/community/components/ShareOutfitModal";
import { CreateRoomModal } from "../../features/community/components/CreateRoomModal";
import { FriendsPanel } from "../../features/community/components/FriendsPanel";
import { MyDayTray } from "../../features/community/components/MyDayTray";
import { RoomIcon } from "../../features/community/components/RoomIcon";
import {
  communityErrorMessage,
  deletePost,
  COMMUNITY_ROOM_ID,
  ensureCommunityRoom,
  fetchConversations,
  fetchRoomMeta,
  fetchFeed,
  fetchPublicRooms,
  joinRoom,
  subscribeToFeed,
} from "../../features/community/service";
import type { CommunityRoom, ConversationListEntry, FeedPost } from "../../features/community/types";
import { ProfileAvatar } from "../../features/profile/ProfileAvatar";
import { AppButton } from "../../shared/components/AppButton";
import { ScreenHeader } from "../../shared/components/ScreenHeader";
import { EmptyState, ErrorState } from "../../shared/components/StateViews";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { supabase } from "../../shared/lib/supabase";
import { timeAgo } from "../../features/community/format";
import { toast } from "../../shared/lib/toast";
import { useT } from "../../shared/i18n/useT";
import { useHideOnScroll, useTabBarSpace } from "../../shared/navigation/useTabChrome";
import { FlyingPreloader } from "../../shared/components/FlyingPreloader";

type Tab = "feed" | "chats" | "friends";

/**
 * Single horizontal gutter shared by the header, the segmented switcher and
 * both lists, so everything on this screen lines up on one vertical rail.
 */
const GUTTER = 20;

export default function CommunityScreen() {
  // The tab bar slides away while scrolling down; content clears it at the end.
  const hideOnScroll = useHideOnScroll();
  const tabBarSpace = useTabBarSpace();
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  // Header action responsiveness. The full "Share a look" button needs roughly
  // 150pt, the title + subtitle about 170pt, plus the gutter (2×20) and the
  // header's own gap (16) — about 376pt before anything has room to breathe.
  // A 380pt line therefore still compresses on 380–420pt phones, especially at
  // larger font scales, so collapse to the icon button at 430pt instead: the
  // label is never squeezed, and the title keeps a comfortable column.
  const condensed = width < 430;

  const [tab, setTab] = useState<Tab>("feed");
  // Notifications open a specific tab (?tab=friends); follow it whenever it
  // changes (render-phase adjust, no effect).
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [seenTabParam, setSeenTabParam] = useState<string | undefined>(undefined);
  if (tabParam !== seenTabParam) {
    setSeenTabParam(tabParam);
    if (tabParam === "feed" || tabParam === "chats" || tabParam === "friends") setTab(tabParam);
  }
  const [meId, setMeId] = useState<string | null>(null);

  // ---- Feed state ----------------------------------------------------------
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  // ---- Chats state ---------------------------------------------------------
  const [conversations, setConversations] = useState<ConversationListEntry[] | null>(null);
  const [chatsError, setChatsError] = useState<string | null>(null);
  const [chatsRefreshing, setChatsRefreshing] = useState(false);
  const [openingRoom, setOpeningRoom] = useState(false);

  // ---- Public group rooms (user-created communities) -----------------------
  const [rooms, setRooms] = useState<CommunityRoom[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  // Refs so the realtime handler always sees fresh state without resubscribing.
  const postsRef = useRef<FeedPost[] | null>(null);
  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  // Viewer identity (for "own post" rendering + messaging guards).
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

  const loadFeed = useCallback(async () => {

    try {
      setPosts(await fetchFeed());
      setFeedError(null);
    } catch (e) {
      setFeedError(communityErrorMessage(e));
    }
  }, []);

  // The everyone room's own name and picture, set by its admin.
  const [roomMeta, setRoomMeta] = useState<{ title: string | null; iconUrl: string | null; iconPreset: string | null } | null>(null);

  const loadChats = useCallback(async () => {
    void fetchRoomMeta(COMMUNITY_ROOM_ID)
      .then((m) => setRoomMeta(m))
      .catch(() => {});

    try {
      setConversations(await fetchConversations());
      setChatsError(null);
    } catch (e) {
      setChatsError(communityErrorMessage(e));
    }
  }, []);

  const loadRooms = useCallback(async () => {
    try {
      setRooms(await fetchPublicRooms());
    } catch (e) {
      // Rooms are a secondary section on the Chats tab; a failure here should
      // not blank out the user's own conversations, so surface it inline.
      setRooms([]);
      setChatsError(communityErrorMessage(e));
    }
  }, []);

  const refreshFeed = useCallback(async () => {
    setFeedRefreshing(true);
    await loadFeed();
    setFeedRefreshing(false);
  }, [loadFeed]);

  const refreshChats = useCallback(async () => {
    setChatsRefreshing(true);
    await Promise.all([loadChats(), loadRooms()]);
    setChatsRefreshing(false);
  }, [loadChats, loadRooms]);

  // Load both lists on mount; reload whichever tab is visible on focus.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchFeed();
        if (cancelled) return;
        setPosts(data);
        setFeedError(null);
      } catch (e) {
        if (cancelled) return;
        setFeedError(communityErrorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (tab !== "chats") return;
    let cancelled = false;
    (async () => {
      try {
        const [convs, roomsData] = await Promise.all([fetchConversations(), fetchPublicRooms()]);
        if (cancelled) return;
        setConversations(convs);
        setRooms(roomsData);
        setChatsError(null);
      } catch (e) {
        if (cancelled) return;
        setChatsError(communityErrorMessage(e));
        setRooms([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  // Live feed: any change (someone posts/likes/deletes) re-pulls the list.
  useEffect(() => {
    const unsubscribe = subscribeToFeed(() => {
      void loadFeed();
    });
    return unsubscribe;
  }, [loadFeed]);

  // ---- Feed actions --------------------------------------------------------
  const handleLikeChanged = useCallback(
    (postId: string, likedByMe: boolean, likeCount: number) => {
      setPosts(
        (prev) =>
          prev?.map((p) =>
            p.id === postId ? { ...p, likedByMe, like_count: likeCount } : p,
          ) ?? prev,
      );
    },
    [],
  );

  const handleDelete = useCallback(async (post: FeedPost) => {
    try {
      await deletePost(post);
      setPosts((prev) => prev?.filter((p) => p.id !== post.id) ?? prev);
      toast.success(t("community.toast.post_deleted"));
    } catch (e) {
      toast.error(t("community.toast.delete_error.title"), communityErrorMessage(e));
    }
  }, [t]);

  // ---- Chats actions -------------------------------------------------------
  const openCommunityRoom = useCallback(async () => {
    setOpeningRoom(true);
    try {
      const roomId = await ensureCommunityRoom();
      router.push(`/community/chat/${roomId}`);
    } catch (e) {
      toast.error(t("community.toast.room_error.title"), communityErrorMessage(e));
    } finally {
      setOpeningRoom(false);
    }
  }, [router, t]);

  /** Join a public room (if needed) and open it. */
  const openRoom = useCallback(
    async (room: CommunityRoom) => {
      setJoiningId(room.id);
      try {
        if (!room.joined) await joinRoom(room.id);
        router.push(`/community/chat/${room.id}`);
      } catch (e) {
        toast.error(t("community.toast.join_error.title"), communityErrorMessage(e));
      } finally {
        setJoiningId(null);
      }
    },
    [router, t],
  );

  const handleRoomCreated = useCallback(
    (roomId: string) => {
      setCreateOpen(false);
      void loadRooms();
      router.push(`/community/chat/${roomId}`);
    },
    [loadRooms, router],
  );

  // ---- Renderers -----------------------------------------------------------
  const renderFeedItem = useCallback(
    ({ item }: { item: FeedPost }) => (
      <PostCard
        post={item}
        isOwn={item.user_id === meId}
        onLikeChanged={handleLikeChanged}
        onDelete={(p) => void handleDelete(p)}
        onPostChanged={(next) => setPosts((prev) => prev?.map((p) => (p.id === next.id ? next : p)) ?? prev)}
        onHidden={(id) => setPosts((prev) => prev?.filter((p) => p.id !== id) ?? prev)}
        onReshared={() => void loadFeed()}
      />
    ),
    [meId, handleLikeChanged, handleDelete, loadFeed],
  );

  // Direct messages only. Group rooms are rendered under Communities, and the
  // fixed everyone-room has its own pinned row — so both are excluded here.
  const chatRows = (conversations ?? []).filter((c) => !c.isRoom && !c.isGroup);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      {/* Header is the one element rendered outside the lists, so it supplies
          its own horizontal inset — the same 20pt the segment row and list
          content use, keeping title, subtitle and action on one aligned rail. */}
      <View style={styles.headerWrap}>
        <ScreenHeader
          variant="tab"
          icon="people"
          title={t("community.title")}
          subtitle={t("community.subtitle")}
          right={
            condensed ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("community.share")}
                hitSlop={8}
                onPress={() => setShareOpen(true)}
                style={({ pressed }) => [styles.shareIconBtn, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="create-outline" size={20} color={theme.colors.onBrand} />
              </Pressable>
            ) : (
              <AppButton
                label={t("community.share")}
                icon="create-outline"
                size="md"
                onPress={() => setShareOpen(true)}
              />
            )
          }
        />
      </View>

      {/* ------------------------------------------------ Segmented switcher */}
      <View style={styles.segment}>
        {(["feed", "chats", "friends"] as Tab[]).map((key) => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
            onPress={() => setTab(key)}
            style={[styles.segmentBtn, tab === key && styles.segmentBtnActive]}
          >
            <Text style={[styles.segmentText, tab === key && styles.segmentTextActive]}>
              {key === "feed"
                ? t("community.tab.feed")
                : key === "chats"
                  ? t("community.tab.chats")
                  : t("community.tab.friends")}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === "friends" ? (
        <FriendsPanel bottomSpace={tabBarSpace} onScroll={hideOnScroll.onScroll} />
      ) : tab === "feed" ? (
        posts === null && !feedError ? (
          <FlyingPreloader size={88} style={styles.centered} />
        ) : feedError ? (
          <ErrorState message={feedError} onRetry={() => void loadFeed()} />
        ) : (
          <FlatList
            data={posts ?? []}
            keyExtractor={(p) => p.id}
            renderItem={renderFeedItem}
            ListHeaderComponent={<MyDayTray />}
            contentContainerStyle={[styles.listContent, { paddingBottom: tabBarSpace }]}
            {...hideOnScroll}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={feedRefreshing}
                onRefresh={() => void refreshFeed()}
                tintColor={theme.colors.brand}
              />
            }
            ListEmptyComponent={
              <EmptyState
                icon="people-outline"
                title={t("community.feed.empty.title")}
                message={t("community.feed.empty.message")}
                actionLabel={t("community.share")}
                actionIcon="cloud-upload-outline"
                onAction={() => setShareOpen(true)}
              />
            }
          />
        )
      ) : conversations === null && !chatsError ? (
        <FlyingPreloader size={88} style={styles.centered} />
      ) : chatsError ? (
        <ErrorState message={chatsError} onRetry={() => void loadChats()} />
      ) : (
        <FlatList
          data={chatRows}
          keyExtractor={(c) => c.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: tabBarSpace }]}
            {...hideOnScroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={chatsRefreshing}
              onRefresh={() => void refreshChats()}
              tintColor={theme.colors.brand}
            />
          }
          ListHeaderComponent={
            <View style={styles.chatSections}>
              {/* The shared everyone-room is pinned at the top of the list. */}
              <Pressable
                accessibilityRole="button"
                onPress={() => void openCommunityRoom()}
                disabled={openingRoom}
                style={({ pressed }) => [styles.roomRow, pressed && { opacity: 0.85 }]}
              >
                <RoomIcon
                  title={roomMeta?.title || t("community.chat.title.community_chat")}
                  iconUrl={roomMeta?.iconUrl}
                  iconPreset={roomMeta?.iconPreset}
                />
                <View style={styles.roomBody}>
                  <Text style={styles.roomTitle}>{roomMeta?.title || t("community.chat.open_community")}</Text>
                  <Text style={styles.roomHint}>{t("community.chat.open_community.hint")}</Text>
                </View>
                {openingRoom ? (
                  <ActivityIndicator size="small" color={theme.colors.brand} />
                ) : (
                  <Text style={styles.roomOpen}>{t("community.chat.open")}</Text>
                )}
              </Pressable>

              {/* ------------------------------------------- Communities */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{t("community.chat.communities")}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("community.chat.create_a11y")}
                    hitSlop={8}
                    onPress={() => setCreateOpen(true)}
                    style={({ pressed }) => [styles.createBtn, pressed && { opacity: 0.85 }]}
                  >
                    <Ionicons name="add" size={16} color={theme.colors.onBrand} />
                    <Text style={styles.createBtnText}>{t("community.chat.create")}</Text>
                  </Pressable>
                </View>

                {/* Rows are their own group so the section heading hugs them. */}
                <View style={styles.rowGroup}>
                  {rooms === null ? (
                    <FlyingPreloader size={88} style={styles.roomsLoading} />
                  ) : rooms.length === 0 ? (
                    <Text style={styles.roomsEmpty}>
                      {t("community.chat.empty_communities")}
                    </Text>
                  ) : (
                    rooms.map((room) => {
                      const busy = joiningId === room.id;
                      return (
                        <Pressable
                          key={room.id}
                          accessibilityRole="button"
                          accessibilityLabel={`${room.title}, ${room.category}, ${room.memberCount} members`}
                          onPress={() => void openRoom(room)}
                          disabled={busy}
                          style={({ pressed }) => [styles.chatRow, pressed && { opacity: 0.85 }]}
                        >
                          <RoomIcon
                            title={room.title}
                            iconUrl={room.iconUrl}
                            iconPreset={room.iconPreset}
                          />
                          <View style={styles.chatBody}>
                            <Text style={styles.chatName} numberOfLines={1}>
                              {room.title}
                            </Text>
                            <Text style={styles.chatPreview} numberOfLines={1}>
                              {room.category} ·{" "}
                              {t("community.chat.members", { count: room.memberCount })}
                            </Text>
                          </View>
                          {busy ? (
                            <ActivityIndicator size="small" color={theme.colors.brand} />
                          ) : (
                            <Text style={styles.roomOpen}>
                              {room.joined ? t("community.chat.open") : t("community.chat.join")}
                            </Text>
                          )}
                        </Pressable>
                      );
                    })
                  )}
                </View>
              </View>

              {chatRows.length ? (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{t("community.chat.dms")}</Text>
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            // Only reachable when there are no DMs. The header already shows the
            // community room and the Communities section, so don't claim "no
            // chats" when communities are right above — just explain what a DM
            // is and how to get one.
            <EmptyState
              icon="chatbubbles-outline"
              title={t("community.chat.no_dms.title")}
              message={t("community.chat.no_dms.message")}
              actionLabel={t("community.chat.no_dms.action")}
              actionIcon="people-outline"
              onAction={() => setTab("friends")}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                item.unread > 0 ? t("community.chat.unread_a11y", { name: item.otherName, count: item.unread }) : undefined
              }
              onPress={() => router.push(`/community/chat/${item.id}`)}
              style={({ pressed }) => [styles.chatRow, pressed && { opacity: 0.85 }]}
            >
              <ProfileAvatar
                size={42}
                initial={(item.otherName[0] ?? "?").toUpperCase()}
                avatarRef={item.otherAvatar}
              />
              {/* Two lines like Messenger: name and time, then the preview with
                  the muted icon and unread count at its end. */}
              <View style={styles.chatBody}>
                <View style={styles.chatLine}>
                  <Text style={[styles.chatName, item.unread > 0 && styles.chatNameUnread]} numberOfLines={1}>
                    {item.otherName}
                  </Text>
                  {item.lastMessageAt ? (
                    <Text style={[styles.chatTime, item.unread > 0 && styles.chatTimeUnread]}>
                      {timeAgo(item.lastMessageAt)}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.chatLine}>
                  <Text
                    style={[
                      styles.chatPreview,
                      item.unread > 0 && styles.chatPreviewUnread,
                      item.lastMessageUnsent && styles.chatPreviewUnsent,
                    ]}
                    numberOfLines={1}
                  >
                    {item.lastMessageUnsent
                      ? t("community.chat.quote.unsent")
                      : item.lastMessage ?? t("community.chat.no_messages")}
                  </Text>
                  {item.muted ? (
                    <Ionicons
                      name="notifications-off-outline"
                      size={14}
                      color={theme.colors.textMuted}
                      accessibilityLabel={t("community.chat.muted_a11y")}
                    />
                  ) : null}
                  {item.unread > 0 ? (
                    <View style={[styles.unreadBadge, item.muted && styles.unreadBadgeMuted]}>
                      <Text style={[styles.unreadText, item.muted && styles.unreadTextMuted]}>
                        {item.unread > 99 ? "99+" : item.unread}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Pressable>
          )}
        />
      )}

      <ShareOutfitModal
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        onShared={() => {
          void loadFeed();
          toast.success(t("community.toast.shared.title"), t("community.toast.shared.message"));
        }}
      />

      <CreateRoomModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleRoomCreated}
      />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  centered: { marginTop: 48 },
  headerWrap: {
    paddingHorizontal: GUTTER,
    paddingTop: theme.spacing.sm,
  },
  segment: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: GUTTER,
    marginTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
  },
  segmentBtnActive: { backgroundColor: theme.colors.primary },
  segmentText: { fontSize: 13, fontWeight: "600", color: theme.colors.textMuted },
  segmentTextActive: { color: theme.colors.onPrimary },
  listContent: { paddingHorizontal: GUTTER, paddingTop: 4, paddingBottom: 32, gap: 14 },
  shareIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },

  roomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  roomIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  roomIconText: { color: theme.colors.onPrimary, fontWeight: "700", fontSize: 14 },
  roomBody: { flex: 1, minWidth: 0 },
  roomTitle: { fontSize: 14.5, fontWeight: "700", color: theme.colors.text },
  roomHint: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2 },
  roomOpen: { fontSize: 13, fontWeight: "700", color: theme.colors.brand },

  chatSections: { gap: theme.spacing.lg },
  section: { gap: theme.spacing.sm },
  rowGroup: { gap: theme.spacing.sm },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: theme.colors.textMuted,
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.brand,
    minHeight: 32,
  },
  createBtnText: { fontSize: 12.5, fontWeight: "700", color: theme.colors.onBrand },
  roomsLoading: { marginVertical: theme.spacing.md },
  roomsEmpty: {
    fontSize: 12.5,
    color: theme.colors.textMuted,
    paddingVertical: theme.spacing.sm,
    lineHeight: 18,
  },

  chatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  chatBody: { flex: 1, minWidth: 0, gap: 3 },
  chatLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  chatName: { flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: "700", color: theme.colors.text },
  chatPreview: { flex: 1, minWidth: 0, fontSize: 13, color: theme.colors.textMuted },
  chatPreviewUnsent: { fontStyle: "italic" },
  chatTime: { fontSize: 11.5, color: theme.colors.textMuted },
  chatNameUnread: { fontWeight: "800" },
  chatPreviewUnread: { color: theme.colors.text, fontWeight: "700" },
  chatTimeUnread: { color: theme.colors.brand, fontWeight: "700" },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: theme.colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadgeMuted: { backgroundColor: theme.colors.surfaceAlt },
  unreadTextMuted: { color: theme.colors.textMuted },
  unreadText: { fontSize: 11, fontWeight: "700", color: theme.colors.onBrand },
}));