// C:\OOTDify\src\features\profile\ProfilePage.tsx
// The signed-in user's own profile page (the Profile tab), laid out like a social profile: a
// cover photo (pinstripes until one is uploaded), a large photo overlapping it, name, bio and member-since
// line, counts, an Intro card built from their real preferences, then tabs for
// their Closet, saved Looks and Community posts. Every number and tile is a
// real row; a section that fails to load says so instead of showing zeros.
// Editing details stays on the Edit profile screen; the bio and cover are edited here.
// Opens instantly with the last load (profileData.ts) and refreshes behind it.
// A failed refresh over shown data says so in a toast instead of blanking.
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { updateProfile, uploadProfileCover } from "../../services/aiApi";
import { AppButton } from "../../shared/components/AppButton";
import { Pinstripes } from "../../shared/components/ClothesRail";
import { Sheet } from "../../shared/components/Sheet";
import { SmartImage } from "../../shared/components/SmartImage";
import { EmptyState, ErrorState } from "../../shared/components/StateViews";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";
import { useHideOnScroll, useTabBarSpace } from "../../shared/navigation/useTabChrome";
import { toast } from "../../shared/lib/toast";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { pickAvatarPhoto, type AvatarSource } from "./avatar";
import { useAvatarStore } from "./avatarStore";
import { CoverPhotoSheet } from "./CoverPhotoSheet";
import { ProfileAvatar } from "./ProfileAvatar";
import { cachedProfilePage, loadProfilePage, type ProfilePageData } from "./profileData";

const BIO_MAX = 160;
const COVER_HEIGHT = 148;
const AVATAR = 108;

type Tab = "closet" | "looks" | "posts";

type Data = ProfilePageData;

export function ProfilePage() {
  // The tab bar slides away while scrolling down; content clears it at the end.
  const hideOnScroll = useHideOnScroll();
  const tabBarSpace = useTabBarSpace();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useStyles();
  const theme = useAppTheme();
  const { t, tl, locale } = useT();
  const avatarRef = useAvatarStore((s) => s.ref);
  const setAvatarRef = useAvatarStore((s) => s.setRef);

  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("closet");
  const [editingBio, setEditingBio] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverSheetOpen, setCoverSheetOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    // Show the last load at once; the fresh one replaces it when it lands.
    const cached = await cachedProfilePage().catch(() => null);
    if (cached) setData((d) => d ?? cached);
    try {
      const fresh = await loadProfilePage();
      setData(fresh);
      if (fresh.profile.avatar_url) setAvatarRef(fresh.profile.avatar_url);
    } catch (e) {
      const message = e instanceof Error ? e.message : t("profile.page.load_failed");
      // Already showing the page: keep it and say the refresh failed.
      if (cached) toast.error(t("profile.page.load_failed"), message);
      else setError(message);
    }
  }, [setAvatarRef, t]);

  // A tab stays mounted, so refresh on every visit: counts and tiles follow
  // what was added elsewhere in the app.
  useFocusEffect(
    useCallback(() => {
      // Inline async so the effect never sets state synchronously.
      void (async () => {
        await load();
      })();
    }, [load]),
  );

  const setCover = (cover_url: string | null) =>
    setData((d) => (d ? { ...d, profile: { ...d.profile, cover_url } } : d));

  const uploadCover = async (source: AvatarSource): Promise<boolean> => {
    const picked = await pickAvatarPhoto(source, "cover");
    if (!picked) return false;
    setCoverBusy(true);
    toast.loading(t("profile.page.cover.uploading"), t("profile.page.cover.uploading_body"));
    try {
      const updated = await uploadProfileCover(picked.uri);
      setCover(updated.cover_url ?? null);
      toast.success(t("profile.page.cover.saved"));
      return true;
    } catch (e) {
      toast.error(t("profile.page.cover.failed"), e instanceof Error ? e.message : "");
      return false;
    } finally {
      setCoverBusy(false);
    }
  };

  const removeCover = async (): Promise<boolean> => {
    setCoverBusy(true);
    try {
      await updateProfile({ cover_url: null });
      setCover(null);
      toast.success(t("profile.page.cover.removed"));
      return true;
    } catch (e) {
      toast.error(t("profile.page.cover.failed"), e instanceof Error ? e.message : "");
      return false;
    } finally {
      setCoverBusy(false);
    }
  };

  if (error) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ErrorState message={error} onRetry={load} />
      </View>
    );
  }

  const profile = data?.profile;
  const name =
    profile?.display_name?.trim() ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
    data?.email?.split("@")[0] ||
    "";
  const joined = data?.joined
    ? t("profile.page.member_since", {
        date: new Date(data.joined).toLocaleDateString(locale, { month: "long", year: "numeric" }),
      })
    : null;
  const bio = profile?.bio?.trim() || "";

  type IntroRow = { icon: keyof typeof Ionicons.glyphMap; label: string; values: string[] };
  const intro: IntroRow[] = profile
    ? ([
        { icon: "sparkles-outline", label: t("profile.page.intro.styles"), values: profile.preferred_styles },
        { icon: "color-palette-outline", label: t("profile.page.intro.colors"), values: profile.preferred_colors },
        { icon: "resize-outline", label: t("profile.page.intro.sizes"), values: profile.sizes },
        {
          icon: "calendar-outline",
          label: t("profile.page.intro.occasions"),
          values: profile.preferred_occasions.map((o) => tl("occasion", o)),
        },
      ] satisfies IntroRow[]).filter((row) => row.values.length > 0)
    : [];

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: tabBarSpace }}
        {...hideOnScroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Cover */}
        <View style={[styles.cover, { height: COVER_HEIGHT + insets.top }]}>
          {profile?.cover_url ? (
            <SmartImage source={profile.cover_url} style={StyleSheet.absoluteFill} />
          ) : (
            <Pinstripes />
          )}
          {data ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("profile.page.cover.edit")}
              disabled={coverBusy}
              onPress={() => setCoverSheetOpen(true)}
              hitSlop={6}
              style={({ pressed }) => [styles.coverBtn, pressed && styles.pressed]}
            >
              {coverBusy ? (
                <ActivityIndicator size="small" color={theme.colors.text} />
              ) : (
                <Ionicons name="camera-outline" size={17} color={theme.colors.text} />
              )}
              <Text style={styles.coverBtnText}>{t("profile.page.cover.edit")}</Text>
            </Pressable>
          ) : null}
        </View>
        <CoverPhotoSheet
          visible={coverSheetOpen}
          onClose={() => setCoverSheetOpen(false)}
          coverUrl={profile?.cover_url ?? null}
          onPick={uploadCover}
          onRemove={removeCover}
        />

        {/* Identity */}
        <View style={styles.identity}>
          <View style={styles.avatarWrap}>
            <ProfileAvatar
              size={AVATAR}
              initial={(name[0] ?? "").toUpperCase()}
              avatarRef={avatarRef}
              onChanged={setAvatarRef}
              badge
              ring={theme.colors.background}
              badgeRing={theme.colors.background}
            />
          </View>

          <Text style={styles.name} accessibilityRole="header" numberOfLines={2}>
            {name || " "}
          </Text>
          {joined ? <Text style={styles.joined}>{joined}</Text> : null}

          {data ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("profile.page.bio.edit_a11y")}
              onPress={() => setEditingBio(true)}
              style={({ pressed }) => [styles.bioRow, pressed && styles.pressed]}
            >
              <Text style={bio ? styles.bio : styles.bioEmpty}>{bio || t("profile.page.bio.empty")}</Text>
              <Ionicons
                name={bio ? "create-outline" : "add-circle-outline"}
                size={18}
                color={theme.colors.textMuted}
              />
            </Pressable>
          ) : null}

          <View style={styles.stats}>
            <Stat value={data?.closet.length} label={t("profile.page.stat.pieces")} />
            <View style={styles.statRule} />
            <Stat value={data?.looks.length} label={t("profile.page.stat.looks")} />
            <View style={styles.statRule} />
            <Stat value={data?.posts.length} label={t("profile.page.stat.posts")} />
          </View>

          <AppButton
            label={t("profile.page.edit")}
            icon="create-outline"
            variant="secondary"
            size="md"
            onPress={() => router.push("/profile/edit")}
          />
        </View>

        {/* Intro */}
        {data ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("profile.page.intro")}</Text>
            {intro.length ? (
              intro.map((row) => (
                <View key={row.label} style={styles.introRow}>
                  <Ionicons name={row.icon} size={18} color={theme.colors.textMuted} />
                  <Text style={styles.introText}>
                    <Text style={styles.introLabel}>{row.label} </Text>
                    {row.values.join(", ")}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.muted}>{t("profile.page.intro.empty")}</Text>
            )}
          </View>
        ) : null}

        {/* Tabs */}
        {data ? (
          <>
            <View style={styles.tabs} accessibilityRole="tablist">
              {(["closet", "looks", "posts"] as const).map((key) => {
                const active = tab === key;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    onPress={() => setTab(key)}
                    style={[styles.tab, active && styles.tabActive]}
                  >
                    <Text style={[styles.tabText, active && styles.tabTextActive]}>
                      {t(`profile.page.tab.${key}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {tab === "closet" ? (
              data.closet.length ? (
                <View style={styles.grid}>
                  {data.closet.map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => router.push(`/item/${item.id}`)}
                      style={({ pressed }) => [styles.gridCell, pressed && styles.pressed]}
                      accessibilityLabel={item.name ?? item.category ?? ""}
                    >
                      <SmartImage source={item.image_url} style={styles.gridImage} fallbackIcon="shirt-outline" />
                    </Pressable>
                  ))}
                </View>
              ) : (
                <EmptyState
                  compact
                  icon="shirt-outline"
                  title={t("profile.page.closet.empty")}
                  actionLabel={t("profile.page.closet.action")}
                  actionIcon="add"
                  onAction={() => router.push("/(tabs)/wardrobe")}
                />
              )
            ) : null}

            {tab === "looks" ? (
              data.looks.length ? (
                <View style={styles.list}>
                  {data.looks.map((look) => (
                    <Pressable
                      key={look.id}
                      onPress={() => router.push(`/outfit/${look.id}`)}
                      style={({ pressed }) => [styles.lookRow, pressed && styles.pressed]}
                    >
                      <View style={styles.lookThumb}>
                        {look.result_url ? (
                          <SmartImage source={look.result_url} style={StyleSheet.absoluteFill} />
                        ) : (
                          <Ionicons name="layers-outline" size={20} color={theme.colors.textMuted} />
                        )}
                      </View>
                      <View style={styles.lookBody}>
                        <Text style={styles.lookName} numberOfLines={1}>
                          {look.name?.trim() || t("profile.page.looks.untitled")}
                        </Text>
                        <Text style={styles.muted} numberOfLines={1}>
                          {[
                            look.occasion ? tl("occasion", look.occasion) : null,
                            t("profile.page.looks.pieces", { count: look.clothing_ids.length }),
                            new Date(look.created_at).toLocaleDateString(locale, { month: "short", day: "numeric" }),
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                    </Pressable>
                  ))}
                </View>
              ) : (
                <EmptyState
                  compact
                  icon="layers-outline"
                  title={t("profile.page.looks.empty")}
                  actionLabel={t("profile.page.looks.action")}
                  actionIcon="add"
                  onAction={() => router.push({ pathname: "/(tabs)/wardrobe", params: { section: "outfits" } })}
                />
              )
            ) : null}

            {tab === "posts" ? (
              data.posts.length ? (
                <View style={styles.list}>
                  {data.posts.map((post) => (
                    <View key={post.id} style={styles.post}>
                      {post.image_urls[0] ? (
                        <SmartImage source={post.image_urls[0]} style={styles.postImage} />
                      ) : null}
                      <View style={styles.postBody}>
                        {post.title ? <Text style={styles.lookName}>{post.title}</Text> : null}
                        {post.caption ? <Text style={styles.postCaption}>{post.caption}</Text> : null}
                        <Text style={styles.muted}>
                          {t("profile.page.posts.stats", { likes: post.like_count, comments: post.comment_count })}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <EmptyState
                  compact
                  icon="people-outline"
                  title={t("profile.page.posts.empty")}
                  actionLabel={t("profile.page.posts.action")}
                  actionIcon="cloud-upload-outline"
                  onAction={() => router.push("/(tabs)/community")}
                />
              )
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <BioEditor
        visible={editingBio}
        initial={bio}
        onClose={() => setEditingBio(false)}
        onSaved={(next) => {
          setData((d) => (d ? { ...d, profile: { ...d.profile, bio: next } } : d));
          setEditingBio(false);
        }}
      />
    </View>
  );
}

function Stat({ value, label }: { value: number | undefined; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value ?? "–"}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** Bottom sheet for writing the bio; saves through PATCH /api/profile. */
function BioEditor({
  visible,
  initial,
  onClose,
  onSaved,
}: {
  visible: boolean;
  initial: string;
  onClose: () => void;
  onSaved: (bio: string | null) => void;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);

  // Start from the saved bio each time the sheet opens (adjusting state while
  // rendering, the React-recommended alternative to a syncing effect).
  const [openedFor, setOpenedFor] = useState<boolean>(false);
  if (visible !== openedFor) {
    setOpenedFor(visible);
    if (visible) setText(initial);
  }

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const profile = await updateProfile({ bio: text.trim() || null });
      toast.success(t("profile.page.bio.saved"), "");
      onSaved(profile.bio ?? null);
    } catch (e) {
      toast.error(t("profile.page.bio.save_failed"), e instanceof Error ? e.message : "");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      busy={saving}
      icon="create"
      title={t("profile.page.bio.title")}
      footer={
        <View style={styles.sheetActions}>
          <AppButton
            label={t("profile.page.bio.cancel")}
            variant="secondary"
            size="md"
            onPress={onClose}
            disabled={saving}
            style={styles.sheetBtn}
          />
          <AppButton
            label={t("profile.page.bio.save")}
            size="md"
            onPress={save}
            loading={saving}
            style={styles.sheetBtn}
          />
        </View>
      }
    >
      <TextInput
        value={text}
        onChangeText={setText}
        maxLength={BIO_MAX}
        multiline
        autoFocus
        placeholder={t("profile.page.bio.placeholder")}
        placeholderTextColor={theme.colors.textMuted}
        style={styles.bioInput}
      />
      <Text style={styles.counter}>
        {text.length}/{BIO_MAX}
      </Text>
    </Sheet>
  );
}

const GRID_GAP = 3;

const useStyles = makeStyles((theme: Theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  pressed: { opacity: 0.7 },

  cover: {
    backgroundColor: theme.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    overflow: "hidden",
  },
  // Bottom-right, clear of the avatar that overlaps the cover's left edge.
  coverBtn: {
    position: "absolute",
    right: theme.spacing.md,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  coverBtnText: { fontSize: 13, fontWeight: "600", color: theme.colors.text },

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
  joined: { fontSize: 13, color: theme.colors.textMuted },
  bioRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 6 },
  bio: { flex: 1, fontSize: 15, lineHeight: 22, color: theme.colors.text },
  bioEmpty: { flex: 1, fontSize: 14.5, lineHeight: 21, color: theme.colors.textMuted },

  stats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    marginBottom: 14,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { fontSize: 19, fontWeight: "700", color: theme.colors.text },
  statLabel: { fontSize: 12, color: theme.colors.textMuted },
  statRule: { width: StyleSheet.hairlineWidth, alignSelf: "stretch", backgroundColor: theme.colors.border },

  card: {
    marginTop: 20,
    marginHorizontal: theme.spacing.md,
    padding: 16,
    gap: 12,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  cardTitle: { fontSize: 17, fontWeight: "700", color: theme.colors.text },
  introRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  introText: { flex: 1, fontSize: 14, lineHeight: 20, color: theme.colors.text },
  introLabel: { fontWeight: "600" },
  muted: { fontSize: 13, lineHeight: 19, color: theme.colors.textMuted },

  tabs: {
    flexDirection: "row",
    marginTop: 24,
    marginHorizontal: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: theme.colors.text },
  tabText: { fontSize: 14, fontWeight: "600", color: theme.colors.textMuted },
  tabTextActive: { color: theme.colors.text, fontWeight: "700" },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP,
    marginTop: GRID_GAP,
    paddingHorizontal: theme.spacing.md,
  },
  gridCell: {
    width: `${(100 - 2) / 3}%`,
    aspectRatio: 3 / 4,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceAlt,
  },
  gridImage: { flex: 1 },

  list: { paddingHorizontal: theme.spacing.md, paddingTop: 8 },
  lookRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  lookThumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceAlt,
  },
  lookBody: { flex: 1, minWidth: 0, gap: 2 },
  lookName: { fontSize: 15, fontWeight: "600", color: theme.colors.text },

  post: {
    marginTop: 12,
    borderRadius: theme.borderRadius.md,
    overflow: "hidden",
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  postImage: { width: "100%", aspectRatio: 4 / 5, backgroundColor: theme.colors.surfaceAlt },
  postBody: { padding: 12, gap: 4 },
  postCaption: { fontSize: 14, lineHeight: 20, color: theme.colors.text },

  bioInput: {
    minHeight: 96,
    padding: 12,
    fontSize: 15,
    lineHeight: 21,
    textAlignVertical: "top",
    color: theme.colors.text,
    borderRadius: theme.borderRadius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  counter: { alignSelf: "flex-end", fontSize: 12, color: theme.colors.textMuted },
  sheetActions: { flexDirection: "row", gap: 10 },
  sheetBtn: { flex: 1 },
}));
