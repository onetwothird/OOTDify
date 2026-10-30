// C:\OOTDify\src\features\community\components\SharedPostCard.tsx
// A feed post sent in a chat: who posted it, its first photo and a line of
// text. Tapping opens the post's page. Deleted posts say so instead.
import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { ProfileAvatar } from "../../profile/ProfileAvatar";
import { SmartImage } from "../../../shared/components/SmartImage";
import type { Theme } from "../../../shared/config/theme";
import { useT } from "../../../shared/i18n/useT";
import { makeStyles } from "../../../shared/theme/makeStyles";
import { useAppTheme } from "../../../shared/theme/ThemeProvider";
import { displayName } from "../socialService";
import type { FeedPost } from "../types";

export function SharedPostCard({
  post,
  loading,
  onOpen,
}: {
  /** Undefined while loading, null when the post is gone. */
  post: FeedPost | null | undefined;
  loading: boolean;
  onOpen: (postId: string) => void;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  if (post === undefined || (post === null && loading)) {
    return <View style={[styles.card, styles.placeholder]} />;
  }
  if (post === null) {
    return (
      <View style={[styles.card, styles.gone]}>
        <Ionicons name="document-outline" size={16} color={theme.colors.textMuted} />
        <Text style={styles.goneText}>{t("community.chat.shared_post.gone")}</Text>
      </View>
    );
  }
  const source = post.original ?? post;
  const name = displayName(source.author);
  const image = source.image_urls[0];
  const line = source.title || source.caption;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("community.chat.shared_post.a11y", { name })}
      onPress={() => onOpen(source.id)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.head}>
        <ProfileAvatar size={22} initial={(name[0] ?? "?").toUpperCase()} avatarRef={source.author?.avatar_url ?? null} />
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
      </View>
      {image ? <SmartImage source={image} style={styles.image} accessibilityLabel={t("community.chat.shared_post.photo_a11y", { name })} /> : null}
      {line ? (
        <Text style={styles.line} numberOfLines={2}>
          {line}
        </Text>
      ) : null}
      <Text style={styles.open}>{t("community.chat.shared_post.open")}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
  card: {
    width: 220,
    maxWidth: "100%",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 4,
  },
  placeholder: { height: 120, backgroundColor: theme.colors.surfaceAlt },
  gone: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10 },
  goneText: { fontSize: 12.5, fontStyle: "italic", color: theme.colors.textMuted },
  head: { flexDirection: "row", alignItems: "center", gap: 6, padding: 8 },
  name: { flex: 1, fontSize: 12.5, fontWeight: "700", color: theme.colors.text },
  image: { width: "100%", aspectRatio: 4 / 5, backgroundColor: theme.colors.surfaceAlt },
  line: { fontSize: 12.5, lineHeight: 17, color: theme.colors.text, paddingHorizontal: 8, paddingTop: 6 },
  open: { fontSize: 12, fontWeight: "700", color: theme.colors.brand, padding: 8 },
}));
