// C:\OOTDify\src\features\discover\LookViews.tsx
// Discover's building blocks. A look's images form a flat-lay: one image fills
// its frame, several sit as a piece grid (cards) or one large piece beside a
// stack (the spotlight). Likes use copper, the theme's favourites accent.
import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { ProfileAvatar } from "../profile/ProfileAvatar";
import { displayName } from "../community/socialService";
import type { FeedPost } from "../community/types";
import { SmartImage } from "../../shared/components/SmartImage";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { cardHeight, type Creator } from "./rank";

const GAP = 3;

/** Up to four pieces in a 2x2 grid; empty cells stay as quiet fill. */
function PieceGrid({ refs, label }: { refs: string[]; label: string }) {
  const styles = useStyles();
  const cells = refs.slice(0, 4);
  while (cells.length < 4) cells.push("");
  return (
    <View style={styles.grid}>
      {[0, 2].map((row) => (
        <View key={row} style={styles.gridRow}>
          {cells.slice(row, row + 2).map((ref, i) =>
            ref ? (
              <SmartImage key={i} source={ref} style={styles.gridCell} accessibilityLabel={label} />
            ) : (
              <View key={i} style={[styles.gridCell, styles.emptyCell]} />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

/** One wall card: the look edge to edge, then who shared it and its likes. */
export function LookCard({ look, width, onPress }: { look: FeedPost; width: number; onPress: () => void }) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const name = displayName(look.author);
  const label = t("explore.look_a11y", { name });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={[styles.frame, { width, height: width * cardHeight(look) }]}>
        {look.image_urls.length > 1 ? (
          <PieceGrid refs={look.image_urls} label={label} />
        ) : (
          <SmartImage source={look.image_urls[0]} style={styles.fill} accessibilityLabel={label} />
        )}
      </View>
      {look.title ? (
        <Text style={styles.cardTitle} numberOfLines={1}>
          {look.title}
        </Text>
      ) : null}
      <View style={styles.byline}>
        <ProfileAvatar size={20} avatarRef={look.author?.avatar_url ?? null} initial={name.slice(0, 1)} />
        <Text style={styles.author} numberOfLines={1}>
          {name}
        </Text>
        <Ionicons name={look.likedByMe ? "heart" : "heart-outline"} size={14} color={theme.colors.accent} />
        <Text style={styles.likes}>{look.like_count}</Text>
      </View>
    </Pressable>
  );
}

/** "Look of the week": the one large moment at the top of Discover. */
export function Spotlight({ look, width, onPress }: { look: FeedPost; width: number; onPress: () => void }) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const name = displayName(look.author);
  const label = t("explore.look_a11y", { name });
  const [main, ...rest] = look.image_urls;
  const side = rest.slice(0, 2);
  const height = width * 1.05;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("explore.spotlight_a11y", { name })}
      onPress={onPress}
      style={({ pressed }) => [styles.spotlight, pressed && styles.pressed]}
    >
      <View style={[styles.spotFrame, { height }]}>
        <SmartImage source={main} style={side.length ? styles.spotMain : styles.fill} accessibilityLabel={label} />
        {side.length ? (
          <View style={styles.spotSide}>
            {side.map((ref, i) => (
              <SmartImage key={i} source={ref} style={styles.spotSideCell} accessibilityLabel={label} />
            ))}
          </View>
        ) : null}
      </View>
      <View style={styles.spotInfo}>
        <Text style={styles.spotKicker}>{t("explore.spotlight")}</Text>
        <Text style={styles.spotTitle} numberOfLines={2}>
          {look.title || look.caption || t("explore.untitled")}
        </Text>
        <View style={styles.byline}>
          <ProfileAvatar size={24} avatarRef={look.author?.avatar_url ?? null} initial={name.slice(0, 1)} />
          <Text style={[styles.author, styles.spotAuthor]} numberOfLines={1}>
            {name}
          </Text>
          <Ionicons name="heart" size={16} color={theme.colors.accent} />
          <Text style={[styles.likes, styles.spotLikes]}>{look.like_count}</Text>
          <Ionicons name="chatbubble-outline" size={15} color={theme.colors.textMuted} />
          <Text style={styles.comments}>{look.comment_count}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/** People whose looks got the most likes this month. */
export function CreatorsRow({
  creators,
  posts,
  onOpen,
  style,
}: {
  creators: Creator[];
  posts: FeedPost[];
  onOpen: (userId: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const { t } = useT();
  if (creators.length === 0) return null;
  const profileOf = (id: string) => posts.find((p) => p.user_id === id)?.author ?? null;
  return (
    <View style={style}>
      <Text style={styles.sectionTitle}>{t("explore.creators")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.creators}>
        {creators.map((c) => {
          const name = displayName(profileOf(c.userId));
          return (
            <Pressable
              key={c.userId}
              accessibilityRole="button"
              accessibilityLabel={t("explore.creator_a11y", { name, likes: c.likes })}
              onPress={() => onOpen(c.userId)}
              style={({ pressed }) => [styles.creator, pressed && styles.pressed]}
            >
              <ProfileAvatar size={56} avatarRef={profileOf(c.userId)?.avatar_url ?? null} initial={name.slice(0, 1)} />
              <Text style={styles.creatorName} numberOfLines={1}>
                {name}
              </Text>
              <Text style={styles.creatorMeta}>{t("explore.creator_likes", { count: c.likes })}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
  pressed: { opacity: 0.85 },
  fill: { width: "100%", height: "100%" },
  card: { marginBottom: theme.spacing.md },
  frame: { borderRadius: theme.borderRadius.md, overflow: "hidden", backgroundColor: theme.colors.surfaceAlt },
  grid: { flex: 1, gap: GAP },
  gridRow: { flex: 1, flexDirection: "row", gap: GAP },
  gridCell: { flex: 1, backgroundColor: theme.colors.surface },
  emptyCell: { backgroundColor: theme.colors.surfaceAlt },
  cardTitle: { ...theme.typography.caption, color: theme.colors.text, marginTop: 6, fontWeight: "600" },
  byline: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  author: { ...theme.typography.caption, color: theme.colors.textMuted, flex: 1 },
  likes: { ...theme.typography.caption, color: theme.colors.accent, fontVariant: ["tabular-nums"] },
  comments: { ...theme.typography.caption, color: theme.colors.textMuted, fontVariant: ["tabular-nums"] },
  spotlight: {
    borderRadius: theme.borderRadius.lg,
    overflow: "hidden",
    backgroundColor: theme.colors.surface,
  },
  spotFrame: { flexDirection: "row", gap: GAP, backgroundColor: theme.colors.surfaceAlt },
  spotMain: { flex: 2 },
  spotSide: { flex: 1, gap: GAP },
  spotSideCell: { flex: 1 },
  spotInfo: { padding: theme.spacing.md, gap: 4 },
  spotKicker: { ...theme.typography.caption, color: theme.colors.brand, fontWeight: "700" },
  spotTitle: { ...theme.typography.hero, color: theme.colors.text },
  spotAuthor: { ...theme.typography.body, color: theme.colors.text },
  spotLikes: { ...theme.typography.body, fontWeight: "600" },
  sectionTitle: { ...theme.typography.subheading, color: theme.colors.text, marginBottom: theme.spacing.sm },
  creators: { gap: theme.spacing.md, paddingRight: theme.spacing.md },
  creator: { width: 72, alignItems: "center", gap: 4 },
  creatorName: { ...theme.typography.caption, color: theme.colors.text, fontWeight: "600" },
  creatorMeta: { ...theme.typography.caption, color: theme.colors.accent, fontVariant: ["tabular-nums"] },
}));
