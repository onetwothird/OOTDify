// C:\OOTDify\src\features\community\components\PostCard.tsx
// One post in the community feed: author (initial/avatar), the shared outfit
// images, caption, like/comment counts, inline comments, and sharing: reshare
// to the feed, send to friends, save, share outside the app, hide (others'
// posts) or delete (your own) from the ⋯ menu. Reshares show the original
// inside. Long captions fold behind "See more"; tap a photo to open it full
// screen, double-tap it to like.
//
// Avatars: each author's photo lives in the private `avatars` bucket. Signed-in
// users may read avatar objects (see supabase/schema.sql), so every post shows
// the real photo — falling back to the author's initial when they have none.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import { ProfileAvatar } from "../../profile/ProfileAvatar";
import { AppButton } from "../../../shared/components/AppButton";
import { SmartImage } from "../../../shared/components/SmartImage";
import { makeStyles } from "../../../shared/theme/makeStyles";
import { useAppTheme } from "../../../shared/theme/ThemeProvider";
import { useT } from "../../../shared/i18n/useT";
import { toast } from "../../../shared/lib/toast";
import { resolveMediaUrl } from "../../../shared/lib/storageUrl";
import { timeAgo } from "../format";
import {
  DOUBLE_TAP_MS,
  SEE_MORE_LINES_SHOWN,
  isDoubleTap,
  needsSeeMore,
  postMenuActions,
  shareOutText,
  type PostMenuAction,
} from "../postShare";
import {
  addComment,
  communityErrorMessage,
  fetchComments,
  hidePost,
  likePost,
  resharePost,
  savePost,
  sendPostToFriends,
  unlikePost,
  unsavePost,
} from "../service";
import { displayName, fetchFriends, type Person } from "../socialService";
import type { FeedComment, FeedPost } from "../types";
import { EmbeddedPost, PhotoViewer, PostMenuSheet, ResharePostSheet, SendPostSheet } from "./PostShareSheets";

/** Read in tap handlers only; kept outside the component so render stays pure. */
const clock = () => Date.now();

const CARD_W_SUBTRACTION = 64; // screen padding (32) + card padding (≈30)

export function PostCard({
  post,
  isOwn,
  onLikeChanged,
  onDelete,
  onPostChanged,
  onHidden,
  onReshared,
  detail = false,
}: {
  post: FeedPost;
  isOwn: boolean;
  /** On the post's own page: comments open, whole caption, no tap-through. */
  detail?: boolean;
  onLikeChanged: (postId: string, likedByMe: boolean, likeCount: number) => void;
  onDelete: (post: FeedPost) => void;
  /** Saved state changed (the card updates optimistically through this). */
  onPostChanged?: (post: FeedPost) => void;
  /** I hid this post from my feed. */
  onHidden?: (postId: string) => void;
  /** I reshared this post (the feed reloads to show it). */
  onReshared?: () => void;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const imageW = Math.max(200, width - CARD_W_SUBTRACTION);

  const [liking, setLiking] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [resharing, setResharing] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [friends, setFriends] = useState<Person[] | null>(null);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  // Brief heart over a photo after a double-tap like.
  const [heartAt, setHeartAt] = useState<number | null>(null);
  // Tap timing lives in refs: it's only read inside press handlers.
  const lastTap = useRef<number | null>(null);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Comments (fetched on first expand) ----------------------------------
  const [commentsOpen, setCommentsOpen] = useState(detail);
  const [comments, setComments] = useState<FeedComment[] | null>(null);

  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [loadingComments, setLoadingComments] = useState(detail);
  const [draft, setDraft] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  const toggleLike = async () => {
    if (liking) return;
    setLiking(true);
    const next = !post.likedByMe;
    // Optimistic — the SQL trigger keeps the server count in sync.
    onLikeChanged(
      post.id,
      next,
      Math.max(0, post.like_count + (next ? 1 : -1)),
    );
    try {
      if (next) await likePost(post.id);
      else await unlikePost(post.id);
    } catch {
      // Roll back on failure.
      onLikeChanged(
        post.id,
        !next,
        Math.max(0, post.like_count + (next ? -1 : 1)),
      );
    } finally {
      setLiking(false);
    }
  };

  const loadComments = async () => {
    setLoadingComments(true);
    setCommentsError(null);
    try {
      setComments(await fetchComments(post.id));
    } catch (e) {
      setCommentsError(e instanceof Error ? e.message : t("community.post.comments_error"));
    } finally {
      setLoadingComments(false);
    }
  };

  // The post page opens with its comments loaded.
  useEffect(() => {
    if (!detail) return;
    let alive = true;
    void fetchComments(post.id)
      .then((rows) => {
        if (alive) setComments(rows);
      })
      .catch((e: unknown) => {
        if (alive) setCommentsError(e instanceof Error ? e.message : t("community.post.comments_error"));
      })
      .finally(() => {
        if (alive) setLoadingComments(false);
      });
    return () => {
      alive = false;
    };
  }, [detail, post.id, t]);

  const toggleComments = () => {
    const open = !commentsOpen;
    setCommentsOpen(open);
    if (open && comments === null) void loadComments();
  };

  const submitComment = async () => {
    if (postingComment || !draft.trim()) return;
    setPostingComment(true);
    try {
      await addComment(post.id, draft);
      setDraft("");
      await loadComments();
    } catch (e) {
      setCommentsError(e instanceof Error ? e.message : t("community.post.comment_post_error"));
    } finally {
      setPostingComment(false);
    }
  };

  const toggleSave = async () => {
    const next = !post.savedByMe;
    onPostChanged?.({ ...post, savedByMe: next });
    try {
      if (next) await savePost(post.id);
      else await unsavePost(post.id);
      toast.success(next ? t("community.post.saved_toast") : t("community.post.unsaved_toast"));
    } catch (e) {
      onPostChanged?.({ ...post, savedByMe: !next });
      toast.error(t("community.post.save_error"), communityErrorMessage(e));
    }
  };

  const openSend = () => {
    setSendOpen(true);
    if (friends !== null || friendsLoading) return;
    setFriendsLoading(true);
    void fetchFriends()
      .then((overview) => setFriends(overview.friends))
      .catch(() => setFriends([]))
      .finally(() => setFriendsLoading(false));
  };

  const shareOut = async () => {
    const image = post.image_urls[0] ?? post.original?.image_urls[0] ?? null;
    // A week-long link, so the photo still opens after it's shared.
    const url = image ? await resolveMediaUrl(image, 7 * 24 * 3600).catch(() => null) : null;
    const source = post.original ?? post;
    await Share.share({ message: shareOutText(source, displayName(source.author), url) }).catch(() => {});
  };

  const pickMenu = (action: PostMenuAction) => {
    setMenuOpen(false);
    if (action === "save" || action === "unsave") void toggleSave();
    else if (action === "send") openSend();
    else if (action === "share_out") void shareOut();
    else if (action === "view_profile")
      router.push({ pathname: "/community/profile/[userId]", params: { userId: post.user_id } });
    else if (action === "hide")
      void hidePost(post.id)
        .then(() => {
          onHidden?.(post.id);
          toast.success(t("community.post.hidden_toast"));
        })
        .catch((e: unknown) => toast.error(t("community.post.hide_error"), communityErrorMessage(e)));
    else if (action === "delete") onDelete(post);
  };

  const reshare = async (caption: string): Promise<boolean> => {
    try {
      await resharePost(post, caption);
      toast.success(t("community.post.reshare.done"));
      onReshared?.();
      return true;
    } catch (e) {
      toast.error(t("community.post.reshare.error"), communityErrorMessage(e));
      return false;
    }
  };

  const send = async (friendIds: string[], note: string): Promise<boolean> => {
    try {
      await sendPostToFriends(post.original?.id ?? post.id, friendIds, note);
      toast.success(t("community.post.send.done", { count: friendIds.length }));
      return true;
    } catch (e) {
      toast.error(t("community.post.send.error"), communityErrorMessage(e));
      return false;
    }
  };

  const openPost = () => {
    if (detail) return;
    router.push({ pathname: "/community/post/[id]", params: { id: post.id } });
  };

  /** One tap opens the photo; a second tap inside the window likes instead. */
  const tapPhoto = (index: number) => {
    const now = clock();
    if (isDoubleTap(lastTap.current, now)) {
      lastTap.current = null;
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
      setHeartAt(index);
      setTimeout(() => setHeartAt(null), 700);
      if (!post.likedByMe) void toggleLike();
      return;
    }
    lastTap.current = now;
    singleTapTimer.current = setTimeout(() => setViewer(index), DOUBLE_TAP_MS + 20);
  };

  const authorName = post.author?.display_name || post.author?.first_name || t("community.post.default_author");
  const initial = (authorName[0] ?? "?").toUpperCase();

  return (
    <View style={styles.card}>
      {/* ---------------------------------------------------------- Header */}
      <View style={styles.header}>
        <ProfileAvatar
          size={38}
          initial={initial}
          avatarRef={post.author?.avatar_url ?? null}
        />
        <Pressable style={styles.headerBody} disabled={detail} onPress={openPost}>
          <Text style={styles.authorName} numberOfLines={1}>
            {authorName}
            {isOwn ? <Text style={styles.youTag}>{t("community.post.you_tag")}</Text> : null}
          </Text>
          <View style={styles.timeRow}>
            {post.reshared_from ? (
              <>
                <Ionicons name="repeat" size={12} color={theme.colors.textMuted} />
                <Text style={styles.time}>{t("community.post.reshare.tag")}</Text>
                <Text style={styles.time}>·</Text>
              </>
            ) : null}
            <Text style={styles.time}>{timeAgo(post.created_at)}</Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("community.post.menu.open_a11y")}
          hitSlop={10}
          onPress={() => setMenuOpen(true)}
          style={({ pressed }) => [styles.menuBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={theme.colors.textMuted} />
        </Pressable>
      </View>

      {/* ---------------------------------------------------------- Content */}
      {post.title ? (
        <Pressable disabled={detail} onPress={openPost}>
          <Text style={styles.title}>{post.title}</Text>
        </Pressable>
      ) : null}
      {post.caption ? (
        <Pressable
          disabled={detail}
          onPress={() => (needsSeeMore(post.caption) && !captionOpen ? setCaptionOpen(true) : openPost())}
          accessibilityRole="button"
          accessibilityHint={t("community.post.open_hint")}
        >
          <Text
            style={styles.caption}
            numberOfLines={!detail && needsSeeMore(post.caption) && !captionOpen ? SEE_MORE_LINES_SHOWN : undefined}
          >
            {post.caption}
          </Text>
          {!detail && needsSeeMore(post.caption) ? (
            <Text style={styles.seeMore}>{captionOpen ? t("community.post.see_less") : t("community.post.see_more")}</Text>
          ) : null}
        </Pressable>
      ) : null}

      {post.reshared_from ? (
        <EmbeddedPost
          post={post.original}
          onPress={
            post.original
              ? () => router.push({ pathname: "/community/post/[id]", params: { id: post.original?.id ?? "" } })
              : undefined
          }
        />
      ) : null}

      {post.image_urls.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.imageRow}
          decelerationRate="fast"
          snapToInterval={imageW + 10}
        >
          {post.image_urls.map((ref, i) => (
            <Pressable
              key={`${post.id}-img-${i}`}
              accessibilityRole="imagebutton"
              accessibilityHint={t("community.post.image_hint")}
              onPress={() => tapPhoto(i)}
            >
              <SmartImage
                source={ref}
                style={[styles.image, { width: imageW }]}
                accessibilityLabel={t("community.post.image_a11y", { index: i + 1, name: authorName })}
              />
              {heartAt === i ? (
                <View style={styles.heartBurst} pointerEvents="none">
                  <Ionicons name="heart" size={84} color={theme.colors.surface} />
                </View>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {/* ---------------------------------------------------------- Actions */}
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={post.likedByMe ? t("community.post.unlike_a11y") : t("community.post.like_a11y")}
          onPress={() => void toggleLike()}
          disabled={liking}
          style={styles.actionBtn}
        >
          <Ionicons
            name={post.likedByMe ? "heart" : "heart-outline"}
            size={20}
            color={post.likedByMe ? theme.colors.danger : theme.colors.text}
          />
          <Text style={styles.actionText}>{post.like_count}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("community.post.comments_a11y")}
          onPress={detail ? toggleComments : openPost}
          style={styles.actionBtn}
        >
          <Ionicons name="chatbubble-outline" size={18} color={theme.colors.text} />
          <Text style={styles.actionText}>{post.comment_count}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("community.post.reshare.a11y")}
          onPress={() => setResharing(true)}
          style={styles.actionBtn}
        >
          <Ionicons name="repeat" size={20} color={theme.colors.text} />
          <Text style={styles.actionText}>{(post.original ?? post).reshare_count}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("community.post.menu.send")}
          onPress={openSend}
          style={styles.actionBtn}
        >
          <Ionicons name="paper-plane-outline" size={19} color={theme.colors.text} />
        </Pressable>

        <View style={styles.actionsSpacer} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={post.savedByMe ? t("community.post.menu.unsave") : t("community.post.menu.save")}
          accessibilityState={{ selected: post.savedByMe }}
          hitSlop={8}
          onPress={() => void toggleSave()}
          style={styles.actionBtn}
        >
          <Ionicons
            name={post.savedByMe ? "bookmark" : "bookmark-outline"}
            size={19}
            color={post.savedByMe ? theme.colors.brand : theme.colors.text}
          />
        </Pressable>
      </View>

      {/* ---------------------------------------------------------- Comments */}
      {commentsOpen ? (
        <View style={styles.comments}>
          {loadingComments ? (
            <ActivityIndicator size="small" color={theme.colors.brand} />
          ) : commentsError ? (
            <Text style={styles.commentsError}>{commentsError}</Text>
          ) : comments && comments.length ? (
            comments.map((c) => (
              <View key={c.id} style={styles.commentRow}>
                <ProfileAvatar
                  size={30}
                  initial={(c.authorName[0] ?? "?").toUpperCase()}
                  avatarRef={c.authorAvatar}
                />
                <View style={styles.commentText}>
                  <Text style={styles.commentAuthor}>{c.authorName}</Text>
                  <Text style={styles.commentBody}>{c.body}</Text>
                  <Text style={styles.commentTime}>{timeAgo(c.created_at)}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.commentsEmpty}>{t("community.post.comments_empty")}</Text>
          )}

          <View style={styles.commentInputRow}>
            <TextInput
              style={styles.commentInput}
              value={draft}
              onChangeText={setDraft}
              placeholder={t("community.post.comment_placeholder")}
              placeholderTextColor={theme.colors.textMuted}
              maxLength={500}
              multiline
            />
            <AppButton
              label={t("community.post.comment_submit")}
              size="md"
              variant="secondary"
              loading={postingComment}
              disabled={!draft.trim()}
              onPress={() => void submitComment()}
            />
          </View>
        </View>
      ) : null}

      <PostMenuSheet
        visible={menuOpen}
        actions={postMenuActions({ isOwn, saved: post.savedByMe })}
        onPick={pickMenu}
        onClose={() => setMenuOpen(false)}
      />
      <ResharePostSheet post={resharing ? post : null} onClose={() => setResharing(false)} onReshare={reshare} />
      <SendPostSheet
        visible={sendOpen}
        friends={friends}
        loading={friendsLoading}
        onClose={() => setSendOpen(false)}
        onSend={send}
      />
      <PhotoViewer
        images={viewer === null ? null : post.image_urls}
        startIndex={viewer ?? 0}
        onClose={() => setViewer(null)}
      />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 14,
    gap: 10,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerBody: { flex: 1, minWidth: 0 },
  authorName: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  youTag: { fontWeight: "600", color: theme.colors.textMuted, fontSize: 12 },
  time: { fontSize: 11.5, color: theme.colors.textMuted },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  menuBtn: { padding: 4 },
  seeMore: { fontSize: 13, fontWeight: "700", color: theme.colors.textMuted, marginTop: 2 },
  heartBurst: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  actionsSpacer: { flex: 1 },
  title: { fontSize: 15, fontWeight: "700", color: theme.colors.text },
  caption: { fontSize: 13.5, lineHeight: 19, color: theme.colors.text },
  imageRow: { gap: 10, paddingVertical: 2 },
  image: {
    height: 300,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primaryMuted,
    overflow: "hidden",
  },
  actions: { flexDirection: "row", alignItems: "center", gap: 18 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionText: { fontSize: 13, fontWeight: "600", color: theme.colors.text },
  comments: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    paddingTop: 10,
    gap: 10,
  },
  commentsEmpty: { fontSize: 12.5, color: theme.colors.textMuted },
  commentsError: { fontSize: 12.5, color: theme.colors.danger },
  commentRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  commentText: { flex: 1, minWidth: 0, gap: 2 },
  commentAuthor: { fontSize: 12.5, fontWeight: "700", color: theme.colors.text },
  commentBody: { fontSize: 13, lineHeight: 18, color: theme.colors.text },
  commentTime: { fontSize: 10.5, color: theme.colors.textMuted },
  commentInputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  commentInput: {
    flex: 1,
    minHeight: 40,
    fontSize: 13.5,
    color: theme.colors.text,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
}));