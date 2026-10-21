// C:\OOTDify\src\app\(tabs)\community.tsx
// Community — the social half of OOTDify:
//   Feed  · other users' shared outfits, likes, comments, DM shortcut
//   Chats · the shared Community Chat room + your 1:1 conversations
//
// Real data only: everything comes from the community tables in
// supabase/schema.sql through the community service. Until that schema is
// applied the screen says so plainly instead of inventing content.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
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
import {
  communityErrorMessage,
  deletePost,
  ensureCommunityRoom,
  fetchConversations,
  fetchFeed,
  fetchPublicRooms,
  joinRoom,
  startDirectConversation,
  subscribeToFeed,
} from "../../features/community/service";
import type { CommunityRoom, ConversationListEntry, FeedPost } from "../../features/community/types";
import { ProfileAvatar } from "../../features/profile/ProfileAvatar";
import { AppButton } from "../../shared/components/AppButton";
import { ScreenHeader } from "../../shared/components/ScreenHeader";
import { EmptyState, ErrorState } from "../../shared/components/StateViews";
import { theme } from "../../shared/config/theme";
import { supabase } from "../../shared/lib/supabase";
import { timeAgo } from "../../features/community/format";
import { toast } from "../../shared/lib/toast";

type Tab = "feed" | "chats";

/**
 * Single horizontal gutter shared by the header, the segmented switcher and
 * both lists, so everything on this screen lines up on one vertical rail.
 */
const GUTTER = 20;

export default function CommunityScreen() {
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
  postsRef.current = posts;

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
    setFeedError(null);
    try {
      setPosts(await fetchFeed());
    } catch (e) {
      setFeedError(communityErrorMessage(e));
    }
  }, []);

  const loadChats = useCallback(async () => {
    setChatsError(null);
    try {
      setConversations(await fetchConversations());
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
    void loadFeed();
    void loadChats();
    void loadRooms();
  }, [loadFeed, loadChats, loadRooms]);

  useEffect(() => {
    if (tab === "chats") {
      void loadChats();
      void loadRooms();
    }
  }, [tab, loadChats, loadRooms]);

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

  const handleMessage = useCallback(
    (authorId: string) => {
      if (!meId) return;
      if (authorId === meId) {
        toast.info("That's you", "You can't start a chat with your own post.");
        return;
      }
      void (async () => {
        try {
          const conversationId = await startDirectConversation(authorId);
          router.push(`/community/chat/${conversationId}`);
        } catch (e) {
          toast.error("Could not start chat", communityErrorMessage(e));
        }
      })();
    },
    [meId, router],
  );

  const handleDelete = useCallback(async (post: FeedPost) => {
    try {
      await deletePost(post);
      setPosts((prev) => prev?.filter((p) => p.id !== post.id) ?? prev);
      toast.success("Post deleted");
    } catch (e) {
      toast.error("Could not delete post", communityErrorMessage(e));
    }
  }, []);

  // ---- Chats actions -------------------------------------------------------
  const openCommunityRoom = useCallback(async () => {
    setOpeningRoom(true);
    try {
      const roomId = await ensureCommunityRoom();
      router.push(`/community/chat/${roomId}`);
    } catch (e) {
      toast.error("Could not open community chat", communityErrorMessage(e));
    } finally {
      setOpeningRoom(false);
    }
  }, [router]);

  /** Join a public room (if needed) and open it. */
  const openRoom = useCallback(
    async (room: CommunityRoom) => {
      setJoiningId(room.id);
      try {
        if (!room.joined) await joinRoom(room.id);
        router.push(`/community/chat/${room.id}`);
      } catch (e) {
        toast.error("Could not join community", communityErrorMessage(e));
      } finally {
        setJoiningId(null);
      }
    },
    [router],
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
        meId={meId}
        onLikeChanged={handleLikeChanged}
        onMessage={handleMessage}
        onDelete={(p) => void handleDelete(p)}
      />
    ),
    [meId, handleLikeChanged, handleMessage, handleDelete],
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
          title="Community"
          subtitle="See what others are wearing"
          right={
            condensed ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Share a look"
                hitSlop={8}
                onPress={() => setShareOpen(true)}
                style={({ pressed }) => [styles.shareIconBtn, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="cloud-upload-outline" size={20} color={theme.colors.onPrimary} />
              </Pressable>
            ) : (
              <AppButton
                label="Share a look"
                icon="cloud-upload-outline"
                size="md"
                onPress={() => setShareOpen(true)}
              />
            )
          }
        />
      </View>

      {/* ------------------------------------------------ Segmented switcher */}
      <View style={styles.segment}>
        {(["feed", "chats"] as Tab[]).map((key) => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
            onPress={() => setTab(key)}
            style={[styles.segmentBtn, tab === key && styles.segmentBtnActive]}
          >
            <Text style={[styles.segmentText, tab === key && styles.segmentTextActive]}>
              {key === "feed" ? "Feed" : "Chats"}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === "feed" ? (
        posts === null && !feedError ? (
          <ActivityIndicator color={theme.colors.primary} style={styles.centered} />
        ) : feedError ? (
          <ErrorState message={feedError} onRetry={() => void loadFeed()} />
        ) : (
          <FlatList
            data={posts ?? []}
            keyExtractor={(p) => p.id}
            renderItem={renderFeedItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={feedRefreshing}
                onRefresh={() => void refreshFeed()}
                tintColor={theme.colors.primary}
              />
            }
            ListEmptyComponent={
              <EmptyState
                icon="people-outline"
                title="Nothing shared yet"
                message="Be the first — tap “Share a look” up top to post a saved outfit."
              />
            }
          />
        )
      ) : conversations === null && !chatsError ? (
        <ActivityIndicator color={theme.colors.primary} style={styles.centered} />
      ) : chatsError ? (
        <ErrorState message={chatsError} onRetry={() => void loadChats()} />
      ) : (
        <FlatList
          data={chatRows}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={chatsRefreshing}
              onRefresh={() => void refreshChats()}
              tintColor={theme.colors.primary}
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
                <View style={styles.roomIcon}>
                  <Text style={styles.roomIconText}>OC</Text>
                </View>
                <View style={styles.roomBody}>
                  <Text style={styles.roomTitle}>Open Community Chat</Text>
                  <Text style={styles.roomHint}>Talk with everyone on OOTDify</Text>
                </View>
                {openingRoom ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <Text style={styles.roomOpen}>Open</Text>
                )}
              </Pressable>

              {/* ------------------------------------------- Communities */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>COMMUNITIES</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Create a community"
                    hitSlop={8}
                    onPress={() => setCreateOpen(true)}
                    style={({ pressed }) => [styles.createBtn, pressed && { opacity: 0.85 }]}
                  >
                    <Ionicons name="add" size={16} color={theme.colors.onPrimary} />
                    <Text style={styles.createBtnText}>Create</Text>
                  </Pressable>
                </View>

                {/* Rows are their own group so the section heading hugs them. */}
                <View style={styles.rowGroup}>
                  {rooms === null ? (
                    <ActivityIndicator color={theme.colors.primary} style={styles.roomsLoading} />
                  ) : rooms.length === 0 ? (
                    <Text style={styles.roomsEmpty}>
                      No communities yet. Create one to get started.
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
                          <View style={styles.roomIcon}>
                            <Text style={styles.roomIconText}>
                              {room.title.slice(0, 2).toUpperCase()}
                            </Text>
                          </View>
                          <View style={styles.chatBody}>
                            <Text style={styles.chatName} numberOfLines={1}>
                              {room.title}
                            </Text>
                            <Text style={styles.chatPreview} numberOfLines={1}>
                              {room.category} ·{" "}
                              {room.memberCount === 1
                                ? "1 member"
                                : `${room.memberCount} members`}
                            </Text>
                          </View>
                          {busy ? (
                            <ActivityIndicator size="small" color={theme.colors.primary} />
                          ) : (
                            <Text style={styles.roomOpen}>{room.joined ? "Open" : "Join"}</Text>
                          )}
                        </Pressable>
                      );
                    })
                  )}
                </View>
              </View>

              {chatRows.length ? (
                <Text style={styles.sectionTitle}>DIRECT MESSAGES</Text>
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
              title="No direct messages"
              message="Message someone from the feed to start a private chat."
            />
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/community/chat/${item.id}`)}
              style={({ pressed }) => [styles.chatRow, pressed && { opacity: 0.85 }]}
            >
              <ProfileAvatar
                size={42}
                initial={(item.otherName[0] ?? "?").toUpperCase()}
                avatarRef={item.otherAvatar}
              />
              <View style={styles.chatBody}>
                <Text style={styles.chatName} numberOfLines={1}>
                  {item.otherName}
                </Text>
                <Text style={styles.chatPreview} numberOfLines={1}>
                  {item.lastMessage ?? "No messages yet"}
                </Text>
              </View>
              <View style={styles.chatMeta}>
                {item.lastMessageAt ? (
                  <Text style={styles.chatTime}>{timeAgo(item.lastMessageAt)}</Text>
                ) : null}
                {item.unread > 0 ? (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{item.unread > 99 ? "99+" : item.unread}</Text>
                  </View>
                ) : null}
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
          toast.success("Look shared", "Your outfit is now on the community feed.");
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  centered: { marginTop: 48 },
  // One horizontal inset for every stacked block on this screen (header,
  // segments, list content) so their left edges line up on a single rail.
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
  segmentText: { fontSize: 13, fontWeight: "700", color: theme.colors.textMuted },
  segmentTextActive: { color: theme.colors.onPrimary },
  listContent: { paddingHorizontal: GUTTER, paddingTop: 4, paddingBottom: 32, gap: 14 },
  shareIconBtn: {
    width: 44,
    height: 44,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  // Community chat room row
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
  roomIconText: { color: theme.colors.onPrimary, fontWeight: "800", fontSize: 14 },
  roomBody: { flex: 1, minWidth: 0 },
  roomTitle: { fontSize: 14.5, fontWeight: "800", color: theme.colors.text },
  roomHint: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2 },
  roomOpen: { fontSize: 13, fontWeight: "800", color: theme.colors.primary },

  // Communities section (public group rooms)
  // The Chats list header stacks several blocks; the outer list applies one
  // `gap` between them, so each section owns its internal rhythm here.
  chatSections: { gap: theme.spacing.lg },
  section: { gap: theme.spacing.sm },
  // Room rows sit tight to each other so they read as one list, not as loose
  // cards interleaved with the section headings.
  rowGroup: { gap: theme.spacing.sm },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
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
    backgroundColor: theme.colors.primary,
    minHeight: 32,
  },
  createBtnText: { fontSize: 12.5, fontWeight: "800", color: theme.colors.onPrimary },
  roomsLoading: { marginVertical: theme.spacing.md },
  roomsEmpty: {
    fontSize: 12.5,
    color: theme.colors.textMuted,
    paddingVertical: theme.spacing.sm,
    lineHeight: 18,
  },

  // 1:1 chat rows
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
  chatBody: { flex: 1, minWidth: 0 },
  chatName: { fontSize: 14.5, fontWeight: "800", color: theme.colors.text },
  chatPreview: { fontSize: 12.5, color: theme.colors.textMuted, marginTop: 2 },
  chatMeta: { alignItems: "flex-end", gap: 4 },
  chatTime: { fontSize: 11, color: theme.colors.textMuted },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadText: { fontSize: 11, fontWeight: "800", color: theme.colors.onPrimary },
});
