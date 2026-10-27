// C:\OOTDify\src\app\community\myday\[userId].tsx
// Watch one person's My Day. Each post plays for POST_MS (hold to pause), a
// tap on the left or right goes back or forward, and it closes after the last
// one. A friend's post is marked as seen when it shows. On your own, "Seen by"
// lists who has watched it, and you can delete it.
//
// The photo fills the screen, so the chrome on top of it is fixed white on a
// black backdrop, the same as camera chrome, to stay readable on any photo.
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { communityErrorMessage } from "../../../features/community/service";
import { timeAgo } from "../../../features/community/format";
import { firstUnseenIndex, type MyDayPostRow } from "../../../features/community/social";
import {
  deleteMyDay,
  displayName,
  fetchMyDay,
  fetchMyDayViewers,
  markMyDayViewed,
  type MyDayViewer,
} from "../../../features/community/socialService";
import type { DirectoryProfile } from "../../../features/community/types";
import { ProfileAvatar } from "../../../features/profile/ProfileAvatar";
import { Sheet } from "../../../shared/components/Sheet";
import { SmartImage } from "../../../shared/components/SmartImage";
import { useReduceMotion } from "../../../shared/hooks/useReduceMotion";
import { useT } from "../../../shared/i18n/useT";
import { toast } from "../../../shared/lib/toast";
import { makeStyles } from "../../../shared/theme/makeStyles";
import { useAppTheme } from "../../../shared/theme/ThemeProvider";

const POST_MS = 5000;

export default function MyDayViewerScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { t } = useT();
  const reduceMotion = useReduceMotion();

  const [posts, setPosts] = useState<MyDayPostRow[] | null>(null);
  const [profile, setProfile] = useState<DirectoryProfile | null>(null);
  const [isMine, setIsMine] = useState(false);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewers, setViewers] = useState<MyDayViewer[] | null>(null);
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let alive = true;
    void fetchMyDay()
      .then((feed) => {
        if (!alive) return;
        const list = feed.posts.filter((p) => p.user_id === userId);
        if (!list.length) {
          router.back();
          return;
        }
        setPosts(list);
        setProfile(feed.profiles.get(userId) ?? null);
        setIsMine(userId === feed.me);
        setIndex(userId === feed.me ? 0 : firstUnseenIndex(list, feed.viewed));
      })
      .catch((e) => {
        if (!alive) return;
        toast.error(t("myday.toast.load_error"), communityErrorMessage(e));
        router.back();
      });
    return () => {
      alive = false;
    };
  }, [userId, router, t]);

  const post = posts?.[index] ?? null;

  const next = useCallback(() => {
    if (!posts) return;
    if (index < posts.length - 1) setIndex(index + 1);
    else router.back();
  }, [posts, index, router]);

  const prev = useCallback(() => {
    if (index > 0) setIndex(index - 1);
    else progress.setValue(0);
  }, [index, progress]);

  // A friend's post counts as seen as soon as it shows.
  useEffect(() => {
    if (!post || isMine) return;
    void markMyDayViewed(post.id).catch(() => {});
  }, [post, isMine]);

  // Each post starts with an empty bar.
  useEffect(() => {
    progress.setValue(0);
  }, [post, progress]);

  // The bar fills over POST_MS, then moves on. Paused while held or while the
  // viewers sheet is open, and resumes where it stopped; reduce motion still
  // advances, just without the fill.
  useEffect(() => {
    if (!post || paused || viewersOpen) return;
    let anim: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    progress.stopAnimation((value) => {
      if (cancelled) return;
      anim = Animated.timing(progress, {
        toValue: 1,
        duration: Math.max(0, POST_MS * (1 - value)),
        easing: Easing.linear,
        useNativeDriver: false,
      });
      anim.start(({ finished }) => {
        if (finished) next();
      });
    });
    return () => {
      cancelled = true;
      anim?.stop();
    };
  }, [post, paused, viewersOpen, progress, next]);

  const openViewers = async () => {
    if (!post) return;
    setViewersOpen(true);
    setViewers(null);
    try {
      setViewers(await fetchMyDayViewers(post.id));
    } catch (e) {
      setViewers([]);
      toast.error(t("myday.toast.load_error"), communityErrorMessage(e));
    }
  };

  const remove = () => {
    if (!post || !posts) return;
    setPaused(true);
    Alert.alert(t("myday.delete.title"), t("myday.delete.message"), [
      { text: t("common.cancel"), style: "cancel", onPress: () => setPaused(false) },
      {
        text: t("myday.delete.confirm"),
        style: "destructive",
        onPress: () => {
          void deleteMyDay(post)
            .then(() => {
              const rest = posts.filter((p) => p.id !== post.id);
              if (!rest.length) {
                router.back();
                return;
              }
              setPosts(rest);
              setIndex(Math.min(index, rest.length - 1));
              setPaused(false);
            })
            .catch((e) => {
              setPaused(false);
              toast.error(t("myday.toast.delete_error"), communityErrorMessage(e));
            });
        },
      },
    ]);
  };

  if (!posts || !post) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  const name = isMine ? t("myday.yours") : displayName(profile);

  return (
    <View style={styles.screen}>
      <SmartImage source={post.image_ref} style={StyleSheet.absoluteFill} contentFit="contain" />

      {/* Tap left for back, right for next; hold anywhere to pause. */}
      <View style={styles.tapZones}>
        <Pressable
          style={styles.flex}
          accessibilityRole="button"
          accessibilityLabel={t("myday.prev_a11y")}
          onPress={prev}
          onLongPress={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
        />
        <Pressable
          style={styles.flex}
          accessibilityRole="button"
          accessibilityLabel={t("myday.next_a11y")}
          onPress={next}
          onLongPress={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
        />
      </View>

      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.bars}>
          {posts.map((p, i) => (
            <View key={p.id} style={styles.bar}>
              {i < index ? (
                <View style={[styles.barFill, styles.full]} />
              ) : i === index && !reduceMotion ? (
                <Animated.View
                  style={[
                    styles.barFill,
                    { width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) },
                  ]}
                />
              ) : null}
            </View>
          ))}
        </View>
        <View style={styles.header}>
          <ProfileAvatar
            size={36}
            initial={(name[0] ?? "?").toUpperCase()}
            avatarRef={profile?.avatar_url ?? null}
          />
          <View style={styles.headerText}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.time}>{timeAgo(post.created_at)}</Text>
          </View>
          {isMine ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t("myday.delete.title")} hitSlop={8} onPress={remove} style={styles.iconBtn}>
              <Ionicons name="trash-outline" size={21} color="#FFFFFF" />
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} hitSlop={8} onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]} pointerEvents="box-none">
        {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}
        {isMine ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void openViewers()}
            style={({ pressed }) => [styles.seenBtn, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="eye-outline" size={17} color="#FFFFFF" />
            <Text style={styles.seenText}>{t("myday.seen_by")}</Text>
            <Ionicons name="chevron-up" size={16} color="#FFFFFF" />
          </Pressable>
        ) : null}
      </View>

      <ViewersSheet visible={viewersOpen} viewers={viewers} onClose={() => setViewersOpen(false)} />
    </View>
  );
}

function ViewersSheet({
  visible,
  viewers,
  onClose,
}: {
  visible: boolean;
  viewers: MyDayViewer[] | null;
  onClose: () => void;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      icon="eye-outline"
      title={t("myday.viewers.title")}
      subtitle={viewers ? t("myday.viewers.count", { count: viewers.length }) : undefined}
      scroll={false}
    >
      {viewers === null ? (
        <ActivityIndicator color={theme.colors.brand} style={styles.sheetLoading} />
      ) : viewers.length === 0 ? (
        <Text style={styles.noViewers}>{t("myday.viewers.empty")}</Text>
      ) : (
        <ScrollView style={styles.viewerList}>
          {viewers.map((v) => {
            const name = displayName(v.profile);
            return (
              <View key={v.viewerId} style={styles.viewerRow}>
                <ProfileAvatar size={40} initial={(name[0] ?? "?").toUpperCase()} avatarRef={v.profile?.avatar_url ?? null} />
                <Text style={styles.viewerName} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={styles.viewerTime}>{timeAgo(v.viewedAt)}</Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </Sheet>
  );
}

const useStyles = makeStyles((theme) => ({
  screen: { flex: 1, backgroundColor: "#000000" },
  center: { alignItems: "center", justifyContent: "center" },
  flex: { flex: 1 },
  tapZones: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, flexDirection: "row" },
  top: { position: "absolute", left: 0, right: 0, top: 0, paddingHorizontal: 12 },
  bars: { flexDirection: "row", gap: 4 },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.35)", overflow: "hidden" },
  barFill: { height: 3, backgroundColor: "#FFFFFF" },
  full: { width: "100%" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  headerText: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: "600", color: "#FFFFFF" },
  time: { fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 1 },
  iconBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, gap: 12, alignItems: "center" },
  caption: {
    alignSelf: "stretch",
    fontSize: 16,
    lineHeight: 22,
    color: "#FFFFFF",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  seenBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  seenText: { fontSize: 14, fontWeight: "600", color: "#FFFFFF" },
  sheetLoading: { paddingVertical: 24 },
  noViewers: { fontSize: 14, color: theme.colors.textMuted, textAlign: "center", paddingVertical: 20 },
  viewerList: { maxHeight: 360 },
  viewerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  viewerName: { flex: 1, fontSize: 15, fontWeight: "600", color: theme.colors.text },
  viewerTime: { fontSize: 12.5, color: theme.colors.textMuted },
}));
