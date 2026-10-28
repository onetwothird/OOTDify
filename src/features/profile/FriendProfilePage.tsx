// C:\OOTDify\src\features\profile\FriendProfilePage.tsx
// A friend's profile: cover, photo, name, bio, a Message button and the looks
// they have shared to Community. Everything private (closet, saved looks, body
// photos, preferences) stays private: the bio and cover come from
// get_friend_profile, which only answers for accepted friends, and the posts are
// the ones already public to every member.
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton } from "../../shared/components/AppButton";
import { Pinstripes } from "../../shared/components/ClothesRail";
import { FlyingPreloader } from "../../shared/components/FlyingPreloader";
import { SmartImage } from "../../shared/components/SmartImage";
import { EmptyState, ErrorState } from "../../shared/components/StateViews";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";
import { toast } from "../../shared/lib/toast";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { communityErrorMessage, fetchUserPosts, startDirectConversation } from "../community/service";
import { displayName, fetchFriendProfile } from "../community/socialService";
import type { CommunityPost, FriendProfile } from "../community/types";
import { ProfileAvatar } from "./ProfileAvatar";

const COVER_HEIGHT = 148;
const AVATAR = 108;

interface Data {
  profile: FriendProfile;
  posts: CommunityPost[];
}

export function FriendProfilePage() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const styles = useStyles();
  const { t } = useT();

  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [messaging, setMessaging] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [profile, posts] = await Promise.all([fetchFriendProfile(userId), fetchUserPosts(userId)]);
      if (!profile) throw new Error(t("friend_profile.not_found"));
      setData({ profile, posts });
    } catch (e) {
      setError(communityErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [userId, t]);

  useEffect(() => {
    // Microtask kick-off: no setState runs synchronously within the effect body.
    Promise.resolve()
      .then(load)
      .catch(() => {});
  }, [load]);

  const message = async () => {
    if (!userId || messaging) return;
    setMessaging(true);
    try {
      const id = await startDirectConversation(userId);
      router.push(`/community/chat/${id}`);
    } catch (e) {
      toast.error(t("community.toast.chat_error.title"), communityErrorMessage(e));
    } finally {
      setMessaging(false);
    }
  };

  const back = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("friend_profile.back")}
      onPress={() => router.back()}
      hitSlop={8}
      style={[styles.back, { top: insets.top + 8 }]}
    >
      <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
    </Pressable>
  );

  if (loading && !data) {
    return (
      <View style={styles.screen}>
        <View style={styles.center}>
          <FlyingPreloader size={104} label={t("friend_profile.loading")} />
        </View>
        {back}
      </View>
    );
  }
  if (error || !data) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 48 }]}>
        <ErrorState message={error ?? t("friend_profile.not_found")} onRetry={load} />
        {back}
      </View>
    );
  }

  const { profile, posts } = data;
  const name = displayName(profile);
  const bio = profile.bio?.trim() ?? "";

  return (
    <View style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <View style={[styles.cover, { height: COVER_HEIGHT + insets.top }]}>
          {profile.cover_url ? <SmartImage source={profile.cover_url} style={StyleSheet.absoluteFill} /> : <Pinstripes />}
        </View>

        <View style={styles.identity}>
          <View style={styles.avatarWrap}>
            <ProfileAvatar
              size={AVATAR}
              initial={(name[0] ?? "?").toUpperCase()}
              avatarRef={profile.avatar_url}
              ring={theme.colors.background}
            />
          </View>
          <Text style={styles.name} accessibilityRole="header" numberOfLines={2}>
            {name}
          </Text>
          {bio ? <Text style={styles.bio}>{bio}</Text> : null}

          <View style={styles.actions}>
            <AppButton
              label={t("friends.message_private")}
              icon="chatbubble-ellipses-outline"
              loading={messaging}
              onPress={() => void message()}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("friend_profile.posts")}</Text>
          {posts.length ? (
            posts.map((post) => (
              <View key={post.id} style={styles.post}>
                {post.image_urls[0] ? <SmartImage source={post.image_urls[0]} style={styles.postImage} /> : null}
                <View style={styles.postBody}>
                  {post.title ? <Text style={styles.postTitle}>{post.title}</Text> : null}
                  {post.caption ? <Text style={styles.postCaption}>{post.caption}</Text> : null}
                  <Text style={styles.muted}>
                    {t("profile.page.posts.stats", { likes: post.like_count, comments: post.comment_count })}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <EmptyState compact icon="people-outline" title={t("friend_profile.posts.empty", { name })} />
          )}
        </View>
      </ScrollView>
      {back}
    </View>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  back: {
    position: "absolute",
    left: theme.spacing.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  cover: {
    backgroundColor: theme.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    overflow: "hidden",
  },
  identity: { paddingHorizontal: theme.spacing.md, gap: 6 },
  avatarWrap: {
    marginTop: -AVATAR / 2,
    alignSelf: "flex-start",
    borderRadius: AVATAR / 2 + 4,
    padding: 4,
    backgroundColor: theme.colors.background,
  },
  name: {
    marginTop: 6,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: "700",
    letterSpacing: -0.6,
    color: theme.colors.text,
  },
  bio: { fontSize: 15, lineHeight: 22, color: theme.colors.text, marginTop: 2 },
  actions: { marginTop: 14 },
  section: { paddingHorizontal: theme.spacing.md, marginTop: 24, gap: 12 },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: theme.colors.text },
  post: {
    borderRadius: theme.borderRadius.md,
    overflow: "hidden",
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  postImage: { width: "100%", aspectRatio: 4 / 5, backgroundColor: theme.colors.surfaceAlt },
  postBody: { padding: 12, gap: 4 },
  postTitle: { fontSize: 15, fontWeight: "600", color: theme.colors.text },
  postCaption: { fontSize: 14, lineHeight: 20, color: theme.colors.text },
  muted: { fontSize: 13, color: theme.colors.textMuted },
}));
