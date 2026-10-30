// C:\OOTDify\src\app\community\post\[id].tsx
// One post on its own page, opened by tapping a post in the feed (or a post
// card in a chat, or the original inside a reshare): every photo, the whole
// caption, likes, and the comments already open with the box to add one.
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PostCard } from "../../../features/community/components/PostCard";
import { communityErrorMessage, deletePost, fetchPost } from "../../../features/community/service";
import type { FeedPost } from "../../../features/community/types";
import { FlyingPreloader } from "../../../shared/components/FlyingPreloader";
import { ScreenHeader } from "../../../shared/components/ScreenHeader";
import { EmptyState, ErrorState } from "../../../shared/components/StateViews";
import type { Theme } from "../../../shared/config/theme";
import { useT } from "../../../shared/i18n/useT";
import { supabase } from "../../../shared/lib/supabase";
import { toast } from "../../../shared/lib/toast";
import { makeStyles } from "../../../shared/theme/makeStyles";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "gone" } | { status: "ready"; post: FeedPost };

export default function PostScreen() {
  const styles = useStyles();
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = typeof id === "string" ? id : "";
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [me, setMe] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!postId) return;
    try {
      const [{ data }, post] = await Promise.all([supabase.auth.getSession(), fetchPost(postId)]);
      setMe(data.session?.user?.id ?? null);
      setLoad(post ? { status: "ready", post } : { status: "gone" });
    } catch (e) {
      setLoad({ status: "error", message: communityErrorMessage(e) });
    }
  }, [postId]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const update = (post: FeedPost) => setLoad({ status: "ready", post });

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top + 8 }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.pad}>
        <ScreenHeader title={t("community.post.page_title")} onBack={() => router.back()} backLabel={t("community.chat.back_a11y")} />
      </View>
      {load.status === "loading" ? (
        <View style={styles.fill}>
          <FlyingPreloader size={88} />
        </View>
      ) : load.status === "error" ? (
        <View style={styles.fill}>
          <ErrorState message={load.message} onRetry={() => void reload()} />
        </View>
      ) : load.status === "gone" ? (
        <View style={styles.fill}>
          <EmptyState icon="document-outline" title={t("community.post.gone.title")} message={t("community.post.gone.message")} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.pad, styles.content, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          <PostCard
            post={load.post}
            isOwn={load.post.user_id === me}
            detail
            onLikeChanged={(_, likedByMe, likeCount) => update({ ...load.post, likedByMe, like_count: likeCount })}
            onPostChanged={update}
            onHidden={() => router.back()}
            onReshared={() => void reload()}
            onDelete={(post) =>
              void deletePost(post)
                .then(() => {
                  toast.success(t("community.post.deleted_toast"));
                  router.back();
                })
                .catch((e: unknown) => toast.error(t("community.post.delete_error"), communityErrorMessage(e)))
            }
          />
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  pad: { paddingHorizontal: 16 },
  content: { paddingTop: theme.spacing.md },
  fill: { flex: 1, alignItems: "center", justifyContent: "center" },
}));
