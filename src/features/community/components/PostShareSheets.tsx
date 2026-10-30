// C:\OOTDify\src\features\community\components\PostShareSheets.tsx
// The sheets a feed post opens: its ⋯ menu, Reshare (your caption above the
// original), Send (pick friends, add a note; it lands in each DM as a card)
// and a full-screen photo viewer. Rules live in ../postShare.ts.
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProfileAvatar } from "../../profile/ProfileAvatar";
import { AppButton } from "../../../shared/components/AppButton";
import { Sheet } from "../../../shared/components/Sheet";
import { SmartImage } from "../../../shared/components/SmartImage";
import type { Theme } from "../../../shared/config/theme";
import { useT } from "../../../shared/i18n/useT";
import { makeStyles } from "../../../shared/theme/makeStyles";
import { useAppTheme } from "../../../shared/theme/ThemeProvider";
import type { PostMenuAction } from "../postShare";
import { displayName, type Person } from "../socialService";
import type { FeedPost } from "../types";

const MENU_ICONS: Record<PostMenuAction, keyof typeof Ionicons.glyphMap> = {
  save: "bookmark-outline",
  unsave: "bookmark",
  send: "paper-plane-outline",
  share_out: "share-outline",
  view_profile: "person-outline",
  hide: "eye-off-outline",
  delete: "trash-outline",
};

export function PostMenuSheet({
  visible,
  actions,
  onPick,
  onClose,
}: {
  visible: boolean;
  actions: PostMenuAction[];
  onPick: (action: PostMenuAction) => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const close = () => {
    setConfirmDelete(false);
    onClose();
  };
  const labels: Record<PostMenuAction, string> = {
    save: t("community.post.menu.save"),
    unsave: t("community.post.menu.unsave"),
    send: t("community.post.menu.send"),
    share_out: t("community.post.menu.share_out"),
    view_profile: t("community.post.menu.view_profile"),
    hide: t("community.post.menu.hide"),
    delete: confirmDelete ? t("community.post.menu.delete_confirm") : t("community.post.menu.delete"),
  };
  return (
    <Sheet visible={visible} onClose={close} title={t("community.post.menu.title")} icon="ellipsis-horizontal">
      {actions.map((action) => {
        const danger = action === "delete";
        return (
          <Pressable
            key={action}
            accessibilityRole="button"
            onPress={() => {
              if (action === "delete" && !confirmDelete) {
                setConfirmDelete(true);
                return;
              }
              setConfirmDelete(false);
              onPick(action);
            }}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <Ionicons name={MENU_ICONS[action]} size={20} color={danger ? theme.colors.danger : theme.colors.text} />
            <View style={styles.rowTexts}>
              <Text style={[styles.rowText, danger && styles.danger]}>{labels[action]}</Text>
              {action === "hide" ? <Text style={styles.rowHint}>{t("community.post.menu.hide_hint")}</Text> : null}
            </View>
          </Pressable>
        );
      })}
    </Sheet>
  );
}

/** The original inside a reshare (feed card and the reshare sheet's preview). */
export function EmbeddedPost({ post, onPress }: { post: FeedPost | null; onPress?: () => void }) {
  const styles = useStyles();
  const { t } = useT();
  if (!post) {
    return (
      <View style={[styles.embed, styles.embedGone]}>
        <Text style={styles.embedGoneText}>{t("community.post.reshare.gone")}</Text>
      </View>
    );
  }
  const name = displayName(post.author);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("community.post.reshare.open_a11y", { name })}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.embed, pressed && styles.rowPressed]}
    >
      <View style={styles.embedHead}>
        <ProfileAvatar size={24} initial={(name[0] ?? "?").toUpperCase()} avatarRef={post.author?.avatar_url ?? null} />
        <Text style={styles.embedName} numberOfLines={1}>
          {name}
        </Text>
      </View>
      {post.title ? <Text style={styles.embedTitle}>{post.title}</Text> : null}
      {post.caption ? (
        <Text style={styles.embedCaption} numberOfLines={3}>
          {post.caption}
        </Text>
      ) : null}
      {post.image_urls.length ? (
        <View style={styles.embedImages}>
          {post.image_urls.slice(0, 3).map((ref, i) => (
            <SmartImage key={i} source={ref} style={styles.embedImage} accessibilityLabel={t("community.post.image_a11y", { index: i + 1, name })} />
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

export function ResharePostSheet({
  post,
  onClose,
  onReshare,
}: {
  /** The post to reshare (the sheet shows its original). */
  post: FeedPost | null;
  onClose: () => void;
  onReshare: (caption: string) => Promise<boolean>;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const close = () => {
    setCaption("");
    onClose();
  };
  const submit = async () => {
    setBusy(true);
    const ok = await onReshare(caption);
    setBusy(false);
    if (ok) close();
  };
  return (
    <Sheet
      visible={post !== null}
      onClose={close}
      title={t("community.post.reshare.title")}
      icon="repeat"
      busy={busy}
      footer={<AppButton label={t("community.post.reshare.submit")} loading={busy} onPress={() => void submit()} />}
    >
      <TextInput
        style={styles.input}
        value={caption}
        onChangeText={setCaption}
        placeholder={t("community.post.reshare.placeholder")}
        placeholderTextColor={theme.colors.textMuted}
        maxLength={500}
        multiline
      />
      <EmbeddedPost post={post?.original ?? post} />
    </Sheet>
  );
}

export function SendPostSheet({
  visible,
  friends,
  loading,
  onClose,
  onSend,
}: {
  visible: boolean;
  /** Null while loading. */
  friends: Person[] | null;
  loading: boolean;
  onClose: () => void;
  onSend: (friendIds: string[], note: string) => Promise<boolean>;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const close = () => {
    setPicked(new Set());
    setNote("");
    setQuery("");
    onClose();
  };
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const submit = async () => {
    setBusy(true);
    const ok = await onSend([...picked], note);
    setBusy(false);
    if (ok) close();
  };
  const shown = (friends ?? []).filter((f) => displayName(f).toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={t("community.post.send.title")}
      icon="paper-plane-outline"
      busy={busy}
      footer={
        <AppButton
          label={picked.size ? t("community.post.send.submit", { count: picked.size }) : t("community.post.send.pick")}
          disabled={picked.size === 0}
          loading={busy}
          onPress={() => void submit()}
        />
      }
    >
      {loading ? (
        <Text style={styles.muted}>{t("community.post.send.loading")}</Text>
      ) : !friends || friends.length === 0 ? (
        <Text style={styles.muted}>{t("community.post.send.no_friends")}</Text>
      ) : (
        <>
          <TextInput
            style={[styles.input, styles.search]}
            value={query}
            onChangeText={setQuery}
            placeholder={t("community.post.send.search")}
            placeholderTextColor={theme.colors.textMuted}
          />
          {shown.map((f) => {
            const name = displayName(f);
            const on = picked.has(f.user_id);
            return (
              <Pressable
                key={f.user_id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => toggle(f.user_id)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <ProfileAvatar size={38} initial={(name[0] ?? "?").toUpperCase()} avatarRef={f.avatar_url} />
                <Text style={[styles.rowText, styles.rowTexts]} numberOfLines={1}>
                  {name}
                </Text>
                <Ionicons
                  name={on ? "checkmark-circle" : "ellipse-outline"}
                  size={24}
                  color={on ? theme.colors.brand : theme.colors.border}
                />
              </Pressable>
            );
          })}
          <TextInput
            style={[styles.input, styles.note]}
            value={note}
            onChangeText={setNote}
            placeholder={t("community.post.send.note")}
            placeholderTextColor={theme.colors.textMuted}
            maxLength={500}
          />
        </>
      )}
    </Sheet>
  );
}

/** A post's photos full screen, swipeable, fitted (not cropped). */
export function PhotoViewer({
  images,
  startIndex,
  onClose,
}: {
  images: string[] | null;
  startIndex: number;
  onClose: () => void;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [page, setPage] = useState(startIndex);
  return (
    <Modal visible={images !== null} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.viewer}>
        {images ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: startIndex * width, y: 0 }}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          >
            {images.map((ref, i) => (
              <SmartImage
                key={i}
                source={ref}
                contentFit="contain"
                style={{ width, height }}
                accessibilityLabel={t("community.post.viewer.photo_a11y", { n: i + 1, total: images.length })}
              />
            ))}
          </ScrollView>
        ) : null}
        <View style={[styles.viewerBar, { top: insets.top + 8 }]}>
          {images && images.length > 1 ? (
            <Text style={styles.viewerCount}>{t("explore.piece_count", { n: page + 1, total: images.length })}</Text>
          ) : (
            <View />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("community.post.viewer.close")}
            hitSlop={10}
            onPress={onClose}
            style={styles.viewerClose}
          >
            <Ionicons name="close" size={24} color={theme.colors.text} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, paddingHorizontal: 4, borderRadius: theme.borderRadius.md },
  rowPressed: { backgroundColor: theme.colors.surfaceAlt },
  rowTexts: { flex: 1 },
  rowText: { ...theme.typography.body, color: theme.colors.text, fontWeight: "600" },
  rowHint: { ...theme.typography.caption, color: theme.colors.textMuted },
  danger: { color: theme.colors.danger },
  muted: { ...theme.typography.body, color: theme.colors.textMuted, paddingVertical: theme.spacing.md },
  input: {
    minHeight: 44,
    fontSize: 14.5,
    color: theme.colors.text,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: theme.spacing.md,
  },
  search: { marginBottom: theme.spacing.sm },
  note: { marginTop: theme.spacing.md },
  embed: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 10,
    gap: 6,
    backgroundColor: theme.colors.background,
  },
  embedGone: { alignItems: "center", paddingVertical: 18 },
  embedGoneText: { ...theme.typography.caption, color: theme.colors.textMuted, fontStyle: "italic" },
  embedHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  embedName: { ...theme.typography.caption, color: theme.colors.text, fontWeight: "700", flex: 1 },
  embedTitle: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  embedCaption: { fontSize: 13, lineHeight: 18, color: theme.colors.text },
  embedImages: { flexDirection: "row", gap: 4 },
  embedImage: { flex: 1, aspectRatio: 0.8, borderRadius: 8, overflow: "hidden", backgroundColor: theme.colors.surfaceAlt },
  viewer: { flex: 1, backgroundColor: theme.colors.background },
  viewerBar: { position: "absolute", left: 16, right: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  viewerCount: {
    ...theme.typography.caption,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
    fontVariant: ["tabular-nums"],
  },
  viewerClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
  },
}));
