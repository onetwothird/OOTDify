// C:\OOTDify\src\app\(tabs)\discover.tsx
// Discover: a lookbook of outfits other people chose to share (the opt-in
// "Share outfit" flow). It is deliberately not the Community feed: only posts
// made from a saved outfit appear (no captions-only or photo posts), there is
// no comment thread, and a look opens as the pieces themselves (LookSheet).
// "Look of the week" is the one large moment; then top creators, a Trending /
// New / Friends sort and a two-column wall. Pieces shows everyone's public
// closet pieces (friends or not) to heart, save, or add their owner; Saved
// collects what you saved. Ranking rules live in features/discover.
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { communityErrorMessage, fetchFeed } from "../../features/community/service";
import type { FeedPost } from "../../features/community/types";
import { LookSheet } from "../../features/discover/LookSheet";
import { PieceCard, PieceSheet } from "../../features/discover/PieceViews";
import { friendState, type FriendIds, type FriendState } from "../../features/discover/pieces";
import {
  fetchFriendIds,
  fetchPublicPieces,
  fetchSavedLookIds,
  fetchSavedPieces,
  type DiscoverPiece,
} from "../../features/discover/service";
import { CreatorsRow, LookCard, Spotlight } from "../../features/discover/LookViews";
import { likedCreators, lookOfTheWeek, outfitLooks, sortLooks, splitColumns, topCreators, type LookSort } from "../../features/discover/rank";
import { Chip } from "../../shared/components/Chip";
import { SkeletonGrid } from "../../shared/components/LoadingState";
import { ScreenHeader } from "../../shared/components/ScreenHeader";
import { EmptyState, ErrorState } from "../../shared/components/StateViews";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";
import { useHideOnScroll, useTabBarSpace } from "../../shared/navigation/useTabChrome";
import { makeStyles } from "../../shared/theme/makeStyles";

const GUTTER = 20;
const COLUMN_GAP = 12;
const FEED_LIMIT = 100;
const CREATORS = 8;

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready" };
type View_ = "looks" | "pieces" | "saved";
type PieceLoad = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; pieces: DiscoverPiece[] };

/** Two columns, alternating, for same-shaped piece cards. */
function twoColumns<T>(items: T[]): [T[], T[]] {
  return [items.filter((_, i) => i % 2 === 0), items.filter((_, i) => i % 2 === 1)];
}

export default function DiscoverScreen() {
  const styles = useStyles();
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tabBarSpace = useTabBarSpace();
  const hideOnScroll = useHideOnScroll();

  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [friendIds, setFriendIds] = useState<ReadonlySet<string>>(new Set());
  const [me, setMe] = useState<string | null>(null);
  const [sort, setSort] = useState<LookSort>("for_you");
  // Creators whose posts I liked, fixed per load so "For you" doesn't reshuffle on every like.
  const [likedCreatorIds, setLikedCreatorIds] = useState<ReadonlySet<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setView] = useState<View_>("looks");
  const [pieces, setPieces] = useState<PieceLoad>({ status: "loading" });
  const [savedPieces, setSavedPieces] = useState<PieceLoad>({ status: "loading" });
  // Post id to my saved copy of that look.
  const [savedLooks, setSavedLooks] = useState<Map<string, string>>(new Map());
  const [friendOverview, setFriendOverview] = useState<FriendIds | null>(null);
  const [openPieceId, setOpenPieceId] = useState<string | null>(null);
  // Fixed once per load, so rankings don't shift while the user scrolls.
  const [now, setNow] = useState(() => Date.now());

  const loadPieces = useCallback(async () => {
    try {
      setPieces({ status: "ready", pieces: await fetchPublicPieces() });
    } catch (e) {
      setPieces({ status: "error", message: communityErrorMessage(e) });
    }
  }, []);

  const loadSaved = useCallback(async () => {
    try {
      const [items, looks] = await Promise.all([fetchSavedPieces(), fetchSavedLookIds()]);
      setSavedPieces({ status: "ready", pieces: items });
      setSavedLooks(looks);
    } catch (e) {
      setSavedPieces({ status: "error", message: communityErrorMessage(e) });
    }
  }, []);

  const reload = useCallback(async () => {
    void loadPieces();
    void loadSaved();
    try {
      const [feed, friends] = await Promise.all([
        fetchFeed(FEED_LIMIT),
        // Friends power the Friends sort and the add-friend buttons; Discover still works without them.
        fetchFriendIds().catch(() => null),
      ]);
      setPosts(outfitLooks(feed));
      setFriendOverview(friends);
      setFriendIds(new Set(friends?.friends ?? []));
      setMe(friends?.me ?? null);
      setLikedCreatorIds(likedCreators(feed, friends?.me ?? null));
      setNow(Date.now());
      setLoad({ status: "ready" });
    } catch (e) {
      setLoad({ status: "error", message: communityErrorMessage(e) });
    }
  }, [loadPieces, loadSaved]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  const spotlight = useMemo(() => lookOfTheWeek(posts, now), [posts, now]);
  const creators = useMemo(() => topCreators(posts, now, CREATORS), [posts, now]);
  // The spotlight look isn't repeated on the wall.
  const wall = useMemo(
    () =>
      sortLooks(posts, sort, now, friendIds, { friendIds, likedCreatorIds, me }).filter(
        (p) => (sort !== "trending" && sort !== "for_you") || p.id !== spotlight?.id,
      ),
    [posts, sort, now, friendIds, likedCreatorIds, me, spotlight],
  );
  const [left, right] = useMemo(() => splitColumns(wall), [wall]);
  const columnW = (width - GUTTER * 2 - COLUMN_GAP) / 2;
  const open = posts.find((p) => p.id === openId) ?? null;
  const shownPieces = pieces.status === "ready" ? pieces.pieces : [];
  const openPiece =
    shownPieces.find((p) => p.id === openPieceId) ??
    (savedPieces.status === "ready" ? savedPieces.pieces.find((p) => p.id === openPieceId) : undefined) ??
    null;
  const savedLookPosts = posts.filter((p) => savedLooks.has(p.id));
  const tileW = (width - GUTTER * 2 - COLUMN_GAP) / 2;

  // A heart or save on a piece updates it wherever it is shown.
  const onPieceChanged = (next: DiscoverPiece) => {
    const swap = (load: PieceLoad): PieceLoad =>
      load.status === "ready" ? { ...load, pieces: load.pieces.map((p) => (p.id === next.id ? next : p)) } : load;
    setPieces(swap);
    setSavedPieces((prev) => {
      if (prev.status !== "ready") return prev;
      const has = prev.pieces.some((p) => p.id === next.id);
      if (next.savedByMe && !has) return { ...prev, pieces: [next, ...prev.pieces] };
      return swap(prev);
    });
  };
  const onFriendChanged = (userId: string, next: FriendState) =>
    setFriendOverview((o) => {
      if (!o) return o;
      const drop = (ids: string[]) => ids.filter((id) => id !== userId);
      return {
        ...o,
        friends: next === "friend" ? [...drop(o.friends), userId] : drop(o.friends),
        incoming: drop(o.incoming),
        outgoing: next === "outgoing" ? [...drop(o.outgoing), userId] : drop(o.outgoing),
      };
    });
  const onSavedChanged = (postId: string, outfitId: string | null) =>
    setSavedLooks((prev) => {
      const next = new Map(prev);
      if (outfitId) next.set(postId, outfitId);
      else next.delete(postId);
      return next;
    });
  const views: [View_, string][] = [
    ["looks", t("explore.view.looks")],
    ["pieces", t("explore.view.pieces")],
    ["saved", t("explore.view.saved")],
  ];
  const pieceWall = (list: DiscoverPiece[]) => (
    <View style={styles.wall}>
      {twoColumns(list).map((column, i) => (
        <View key={i} style={{ width: tileW }}>
          {column.map((piece) => (
            <PieceCard
              key={piece.id}
              piece={piece}
              width={tileW}
              onPress={() => setOpenPieceId(piece.id)}
              onChanged={onPieceChanged}
            />
          ))}
        </View>
      ))}
    </View>
  );

  const onLikeChanged = (postId: string, likedByMe: boolean, likeCount: number) =>
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, likedByMe, like_count: likeCount } : p)));
  const onRemoved = (postId: string) => setPosts((prev) => prev.filter((p) => p.id !== postId));
  const openCreator = (userId: string) =>
    router.push({ pathname: "/community/profile/[userId]", params: { userId } });
  const shareFirst = () => router.push({ pathname: "/(tabs)/wardrobe", params: { section: "outfits" } });

  const sorts: [LookSort, string][] = [
    ["for_you", t("explore.sort.for_you")],
    ["trending", t("explore.sort.trending")],
    ["new", t("explore.sort.new")],
    ["friends", t("explore.sort.friends")],
  ];

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabBarSpace }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
        {...hideOnScroll}
      >
        <ScreenHeader variant="tab" icon="compass" title={t("explore.title")} subtitle={t("explore.subtitle")} />

        <View style={styles.views} accessibilityRole="tablist">
          {views.map(([key, label]) => (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: view === key }}
              onPress={() => setView(key)}
              style={[styles.viewTab, view === key && styles.viewTabOn]}
            >
              <Text style={[styles.viewText, view === key && styles.viewTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {view === "pieces" ? (
          pieces.status === "loading" ? (
            <SkeletonGrid />
          ) : pieces.status === "error" ? (
            <ErrorState message={pieces.message} onRetry={() => void loadPieces()} />
          ) : pieces.pieces.length === 0 ? (
            <EmptyState
              icon="shirt-outline"
              title={t("explore.pieces_empty.title")}
              message={t("explore.pieces_empty.message")}
            />
          ) : (
            <>
              <Text style={styles.viewIntro}>{t("explore.pieces_intro")}</Text>
              {pieceWall(pieces.pieces)}
            </>
          )
        ) : view === "saved" ? (
          savedPieces.status === "loading" ? (
            <SkeletonGrid />
          ) : savedPieces.status === "error" ? (
            <ErrorState message={savedPieces.message} onRetry={() => void loadSaved()} />
          ) : savedPieces.pieces.length === 0 && savedLookPosts.length === 0 ? (
            <EmptyState
              icon="bookmark-outline"
              title={t("explore.saved_empty.title")}
              message={t("explore.saved_empty.message")}
            />
          ) : (
            <>
              {savedLookPosts.length > 0 ? (
                <>
                  <Text style={styles.savedHead}>{t("explore.saved.looks")}</Text>
                  <View style={styles.wall}>
                    {twoColumns(savedLookPosts).map((column, i) => (
                      <View key={i} style={{ width: tileW }}>
                        {column.map((look) => (
                          <LookCard key={look.id} look={look} width={tileW} onPress={() => setOpenId(look.id)} />
                        ))}
                      </View>
                    ))}
                  </View>
                </>
              ) : null}
              {savedPieces.pieces.length > 0 ? (
                <>
                  <Text style={styles.savedHead}>{t("explore.saved.pieces")}</Text>
                  {pieceWall(savedPieces.pieces)}
                </>
              ) : null}
            </>
          )
        ) : load.status === "loading" ? (
          <SkeletonGrid />
        ) : load.status === "error" ? (
          <ErrorState message={load.message} onRetry={() => void reload()} />
        ) : posts.length === 0 ? (
          <EmptyState
            icon="compass-outline"
            title={t("explore.empty.title")}
            message={t("explore.empty.message")}
            actionLabel={t("explore.empty.action")}
            onAction={shareFirst}
          />
        ) : (
          <>
            {spotlight ? (
              <View style={styles.block}>
                <Spotlight look={spotlight} width={width - GUTTER * 2} onPress={() => setOpenId(spotlight.id)} />
              </View>
            ) : null}
            <CreatorsRow
              creators={creators}
              posts={posts}
              onOpen={openCreator}
              style={styles.block}
            />
            <View style={[styles.block, styles.sorts]}>
              {sorts.map(([key, label]) => (
                <Chip key={key} label={label} active={sort === key} onPress={() => setSort(key)} />
              ))}
            </View>
            {wall.length === 0 ? (
              <EmptyState
                compact
                icon={sort === "friends" ? "people-outline" : "compass-outline"}
                title={sort === "friends" ? t("explore.friends_empty.title") : t("explore.empty.title")}
                message={sort === "friends" ? t("explore.friends_empty.message") : t("explore.empty.message")}
              />
            ) : (
              <View style={styles.wall}>
                {[left, right].map((column, i) => (
                  <View key={i} style={{ width: columnW }}>
                    {column.map((look) => (
                      <LookCard key={look.id} look={look} width={columnW} onPress={() => setOpenId(look.id)} />
                    ))}
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <LookSheet
        look={open}
        isOwn={open?.user_id === me}
        onClose={() => setOpenId(null)}
        onLikeChanged={onLikeChanged}
        onRemoved={onRemoved}
        onOpenCreator={openCreator}
        savedOutfitId={open ? savedLooks.get(open.id) : undefined}
        onSavedChanged={onSavedChanged}
        friend={open ? friendState(open.user_id, friendOverview) : "unknown"}
        onFriendChanged={onFriendChanged}
      />
      <PieceSheet
        piece={openPiece}
        friend={openPiece ? friendState(openPiece.user_id, friendOverview) : "unknown"}
        onClose={() => setOpenPieceId(null)}
        onChanged={onPieceChanged}
        onFriendChanged={onFriendChanged}
        onOpenOwner={openCreator}
      />
    </View>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingHorizontal: GUTTER },
  block: { marginTop: theme.spacing.lg },
  views: {
    flexDirection: "row",
    gap: 22,
    marginTop: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  viewTab: { paddingVertical: 10, borderBottomWidth: 3, borderBottomColor: "transparent", marginBottom: -1 },
  viewTabOn: { borderBottomColor: theme.colors.brand },
  viewText: { fontSize: 15.5, fontWeight: "600", color: theme.colors.textMuted },
  viewTextOn: { color: theme.colors.text },
  viewIntro: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 18, marginTop: theme.spacing.md },
  savedHead: { fontSize: 17, fontWeight: "700", color: theme.colors.text, marginTop: theme.spacing.lg },
  sorts: { flexDirection: "row", gap: 8 },
  wall: { flexDirection: "row", gap: COLUMN_GAP, marginTop: theme.spacing.md, alignItems: "flex-start" },
}));
