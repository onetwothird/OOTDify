// C:\OOTDify\src\features\discover\PieceViews.tsx
// Public closet pieces in Discover: the wall card, the sheet a piece opens in
// (heart, save, its owner, comments) and the add-friend button shared with
// LookSheet.
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { acceptFriendRequest, displayName, sendFriendRequest } from "../community/socialService";
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
import {
  addPieceComment,
  deletePieceComment,
  fetchPieceComments,
  likePiece,
  savePiece,
  unlikePiece,
  unsavePiece,
  type DiscoverPiece,
} from "./service";

/** Add friend / Accept / Requested / Friends for one creator; nothing for yourself. */
export function FriendButton({
  userId,
  state,
  onChanged,
}: {
  userId: string;
  state: FriendState;
  onChanged: (userId: string, next: FriendState) => void;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  if (state === "self" || state === "unknown") return null;

  const act = async () => {
    setBusy(true);
    try {
      if (state === "none") {
        await sendFriendRequest(userId);
        onChanged(userId, "outgoing");
        toast.success(t("explore.friend.sent"));
      } else if (state === "incoming") {
        await acceptFriendRequest(userId);
        onChanged(userId, "friend");
        toast.success(t("explore.friend.accepted"));
      }
    } catch {
      toast.error(t("explore.friend.error"));
    } finally {
      setBusy(false);
    }
  };

  const actionable = state === "none" || state === "incoming";
  const label =
    state === "none"
      ? t("explore.friend.add")
      : state === "incoming"
        ? t("explore.friend.accept")
        : state === "outgoing"
          ? t("explore.friend.requested")
          : t("explore.friend.friends");
  const icon = state === "friend" ? "people" : state === "outgoing" ? "time-outline" : "person-add-outline";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !actionable || busy }}
      disabled={!actionable || busy}
      onPress={() => void act()}
      hitSlop={6}
      style={({ pressed }) => [styles.friendBtn, actionable ? styles.friendBtnOn : styles.friendBtnOff, pressed && styles.pressed]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={theme.colors.onBrand} />
      ) : (
        <Ionicons name={icon} size={15} color={actionable ? theme.colors.onBrand : theme.colors.textMuted} />
      )}
      <Text style={[styles.friendText, actionable ? styles.friendTextOn : styles.friendTextOff]}>{label}</Text>
    </Pressable>
  );
}

/** One public piece on the wall: its photo, a heart with the count, save, and whose it is. */
export function PieceCard({
  piece,
  width,
  onPress,
  onChanged,
}: {
  piece: DiscoverPiece;
  width: number;
  onPress: () => void;
  onChanged: (piece: DiscoverPiece) => void;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t, tl } = useT();
  const name = displayName(piece.owner);
  const title = piece.name || (piece.category ? tl("category", piece.category) : t("explore.piece.untitled"));
  const { toggleLike, toggleSave } = usePieceActions(piece, onChanged);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("explore.piece.a11y", { title, name })}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={[styles.frame, { width, height: width * 1.25 }]}>
        <SmartImage source={piece.image_url} style={styles.fill} accessibilityLabel={title} />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: piece.savedByMe }}
          accessibilityLabel={piece.savedByMe ? t("explore.piece.unsave") : t("explore.piece.save")}
          hitSlop={8}
          onPress={(e) => {
            e.stopPropagation();
            void toggleSave();
          }}
          style={styles.saveBadge}
        >
          <Ionicons name={piece.savedByMe ? "bookmark" : "bookmark-outline"} size={16} color={theme.colors.text} />
        </Pressable>
      </View>
      <Text style={styles.cardTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.byline}>
        <ProfileAvatar size={20} avatarRef={piece.owner?.avatar_url ?? null} initial={name.slice(0, 1)} />
        <Text style={styles.author} numberOfLines={1}>
          {name}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: piece.likedByMe }}
          accessibilityLabel={piece.likedByMe ? t("explore.unlike") : t("explore.like")}
          hitSlop={8}
          onPress={(e) => {
            e.stopPropagation();
            void toggleLike();
          }}
          style={styles.heart}
        >
          <Ionicons name={piece.likedByMe ? "heart" : "heart-outline"} size={15} color={theme.colors.accent} />
          <Text style={styles.likes}>{piece.like_count}</Text>
        </Pressable>
        {piece.comment_count > 0 ? (
          <View style={styles.heart} accessibilityLabel={t("explore.comments.count", { count: piece.comment_count })}>
            <Ionicons name="chatbubble-outline" size={14} color={theme.colors.textMuted} />
            <Text style={styles.likes}>{piece.comment_count}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/** A piece opened from the wall: large photo, heart and save, and its owner with add friend. */
export function PieceSheet({
  piece,
  friend,
  onClose,
  onChanged,
  onFriendChanged,
  onOpenOwner,
}: {
  piece: DiscoverPiece | null;
  friend: FriendState;
  onClose: () => void;
  onChanged: (piece: DiscoverPiece) => void;
  onFriendChanged: (userId: string, next: FriendState) => void;
  onOpenOwner: (userId: string) => void;
}) {
  const styles = useStyles();
  const { t, tl } = useT();
  const name = piece ? displayName(piece.owner) : "";
  const title = piece
    ? piece.name || (piece.category ? tl("category", piece.category) : t("explore.piece.untitled"))
    : "";
  return (
    <Sheet
      visible={piece !== null}
      onClose={onClose}
      title={title}
      icon="shirt-outline"
      footer={piece ? <PieceSheetActions piece={piece} onChanged={onChanged} /> : null}
    >
      {piece ? (
        <View>
          <View style={styles.sheetPhoto}>
            <SmartImage source={piece.image_url} style={styles.fill} accessibilityLabel={title} />
          </View>
          {piece.category ? <Text style={styles.category}>{tl("category", piece.category)}</Text> : null}
          <View style={styles.owner}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("explore.view_creator", { name })}
              onPress={() => {
                onClose();
                onOpenOwner(piece.user_id);
              }}
              style={({ pressed }) => [styles.ownerMain, pressed && styles.pressed]}
            >
              <ProfileAvatar size={40} avatarRef={piece.owner?.avatar_url ?? null} initial={name.slice(0, 1)} />
              <View style={styles.ownerText}>
                <Text style={styles.ownerName} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={styles.ownerHint}>{t("explore.piece.from_closet")}</Text>
              </View>
            </Pressable>
            <FriendButton userId={piece.user_id} state={friend} onChanged={onFriendChanged} />
          </View>

          <CommentThread
            key={piece.id}
            ownerId={piece.user_id}
            load={() => fetchPieceComments(piece.id)}
            send={(body) => addPieceComment(piece.id, body)}
            remove={deletePieceComment}
            onCountChange={(delta) => onChanged({ ...piece, comment_count: Math.max(0, piece.comment_count + delta) })}
          />
        </View>
      ) : null}
    </Sheet>
  );
}

function PieceSheetActions({ piece, onChanged }: { piece: DiscoverPiece; onChanged: (piece: DiscoverPiece) => void }) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const { toggleLike, toggleSave } = usePieceActions(piece, onChanged);
  return (
    <View style={styles.footer}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: piece.likedByMe }}
        onPress={() => void toggleLike()}
        style={({ pressed }) => [styles.action, piece.likedByMe && styles.actionOn, pressed && styles.pressed]}
      >
        <Ionicons
          name={piece.likedByMe ? "heart" : "heart-outline"}
          size={19}
          color={piece.likedByMe ? theme.colors.onBrand : theme.colors.accent}
        />
        <Text style={[styles.actionText, piece.likedByMe && styles.actionTextOn]}>
          {t("explore.like_count", { count: piece.like_count })}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: piece.savedByMe }}
        onPress={() => void toggleSave()}
        style={({ pressed }) => [styles.action, piece.savedByMe && styles.actionOn, pressed && styles.pressed]}
      >
        <Ionicons
          name={piece.savedByMe ? "bookmark" : "bookmark-outline"}
          size={18}
          color={piece.savedByMe ? theme.colors.onBrand : theme.colors.text}
        />
        <Text style={[styles.actionText, piece.savedByMe && styles.actionTextOn]}>
          {piece.savedByMe ? t("explore.piece.saved") : t("explore.piece.save")}
        </Text>
      </Pressable>
    </View>
  );
}

/** Optimistic heart and save, rolled back with a toast if the server refuses. */
function usePieceActions(piece: DiscoverPiece, onChanged: (piece: DiscoverPiece) => void) {
  const { t } = useT();
  const toggleLike = async () => {
    const next = !piece.likedByMe;
    onChanged({ ...piece, likedByMe: next, like_count: Math.max(0, piece.like_count + (next ? 1 : -1)) });
    try {
      if (next) await likePiece(piece.id);
      else await unlikePiece(piece.id);
    } catch {
      onChanged(piece);
      toast.error(t("explore.like_failed"));
    }
  };
  const toggleSave = async () => {
    const next = !piece.savedByMe;
    onChanged({ ...piece, savedByMe: next });
    try {
      if (next) await savePiece(piece.id);
      else await unsavePiece(piece.id);
      toast.success(next ? t("explore.piece.saved_toast") : t("explore.piece.unsaved_toast"));
    } catch {
      onChanged(piece);
      toast.error(t("explore.piece.save_error"));
    }
  };
  return { toggleLike, toggleSave };
}

const useStyles = makeStyles((theme: Theme) => ({
  pressed: { opacity: 0.85 },
  fill: { width: "100%", height: "100%" },
  card: { marginBottom: 18 },
  frame: { borderRadius: theme.borderRadius.lg, overflow: "hidden", backgroundColor: theme.colors.surfaceAlt },
  saveBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
  },
  cardTitle: { fontSize: 13.5, fontWeight: "600", color: theme.colors.text, marginTop: 8 },
  byline: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 5 },
  author: { flex: 1, fontSize: 12, color: theme.colors.textMuted },
  heart: { flexDirection: "row", alignItems: "center", gap: 3 },
  likes: { fontSize: 12, color: theme.colors.textMuted, fontVariant: ["tabular-nums"] },
  sheetPhoto: {
    width: "100%",
    aspectRatio: 4 / 5,
    borderRadius: theme.borderRadius.lg,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceAlt,
  },
  category: { ...theme.typography.caption, color: theme.colors.textMuted, marginTop: theme.spacing.sm },
  owner: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: theme.spacing.md },
  ownerMain: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12 },
  ownerText: { flex: 1, minWidth: 0 },
  ownerName: { ...theme.typography.body, color: theme.colors.text, fontWeight: "600" },
  ownerHint: { ...theme.typography.caption, color: theme.colors.textMuted },
  friendBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.pill,
  },
  friendBtnOn: { backgroundColor: theme.colors.brand },
  friendBtnOff: { backgroundColor: theme.colors.surfaceAlt },
  friendText: { fontSize: 13, fontWeight: "700" },
  friendTextOn: { color: theme.colors.onBrand },
  friendTextOff: { color: theme.colors.textMuted },
  footer: { flexDirection: "row", gap: 10 },
  action: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  actionOn: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  actionText: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  actionTextOn: { color: theme.colors.onBrand },
}));
