// C:\OOTDify\src\app\(tabs)\discover.tsx
// Discover: a lookbook of outfits other people chose to share (the opt-in
// "Share outfit" flow). It is deliberately not the Community feed: only posts
// made from a saved outfit appear (no captions-only or photo posts), there is
// no comment thread, and a look opens as the pieces themselves (LookSheet).
// "Look of the week" is the one large moment; then top creators, a Trending /
// New / Friends sort and a two-column wall. Ranking rules live in
// features/discover.
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { communityErrorMessage, fetchFeed } from "../../features/community/service";
import { fetchFriends } from "../../features/community/socialService";
import type { FeedPost } from "../../features/community/types";
import { LookSheet } from "../../features/discover/LookSheet";
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
  // Fixed once per load, so rankings don't shift while the user scrolls.
  const [now, setNow] = useState(() => Date.now());

  const reload = useCallback(async () => {
    try {
      const [feed, friends] = await Promise.all([
        fetchFeed(FEED_LIMIT),
        // Friends only power the Friends sort; Discover still works without them.
        fetchFriends().catch(() => null),
      ]);
      setPosts(outfitLooks(feed));
      setFriendIds(new Set(friends?.friends.map((f) => f.user_id) ?? []));
      setMe(friends?.me ?? null);
      setLikedCreatorIds(likedCreators(feed, friends?.me ?? null));
      setNow(Date.now());
      setLoad({ status: "ready" });
    } catch (e) {
      setLoad({ status: "error", message: communityErrorMessage(e) });
    }
  }, []);

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

        {load.status === "loading" ? (
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
      />
    </View>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingHorizontal: GUTTER },
  block: { marginTop: theme.spacing.lg },
  sorts: { flexDirection: "row", gap: 8 },
  wall: { flexDirection: "row", gap: COLUMN_GAP, marginTop: theme.spacing.md, alignItems: "flex-start" },
}));
