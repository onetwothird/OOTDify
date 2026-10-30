// C:\OOTDify\src\features\discover\CommentThread.tsx
// The conversation under a look or a piece in Discover. Anyone who can see
// it can comment; you can delete your own comments, and the owner can delete
// any comment on their look or piece (RLS enforces both). The parent passes
// the three calls for its kind of target and hears about count changes so
// cards stay in step. Keyed by the target id, so switching targets reloads.
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import { timeAgo } from "../community/format";
import { ProfileAvatar } from "../profile/ProfileAvatar";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";
import { supabase } from "../../shared/lib/supabase";
import { toast } from "../../shared/lib/toast";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { canDeleteComment, COMMENT_MAX, commentDraft } from "./comments";

export interface ThreadComment {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  authorName: string;
  authorAvatar: string | null;
}

/** Show the characters-left counter once a draft gets this close to the limit. */
const COUNTER_FROM = 100;

export function CommentThread({
  ownerId,
  load,
  send,
  remove,
  onCountChange,
}: {
  /** Who owns the look or piece (may delete any comment on it). */
  ownerId: string;
  load: () => Promise<ThreadComment[]>;
  send: (body: string) => Promise<void>;
  remove: (commentId: string) => Promise<void>;
  /** +1 after a comment is posted, -1 after one is deleted. */
  onCountChange: (delta: number) => void;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const [meId, setMeId] = useState<string | null>(null);
  const [comments, setComments] = useState<ThreadComment[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const rows = await load();
      setComments(rows);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [load]);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (alive) setMeId(data.session?.user?.id ?? null);
    });
    void load()
      .then((rows) => alive && setComments(rows))
      .catch(() => alive && setLoadFailed(true));
    return () => {
      alive = false;
    };
    // Loaded once per mounted target; the parent keys this by target id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { body, canSend, tooLong, left } = commentDraft(draft);

  const submit = async () => {
    if (!canSend || sending) return;
    setSending(true);
    try {
      await send(body);
      setDraft("");
      onCountChange(1);
      await refresh();
    } catch {
      toast.error(t("explore.comments.send_error"));
    } finally {
      setSending(false);
    }
  };

  const del = async (id: string) => {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    setDeletingId(id);
    try {
      await remove(id);
      setComments((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
      onCountChange(-1);
    } catch {
      toast.error(t("explore.comments.delete_error"));
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>{t("explore.comments.title")}</Text>
        {comments && comments.length ? <Text style={styles.count}>{comments.length}</Text> : null}
      </View>

      {comments === null && !loadFailed ? (
        <ActivityIndicator color={theme.colors.textMuted} style={styles.loading} />
      ) : null}

      {loadFailed ? (
        <View style={styles.failed}>
          <Text style={styles.muted}>{t("explore.comments.load_error")}</Text>
          <Pressable accessibilityRole="button" onPress={() => void refresh()} hitSlop={8}>
            <Text style={styles.retry}>{t("explore.comments.retry")}</Text>
          </Pressable>
        </View>
      ) : null}

      {comments && !comments.length ? <Text style={styles.empty}>{t("explore.comments.empty")}</Text> : null}

      {comments?.map((c) => {
        const deletable = canDeleteComment(c.user_id, meId, ownerId);
        const confirming = confirmId === c.id;
        return (
          <View key={c.id} style={styles.row}>
            <ProfileAvatar size={30} avatarRef={c.authorAvatar} initial={c.authorName.slice(0, 1)} />
            <View style={styles.rowMain}>
              <View style={styles.rowHead}>
                <Text style={styles.name} numberOfLines={1}>
                  {c.authorName}
                </Text>
                {c.user_id === ownerId ? <Text style={styles.ownerTag}>{t("explore.comments.owner")}</Text> : null}
                <Text style={styles.time}>{timeAgo(c.created_at)}</Text>
              </View>
              <Text style={styles.body}>{c.body}</Text>
            </View>
            {deletable ? (
              deletingId === c.id ? (
                <ActivityIndicator size="small" color={theme.colors.textMuted} />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={confirming ? t("explore.comments.delete_confirm") : t("explore.comments.delete")}
                  hitSlop={8}
                  onPress={() => void del(c.id)}
                  style={confirming ? styles.confirm : styles.trash}
                >
                  {confirming ? (
                    <Text style={styles.confirmText}>{t("explore.comments.delete_confirm")}</Text>
                  ) : (
                    <Ionicons name="trash-outline" size={16} color={theme.colors.textMuted} />
                  )}
                </Pressable>
              )
            ) : null}
          </View>
        );
      })}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={t("explore.comments.placeholder")}
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel={t("explore.comments.placeholder")}
          maxLength={COMMENT_MAX + 50}
          multiline
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("explore.comments.send")}
          accessibilityState={{ disabled: !canSend || sending, busy: sending }}
          disabled={!canSend || sending}
          onPress={() => void submit()}
          style={({ pressed }) => [styles.send, (!canSend || sending) && styles.sendOff, pressed && styles.pressed]}
        >
          {sending ? (
            <ActivityIndicator size="small" color={theme.colors.onBrand} />
          ) : (
            <Ionicons name="arrow-up" size={18} color={theme.colors.onBrand} />
          )}
        </Pressable>
      </View>
      {left <= COUNTER_FROM ? (
        <Text style={[styles.left, tooLong && styles.leftOver]}>
          {tooLong ? t("explore.comments.too_long", { count: -left }) : t("explore.comments.left", { count: left })}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
  pressed: { opacity: 0.85 },
  wrap: {
    marginTop: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  head: { flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: theme.spacing.sm },
  title: { fontSize: 16, fontWeight: "700", color: theme.colors.text },
  count: { fontSize: 14, color: theme.colors.textMuted, fontVariant: ["tabular-nums"] },
  loading: { marginVertical: theme.spacing.md },
  failed: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: theme.spacing.sm },
  muted: { ...theme.typography.caption, color: theme.colors.textMuted },
  retry: { fontSize: 13, fontWeight: "700", color: theme.colors.brand },
  empty: { ...theme.typography.body, color: theme.colors.textMuted, marginVertical: theme.spacing.sm },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 9 },
  rowMain: { flex: 1, minWidth: 0 },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { flexShrink: 1, fontSize: 13.5, fontWeight: "700", color: theme.colors.text },
  ownerTag: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.brand,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: theme.colors.primaryMuted,
    overflow: "hidden",
  },
  time: { fontSize: 12, color: theme.colors.textMuted },
  body: { fontSize: 14, lineHeight: 20, color: theme.colors.text, marginTop: 2 },
  trash: { padding: 4 },
  confirm: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.danger,
  },
  confirmText: { fontSize: 12, fontWeight: "700", color: theme.colors.danger },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: theme.spacing.sm },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 11,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    color: theme.colors.text,
    fontSize: 14,
  },
  send: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.brand,
  },
  sendOff: { opacity: 0.45 },
  left: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4, marginLeft: 14, fontVariant: ["tabular-nums"] },
  leftOver: { color: theme.colors.danger },
}));
