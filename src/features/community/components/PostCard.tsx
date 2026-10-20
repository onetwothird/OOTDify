// C:\OOTDify\src\features\community/components/PostCard.tsx
// One post in the community feed: author (initial/avatar), the shared outfit
// images, caption, like/comment counts, inline comments, a Message shortcut
// to the author, and delete for the author's own posts.
//
// Avatars: other users' avatars live in a PRIVATE bucket (owner-scoped RLS),
// so only the viewer's own posts render a photo — everyone else shows an
// initial. That's a deliberate privacy line, not an oversight.
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
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
import { theme } from "../../../shared/config/theme";
import { timeAgo } from "../format";
import {
  addComment,
  fetchComments,
  likePost,
  unlikePost,
} from "../service";
import type { FeedComment, FeedPost } from "../types";

const CARD_W_SUBTRACTION = 64; // screen padding (32) + card padding (≈30)

export function PostCard({
  post,
  isOwn,
  meId,
  onLikeChanged,
  onMessage,
  onDelete,
}: {
  post: FeedPost;
  isOwn: boolean;
  meId: string | null;
  onLikeChanged: (postId: string, likedByMe: boolean, likeCount: number) => void;
  onMessage: (authorId: string) => void;
  onDelete: (post: FeedPost) => void;
}) {
  const { width } = useWindowDimensions();
  const imageW = Math.max(200, width - CARD_W_SUBTRACTION);

  const [liking, setLiking] = useState(false);

  // ---- Comments (fetched on first expand) ----------------------------------
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<FeedComment[] | null>(null);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [loadingComments, setLoadingComments] = useState(false);
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
      setCommentsError(e instanceof Error ? e.message : "Could not load comments.");
    } finally {
      setLoadingComments(false);
    }
  };

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
      setCommentsError(e instanceof Error ? e.message : "Could not post your comment.");
    } finally {
      setPostingComment(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert("Delete this post?", "The shared look and its comments will be removed.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => onDelete(post) },
    ]);
  };

  const authorName = post.author?.display_name || post.author?.first_name || "OOTDify member";
  const initial = (authorName[0] ?? "?").toUpperCase();

  return (
    <View style={styles.card}>
      {/* ---------------------------------------------------------- Header */}
      <View style={styles.header}>
        <ProfileAvatar
          size={38}
          initial={initial}
          avatarRef={isOwn ? post.author?.avatar_url ?? null : null}
        />
        <View style={styles.headerBody}>
          <Text style={styles.authorName} numberOfLines={1}>
            {authorName}
            {isOwn ? <Text style={styles.youTag}>  · you</Text> : null}
          </Text>
          <Text style={styles.time}>{timeAgo(post.created_at)}</Text>
        </View>
        {isOwn ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete post"
            hitSlop={8}
            onPress={confirmDelete}
            style={({ pressed }) => pressed && { opacity: 0.6 }}
          >
            <Ionicons name="trash-outline" size={19} color={theme.colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {/* ---------------------------------------------------------- Content */}
      {post.title ? <Text style={styles.title}>{post.title}</Text> : null}
      {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}

      {post.image_urls.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.imageRow}
          decelerationRate="fast"
          snapToInterval={imageW + 10}
        >
          {post.image_urls.map((ref, i) => (
            <SmartImage
              key={`${post.id}-img-${i}`}
              source={ref}
              style={[styles.image, { width: imageW }]}
              accessibilityLabel={`Shared look ${i + 1} by ${authorName}`}
            />
          ))}
        </ScrollView>
      ) : null}

      {/* ---------------------------------------------------------- Actions */}
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={post.likedByMe ? "Unlike" : "Like"}
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
          accessibilityLabel="Comments"
          onPress={toggleComments}
          style={styles.actionBtn}
        >
          <Ionicons name="chatbubble-outline" size={18} color={theme.colors.text} />
          <Text style={styles.actionText}>{post.comment_count}</Text>
        </Pressable>

        {!isOwn && post.user_id !== meId ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Message ${authorName}`}
            onPress={() => onMessage(post.user_id)}
            style={styles.actionBtn}
          >
            <Ionicons name="paper-plane-outline" size={18} color={theme.colors.text} />
            <Text style={styles.actionText}>Message</Text>
          </Pressable>
        ) : null}
      </View>

      {/* ---------------------------------------------------------- Comments */}
      {commentsOpen ? (
        <View style={styles.comments}>
          {loadingComments ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : commentsError ? (
            <Text style={styles.commentsError}>{commentsError}</Text>
          ) : comments && comments.length ? (
            comments.map((c) => (
              <View key={c.id} style={styles.commentRow}>
                <Text style={styles.commentAuthor}>{c.authorName}</Text>
                <Text style={styles.commentBody}>{c.body}</Text>
                <Text style={styles.commentTime}>{timeAgo(c.created_at)}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.commentsEmpty}>No comments yet — say something nice.</Text>
          )}

          <View style={styles.commentInputRow}>
            <TextInput
              style={styles.commentInput}
              value={draft}
              onChangeText={setDraft}
              placeholder="Add a comment…"
              placeholderTextColor={theme.colors.textMuted}
              maxLength={500}
              multiline
            />
            <AppButton
              label="Post"
              size="md"
              variant="secondary"
              loading={postingComment}
              disabled={!draft.trim()}
              onPress={() => void submitComment()}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
  authorName: { fontSize: 14, fontWeight: "800", color: theme.colors.text },
  youTag: { fontWeight: "600", color: theme.colors.textMuted, fontSize: 12 },
  time: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 1 },
  title: { fontSize: 15, fontWeight: "800", color: theme.colors.text },
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
  actionText: { fontSize: 13, fontWeight: "700", color: theme.colors.text },
  comments: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    paddingTop: 10,
    gap: 10,
  },
  commentsEmpty: { fontSize: 12.5, color: theme.colors.textMuted },
  commentsError: { fontSize: 12.5, color: theme.colors.danger },
  commentRow: { gap: 2 },
  commentAuthor: { fontSize: 12.5, fontWeight: "800", color: theme.colors.text },
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
});
