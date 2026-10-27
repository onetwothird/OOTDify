// C:\OOTDify\src\app\community\myday\[userId].tsx
// Watch one person's My Day. Each post plays for POST_MS (hold to pause), a
// tap on the left or right goes back or forward, and it closes after the last
// one. A friend's post is marked as seen when it shows, and can be hearted or
// commented on (only you and the owner see that). On your own, "Activity"
// shows who saw it, who hearted it and their comments, and you can delete it.
//
// Optional params: `post` starts at that post, `activity=1` opens its
// activity straight away (both used by notifications).
//
// The photo fills the screen, so the chrome on top of it is fixed white on a
// black backdrop, the same as camera chrome, to stay readable on any photo.
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { communityErrorMessage } from "../../../features/community/service";
import { timeAgo } from "../../../features/community/format";
import { firstUnseenIndex, type MyDayPostRow } from "../../../features/community/social";
import {
  deleteMyDay,
  displayName,
  fetchMyDay,
  fetchMyDayActivity,
  fetchMyHearts,
  markMyDayViewed,
  sendMyDayComment,
  setMyDayHeart,
  type MyDayActivity,
} from "../../../features/community/socialService";
import type { DirectoryProfile } from "../../../features/community/types";
import { ConfirmSheet } from "../../../shared/components/ConfirmSheet";
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
  const { userId, post: startPost, activity } = useLocalSearchParams<{
    userId: string;
    post?: string;
    activity?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { t } = useT();
  const reduceMotion = useReduceMotion();

  const [posts, setPosts] = useState<MyDayPostRow[] | null>(null);
  const [profile, setProfile] = useState<DirectoryProfile | null>(null);
  const [isMine, setIsMine] = useState(false);
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const [typing, setTyping] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityData, setActivityData] = useState<MyDayActivity | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hearts, setHearts] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [progress] = useState(() => new Animated.Value(0));
  const [pop] = useState(() => new Animated.Value(1));

  const post = posts?.[index] ?? null;

  const openActivity = useCallback(
    async (target: MyDayPostRow) => {
      setActivityOpen(true);
      setActivityData(null);
      try {
        setActivityData(await fetchMyDayActivity(target.id));
      } catch (e) {
        setActivityData({ viewers: [], hearts: new Set(), comments: [] });
        toast.error(t("myday.toast.load_error"), communityErrorMessage(e));
      }
    },
    [t],
  );

  useEffect(() => {
    let alive = true;
    void fetchMyDay()
      .then(async (feed) => {
        if (!alive) return;
        const list = feed.posts.filter((p) => p.user_id === userId);
        if (!list.length) {
          toast.info(t("myday.gone"));
          router.back();
          return;
        }
        const mine = userId === feed.me;
        const requested = startPost ? list.findIndex((p) => p.id === startPost) : -1;
        const start = requested >= 0 ? requested : mine ? 0 : firstUnseenIndex(list, feed.viewed);
        setPosts(list);
        setProfile(feed.profiles.get(userId) ?? null);
        setIsMine(mine);
        setIndex(start);
        if (mine && activity === "1") void openActivity(list[start]);
        if (!mine) {
          const mineHearts = await fetchMyHearts(list.map((p) => p.id)).catch(() => new Set<string>());
          if (alive) setHearts(mineHearts);
        }
      })
      .catch((e) => {
        if (!alive) return;
        toast.error(t("myday.toast.load_error"), communityErrorMessage(e));
        router.back();
      });
    return () => {
      alive = false;
    };
  }, [userId, startPost, activity, router, t, openActivity]);

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

  // The bar fills over POST_MS, then moves on. It waits while held, while
  // typing a comment and while a sheet is open, and resumes where it
  // stopped; reduce motion still advances, just without the fill.
  const paused = held || typing || activityOpen || confirmDelete;
  useEffect(() => {
    if (!post || paused) return;
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
  }, [post, paused, progress, next]);

  const toggleHeart = () => {
    if (!post) return;
    const on = !hearts.has(post.id);
    setHearts((prev) => {
      const nextSet = new Set(prev);
      if (on) nextSet.add(post.id);
      else nextSet.delete(post.id);
      return nextSet;
    });
    if (on && !reduceMotion) {
      pop.setValue(0.6);
      Animated.spring(pop, { toValue: 1, friction: 3, tension: 160, useNativeDriver: true }).start();
    }
    void setMyDayHeart(post.id, on).catch((e) => {
      setHearts((prev) => {
        const back = new Set(prev);
        if (on) back.delete(post.id);
        else back.add(post.id);
        return back;
      });
      toast.error(t("myday.toast.react_error"), communityErrorMessage(e));
    });
  };

  const send = async () => {
    if (!post || sending || !comment.trim()) return;
    setSending(true);
    try {
      await sendMyDayComment(post.id, comment);
      setComment("");
      toast.success(t("myday.comment.sent", { name: displayName(profile) }));
    } catch (e) {
      toast.error(t("myday.toast.react_error"), communityErrorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const remove = async () => {
    if (!post || !posts) return;
    setDeleting(true);
    try {
      await deleteMyDay(post);
      setConfirmDelete(false);
      const rest = posts.filter((p) => p.id !== post.id);
      if (!rest.length) {
        router.back();
        return;
      }
      setPosts(rest);
      setIndex(Math.min(index, rest.length - 1));
    } catch (e) {
      toast.error(t("myday.toast.delete_error"), communityErrorMessage(e));
    } finally {
      setDeleting(false);
    }
  };

  if (!posts || !post) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  const name = isMine ? t("myday.yours") : displayName(profile);
  const hearted = hearts.has(post.id);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <SmartImage source={post.image_ref} style={StyleSheet.absoluteFill} contentFit="contain" />

      {/* Tap left for back, right for next; hold anywhere to pause. */}
      <View style={styles.tapZones}>
        <Pressable
          style={styles.flex}
          accessibilityRole="button"
          accessibilityLabel={t("myday.prev_a11y")}
          onPress={prev}
          onLongPress={() => setHeld(true)}
          onPressOut={() => setHeld(false)}
        />
        <Pressable
          style={styles.flex}
          accessibilityRole="button"
          accessibilityLabel={t("myday.next_a11y")}
          onPress={next}
          onLongPress={() => setHeld(true)}
          onPressOut={() => setHeld(false)}
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("myday.delete.title")}
              hitSlop={8}
              onPress={() => setConfirmDelete(true)}
              style={styles.iconBtn}
            >
              <Ionicons name="trash-outline" size={21} color="#FFFFFF" />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
            hitSlop={8}
            onPress={() => router.back()}
            style={styles.iconBtn}
          >
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 14 }]} pointerEvents="box-none">
        {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}
        {isMine ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void openActivity(post)}
            style={({ pressed }) => [styles.seenBtn, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="eye-outline" size={17} color="#FFFFFF" />
            <Text style={styles.seenText}>{t("myday.activity")}</Text>
            <Ionicons name="chevron-up" size={16} color="#FFFFFF" />
          </Pressable>
        ) : (
          <View style={styles.replyRow}>
            <TextInput
              value={comment}
              onChangeText={setComment}
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
              placeholder={t("myday.comment.placeholder", { name: displayName(profile).split(/\s+/)[0] })}
              placeholderTextColor="rgba(255,255,255,0.75)"
              maxLength={300}
              style={styles.replyInput}
              returnKeyType="send"
              onSubmitEditing={() => void send()}
            />
            {comment.trim() ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("myday.comment.send")}
                disabled={sending}
                onPress={() => void send()}
                style={styles.roundBtn}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="send" size={19} color="#FFFFFF" />
                )}
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={hearted ? t("myday.unheart") : t("myday.heart")}
                accessibilityState={{ selected: hearted }}
                onPress={toggleHeart}
                style={styles.roundBtn}
              >
                <Animated.View style={{ transform: [{ scale: pop }] }}>
                  {/* The heart keeps the feed's copper so it reads as a "like". */}
                  <Ionicons name={hearted ? "heart" : "heart-outline"} size={26} color={hearted ? "#E8892E" : "#FFFFFF"} />
                </Animated.View>
              </Pressable>
            )}
          </View>
        )}
      </View>

      <ActivitySheet visible={activityOpen} data={activityData} onClose={() => setActivityOpen(false)} />
      <ConfirmSheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        icon="trash-outline"
        title={t("myday.delete.title")}
        message={t("myday.delete.message")}
        confirmLabel={t("myday.delete.confirm")}
        cancelLabel={t("myday.delete.keep")}
        busy={deleting}
        onConfirm={() => void remove()}
      />
    </KeyboardAvoidingView>
  );
}

function ActivitySheet({
  visible,
  data,
  onClose,
}: {
  visible: boolean;
  data: MyDayActivity | null;
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
      title={t("myday.activity")}
      subtitle={
        data
          ? t("myday.activity.summary", {
              views: data.viewers.length,
              hearts: data.hearts.size,
              comments: data.comments.length,
            })
          : undefined
      }
      scroll={false}
    >
      {data === null ? (
        <ActivityIndicator color={theme.colors.brand} style={styles.sheetLoading} />
      ) : data.viewers.length === 0 && data.comments.length === 0 ? (
        <Text style={styles.noViewers}>{t("myday.viewers.empty")}</Text>
      ) : (
        <ScrollView style={styles.viewerList}>
          {data.comments.length > 0 ? (
            <>
              <Text style={styles.sheetLabel}>{t("myday.comments")}</Text>
              {data.comments.map((c) => {
                const name = displayName(c.profile);
                return (
                  <View key={c.id} style={styles.commentRow}>
                    <ProfileAvatar size={34} initial={(name[0] ?? "?").toUpperCase()} avatarRef={c.profile?.avatar_url ?? null} />
                    <View style={styles.commentBubble}>
                      <Text style={styles.commentName}>
                        {name} <Text style={styles.viewerTime}>{timeAgo(c.createdAt)}</Text>
                      </Text>
                      <Text style={styles.commentBody}>{c.body}</Text>
                    </View>
                  </View>
                );
              })}
            </>
          ) : null}
          {data.viewers.length > 0 ? (
            <>
              <Text style={styles.sheetLabel}>{t("myday.viewers.title")}</Text>
              {data.viewers.map((v) => {
                const name = displayName(v.profile);
                return (
                  <View key={v.viewerId} style={styles.viewerRow}>
                    <View>
                      <ProfileAvatar size={40} initial={(name[0] ?? "?").toUpperCase()} avatarRef={v.profile?.avatar_url ?? null} />
                      {data.hearts.has(v.viewerId) ? (
                        <View style={styles.heartBadge}>
                          <Ionicons name="heart" size={10} color={theme.colors.onBrand} />
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.viewerName} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={styles.viewerTime}>{timeAgo(v.viewedAt)}</Text>
                  </View>
                );
              })}
            </>
          ) : null}
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
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, gap: 12, alignItems: "center" },
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
  replyRow: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 10 },
  replyInput: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.7)",
    backgroundColor: "rgba(0,0,0,0.3)",
    color: "#FFFFFF",
    fontSize: 15,
  },
  roundBtn: { width: 46, height: 46, alignItems: "center", justifyContent: "center" },
  sheetLoading: { paddingVertical: 24 },
  noViewers: { fontSize: 14, color: theme.colors.textMuted, textAlign: "center", paddingVertical: 20 },
  viewerList: { maxHeight: 420 },
  sheetLabel: { fontSize: 13, fontWeight: "600", color: theme.colors.textMuted, marginTop: 6, marginBottom: 4 },
  commentRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 6 },
  commentBubble: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceAlt,
  },
  commentName: { fontSize: 13.5, fontWeight: "600", color: theme.colors.text },
  commentBody: { fontSize: 14, lineHeight: 19, color: theme.colors.text, marginTop: 2 },
  viewerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  heartBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.danger,
    borderWidth: 2,
    borderColor: theme.colors.surface,
  },
  viewerName: { flex: 1, fontSize: 15, fontWeight: "600", color: theme.colors.text },
  viewerTime: { fontSize: 12.5, fontWeight: "400", color: theme.colors.textMuted },
}));
