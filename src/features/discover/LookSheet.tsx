// C:\OOTDify\src\features\discover\LookSheet.tsx
// One look, opened from Discover. Unlike a Community post card it is about the
// outfit, not the conversation: the pieces large and swipeable, who put it
// together (tap through to their profile, or add them as a friend), a like,
// saving it into your own Saved looks, and its comments. Your own look can be
// taken off Discover (deletes the share).
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { deleteSavedOutfit } from "../clothing/service";
import { addComment, deleteComment, deletePost, fetchComments, likePost, unlikePost } from "../community/service";
import { displayName } from "../community/socialService";
import type { FeedPost } from "../community/types";
import { ProfileAvatar } from "../profile/ProfileAvatar";
import { Sheet } from "../../shared/components/Sheet";
import { SmartImage } from "../../shared/components/SmartImage";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";
import { toast } from "../../shared/lib/toast";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import type { FriendState } from "./pieces";
import { CommentThread } from "./CommentThread";
import { FriendButton } from "./PieceViews";
import { saveLook } from "./service";

interface Props {
  look: FeedPost | null;
  isOwn: boolean;
  onClose: () => void;
  onLikeChanged: (postId: string, likedByMe: boolean, likeCount: number) => void;
  onRemoved: (postId: string) => void;
  onOpenCreator: (userId: string) => void;
  /** My saved copy of this look, if I saved it. */
  savedOutfitId?: string;
  onSavedChanged: (postId: string, outfitId: string | null) => void;
  friend: FriendState;
  onFriendChanged: (userId: string, next: FriendState) => void;
  /** A comment was posted (+1) or deleted (-1). */
  onCommentsChanged: (postId: string, delta: number) => void;
}

export function LookSheet({
  look,
  isOwn,
  onClose,
  onLikeChanged,
  onRemoved,
  onOpenCreator,
  savedOutfitId,
  onSavedChanged,
  friend,
  onFriendChanged,
  onCommentsChanged,
}: Props) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const [galleryW, setGalleryW] = useState(0);
  const [page, setPage] = useState(0);
  const [liking, setLiking] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggleSave = async () => {
    if (!look || saving) return;
    setSaving(true);
    try {
      if (savedOutfitId) {
        await deleteSavedOutfit(savedOutfitId);
        onSavedChanged(look.id, null);
        toast.success(t("explore.look.unsaved_toast"));
      } else {
        const outfit = await saveLook(look);
        onSavedChanged(look.id, outfit.id);
        toast.success(t("explore.look.saved_toast"));
      }
    } catch {
      toast.error(t("explore.look.save_error"));
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    setPage(0);
    setConfirmRemove(false);
    onClose();
  };

  const toggleLike = async () => {
    if (!look || liking) return;
    setLiking(true);
    const next = !look.likedByMe;
    // Optimistic; the SQL trigger keeps the server count in sync.
    onLikeChanged(look.id, next, Math.max(0, look.like_count + (next ? 1 : -1)));
    try {
      if (next) await likePost(look.id);
      else await unlikePost(look.id);
    } catch {
      onLikeChanged(look.id, !next, look.like_count);
      toast.error(t("explore.like_failed"));
    } finally {
      setLiking(false);
    }
  };

  const remove = async () => {
    if (!look) return;
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setRemoving(true);
    try {
      await deletePost(look);
      toast.success(t("explore.removed"));
      onRemoved(look.id);
      close();
    } catch {
      toast.error(t("explore.remove_failed"));
    } finally {
      setRemoving(false);
    }
  };

  const name = look ? displayName(look.author) : "";
  const pieces = look?.image_urls ?? [];

  return (
    <Sheet
      visible={look !== null}
      onClose={close}
      title={look?.title || t("explore.untitled")}
      icon="shirt-outline"
      busy={removing}
      footer={
        look ? (
          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: look.likedByMe }}
              accessibilityLabel={look.likedByMe ? t("explore.unlike") : t("explore.like")}
              onPress={() => void toggleLike()}
              style={({ pressed }) => [styles.likeBtn, look.likedByMe && styles.likeBtnOn, pressed && styles.pressed]}
            >
              <Ionicons
                name={look.likedByMe ? "heart" : "heart-outline"}
                size={20}
                color={look.likedByMe ? theme.colors.onBrand : theme.colors.accent}
              />
              <Text style={[styles.likeText, look.likedByMe && styles.likeTextOn]}>
                {look.likedByMe ? t("explore.liked", { count: look.like_count }) : t("explore.like_count", { count: look.like_count })}
              </Text>
            </Pressable>
            {!isOwn ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: Boolean(savedOutfitId), busy: saving }}
                accessibilityLabel={savedOutfitId ? t("explore.look.unsave") : t("explore.look.save")}
                disabled={saving}
                onPress={() => void toggleSave()}
                style={({ pressed }) => [styles.saveBtn, savedOutfitId ? styles.saveBtnOn : null, pressed && styles.pressed]}
              >
                <Ionicons
                  name={savedOutfitId ? "bookmark" : "bookmark-outline"}
                  size={18}
                  color={savedOutfitId ? theme.colors.onBrand : theme.colors.text}
                />
                <Text style={[styles.saveText, savedOutfitId ? styles.saveTextOn : null]}>
                  {savedOutfitId ? t("explore.look.saved") : t("explore.look.save")}
                </Text>
              </Pressable>
            ) : null}
            {isOwn ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void remove()}
                disabled={removing}
                style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}
              >
                <Text style={styles.removeText}>{confirmRemove ? t("explore.remove_confirm") : t("explore.remove")}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null
      }
    >
      {look ? (
        <View>
          <View style={styles.gallery} onLayout={(e) => setGalleryW(e.nativeEvent.layout.width)}>
            {galleryW > 0 ? (
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / galleryW))}
              >
                {pieces.map((ref, i) => (
                  <SmartImage
                    key={i}
                    source={ref}
                    style={{ width: galleryW, height: galleryW * 1.15 }}
                    accessibilityLabel={t("explore.piece_a11y", { n: i + 1, total: pieces.length })}
                  />
                ))}
              </ScrollView>
            ) : null}
            {pieces.length > 1 ? (
              <View style={styles.counter}>
                <Text style={styles.counterText}>{t("explore.piece_count", { n: page + 1, total: pieces.length })}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.creatorRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("explore.view_creator", { name })}
            onPress={() => {
              close();
              onOpenCreator(look.user_id);
            }}
            style={({ pressed }) => [styles.creator, pressed && styles.pressed]}
          >
            <ProfileAvatar size={40} avatarRef={look.author?.avatar_url ?? null} initial={name.slice(0, 1)} />
            <View style={styles.creatorText}>
              <Text style={styles.creatorName} numberOfLines={1}>
                {name}
              </Text>
              <Text style={styles.creatorHint}>{t("explore.view_profile")}</Text>
            </View>
          </Pressable>
          <FriendButton userId={look.user_id} state={friend} onChanged={onFriendChanged} />
          </View>

          {look.caption ? <Text style={styles.caption}>{look.caption}</Text> : null}

          <CommentThread
            key={look.id}
            ownerId={look.user_id}
            load={() => fetchComments(look.id)}
            send={(body) => addComment(look.id, body)}
            remove={deleteComment}
            onCountChange={(delta) => onCommentsChanged(look.id, delta)}
          />
        </View>
      ) : null}
    </Sheet>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
  pressed: { opacity: 0.85 },
  gallery: { borderRadius: theme.borderRadius.lg, overflow: "hidden", backgroundColor: theme.colors.surfaceAlt },
  counter: {
    position: "absolute",
    right: 10,
    bottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
  },
  counterText: { ...theme.typography.caption, color: theme.colors.text, fontVariant: ["tabular-nums"] },
  creatorRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: theme.spacing.md },
  creator: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12 },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  saveBtnOn: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  saveText: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  saveTextOn: { color: theme.colors.onBrand },
  creatorText: { flex: 1 },
  creatorName: { ...theme.typography.body, color: theme.colors.text, fontWeight: "600" },
  creatorHint: { ...theme.typography.caption, color: theme.colors.textMuted },
  caption: { ...theme.typography.body, color: theme.colors.textMuted, marginTop: theme.spacing.sm },
  footer: { flexDirection: "row", alignItems: "center", gap: 12 },
  likeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
  },
  likeBtnOn: { backgroundColor: theme.colors.accent },
  likeText: { ...theme.typography.body, color: theme.colors.accent, fontWeight: "600", fontVariant: ["tabular-nums"] },
  likeTextOn: { color: theme.colors.onBrand },
  removeBtn: { paddingVertical: 14, paddingHorizontal: 12 },
  removeText: { ...theme.typography.body, color: theme.colors.danger, fontWeight: "600" },
}));
