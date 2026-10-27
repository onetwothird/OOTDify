// C:\OOTDify\src\app\(tabs)\home.tsx
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  fetchSavedOutfits,
  SavedOutfit,
} from "../../features/clothing/service";
import { CatalogItem, OCCASIONS } from "../../features/clothing/types";
import { TodayLookCard } from "../../features/outfit/components/TodayLookCard";
import { fetchOutfitPlans, OutfitPlan, toISODate } from "../../features/outfit/planner";
import { ProfileAvatar } from "../../features/profile/ProfileAvatar";
import { ProfilePhotoSheet } from "../../features/profile/ProfilePhotoSheet";
import { useAvatarStore } from "../../features/profile/avatarStore";
import { applyPendingAvatar } from "../../features/profile/avatar";
import { isOnboardingPending } from "../../features/profile/onboarding";
import { useWardrobeStore } from "../../features/wardrobe/store";
import { AppButton } from "../../shared/components/AppButton";
import { Chip } from "../../shared/components/Chip";
import { ClothingCard } from "../../shared/components/ClothingCard";
import { SkeletonGrid, SkeletonRow } from "../../shared/components/LoadingState";
import { Mascot } from "../../shared/components/Mascot";
import { SectionHeader } from "../../shared/components/SectionHeader";
import { Skeleton } from "../../shared/components/Skeleton";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { makeStyles } from "../../shared/theme/makeStyles";
import type { Theme } from "../../shared/config/theme";
import { useResponsiveColumns } from "../../shared/hooks/useResponsiveColumns";
import { useCurrentPlace } from "../../shared/lib/location";
import { resolveMediaUrl } from "../../shared/lib/storageUrl";
import { useCaptureModalStore } from "../../features/capture/captureModalStore";
import { pieceHref } from "../../features/clothing/pieces";
import { ApiError, getProfile, recommendCatalog } from "../../services/aiApi";
import { useT } from "../../shared/i18n/useT";


export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { itemWidth, onLayout } = useResponsiveColumns(120, 12);
  const { t, tl } = useT();
  const theme = useAppTheme();
  const styles = useStyles();

  const [occasion, setOccasion] = useState<string>("Casual");
  const [recommended, setRecommended] = useState<CatalogItem[]>([]);
  const [recLoading, setRecLoading] = useState(true);
  const [recError, setRecError] = useState<ApiError | null>(null);


  const closet = useWardrobeStore((s) => s.items);
  const closetLoading = useWardrobeStore((s) => s.loading);
  const [saved, setSaved] = useState<SavedOutfit[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);

  const [homeTab, setHomeTab] = useState<"discover" | "wardrobe" | "looks">("discover");
  const [todayPlan, setTodayPlan] = useState<OutfitPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [planError, setPlanError] = useState<string | null>(null);

  const [nickname, setNickname] = useState<string | null>(null);
  const avatarRef = useAvatarStore((s) => s.ref);
  const setAvatarRef = useAvatarStore((s) => s.setRef);
  const [greetingLoading, setGreetingLoading] = useState(true);
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);
  const onboardingChecked = useRef(false);

  const fetchRecommendations = useCallback(async (occ: string) => {
    try {
      const { recommendations } = await recommendCatalog({ occasion: occ, limit: 8 });
      setRecommended(recommendations);
    } catch (e) {
      setRecError(
        e instanceof ApiError
          ? e
          : new ApiError("unknown", t("home.error.unknown"), 0, e),
      );
    } finally {
      setRecLoading(false);
    }
  }, [t]);

  const loadRecommendations = useCallback(async (occ: string) => {
    setRecLoading(true);
    setRecError(null);
    await fetchRecommendations(occ);
  }, [fetchRecommendations]);

  const loadStatic = useCallback(async () => {
    setSavedLoading(true);
    try {
      setSaved(await fetchSavedOutfits());
    } catch {
      // Ignored
    } finally {
      setSavedLoading(false);
    }
    void useWardrobeStore.getState().loadFromServer().catch(() => {});
  }, []);

  const loadTodayPlan = useCallback(async () => {
    const todayISO = toISODate(new Date());
    try {
      const rows = await fetchOutfitPlans(todayISO, todayISO);
      setTodayPlan(rows[0] ?? null);
      setPlanError(null);
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : t("home.error.plan"));
    } finally {
      setPlanLoading(false);
    }
  }, [t]);

  const loadGreeting = useCallback(async () => {
    setGreetingLoading(true);
    try {
      const { profile, email } = await getProfile();
      const name =
        profile.first_name?.trim() ||
        profile.display_name?.trim() ||
        email?.split("@")[0]?.trim() ||
        null;
      setNickname(name);
      setAvatarRef(profile.avatar_url ?? null);

      const applied = await applyPendingAvatar();
      if (applied) setAvatarRef(applied);

      if (!onboardingChecked.current) {
        onboardingChecked.current = true;
        if (await isOnboardingPending(email)) {
          router.replace("/onboarding");
          return;
        }
      }
    } catch {
      setNickname(null);
    } finally {
      setGreetingLoading(false);
    }
  }, [setAvatarRef, router]);

  const [prevOccasion, setPrevOccasion] = useState(occasion);
  if (prevOccasion !== occasion) {
    setPrevOccasion(occasion);
    setRecLoading(true);
    setRecError(null);
  }

  useEffect(() => {
    Promise.resolve().then(() => fetchRecommendations(occasion)).catch(() => {});
  }, [occasion, fetchRecommendations]);


  useFocusEffect(
    useCallback(() => {
      void loadStatic();
      void loadTodayPlan();
      void loadGreeting();
    }, [loadStatic, loadTodayPlan, loadGreeting]),
  );

  // Recommendations are the user's own closet items.
  const openItem = useCallback(
    (item: CatalogItem) => router.push(pieceHref({ id: item.id, source: "closet" })),
    [router],
  );
  const openCapture = useCaptureModalStore((s) => s.open);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <HomeTopBar
          nickname={nickname}
          avatarRef={avatarRef}
          loading={greetingLoading}
          onOpenProfile={() => setPhotoSheetOpen(true)}
          onOpenSettings={() => router.push("/settings/general")}
        />

        <Hero pieceCount={closet.length} lookCount={saved.length} loading={closetLoading || savedLoading} />

        <TodayLookCard
          plan={todayPlan}
          outfit={saved.find((o) => o.id === todayPlan?.outfit_id)}
          loading={planLoading}
          error={planError}
          onOpenOutfit={(id) => router.push(`/outfit/${id}`)}
          onPlanLook={() => router.push({ pathname: "/(tabs)/outfits", params: { view: "calendar" } })}
        />

        <View style={styles.segment}>
          {(
            [
              ["discover", t("home.tab.discover")],
              ["wardrobe", t("home.tab.wardrobe")],
              ["looks", t("home.tab.looks")],
            ] as const
          ).map(([key, label]) => (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: homeTab === key }}
              onPress={() => setHomeTab(key)}
              style={[styles.segmentBtn, homeTab === key && styles.segmentBtnActive]}
            >
              <Text style={[styles.segmentText, homeTab === key && styles.segmentTextActive]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {homeTab === "discover" ? (
          <>
            <SectionHeader
              title={t("home.recommended.title")}
              subtitle={t("home.recommended.subtitle", { occasion: tl("occasion", occasion) })}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {OCCASIONS.map((occ) => (
                <Chip key={occ} label={tl("occasion", occ)} active={occ === occasion} onPress={() => setOccasion(occ)} />
              ))}
            </ScrollView>
            <View style={styles.chipsSpacer} />

            {recLoading ? (
              <SkeletonGrid />
            ) : recError ? (
              <View style={styles.unavailable}>
                <Ionicons name="cloud-offline-outline" size={20} color={theme.colors.accent} />
                <View style={styles.unavailableBody}>
                  <Text style={styles.unavailableTitle}>{t("home.error.ai_unavailable")}</Text>
                  <Text style={styles.unavailableText}>{recError.message} {t("home.error.ai_instruction")}</Text>
                </View>
                <Pressable onPress={() => void loadRecommendations(occasion)} style={styles.unavailableRetry}>
                  <Text style={styles.unavailableRetryText}>{t("home.action.retry")}</Text>
                </Pressable>
              </View>
            ) : recommended.length === 0 ? (
              <View style={styles.emptyCloset}>
                <Text style={styles.emptyLine}>{t("home.recommended.empty")}</Text>
                <Pressable accessibilityRole="button" style={styles.captureBtn} onPress={openCapture}>
                  <Ionicons name="camera-outline" size={16} color={theme.colors.onPrimary} />
                  <Text style={styles.captureBtnText}>{t("home.action.capture")}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.grid} onLayout={onLayout}>
                {recommended.map((item) => (
                  <ClothingCard key={item.id} item={item} width={itemWidth} onPress={() => openItem(item)} />
                ))}
              </View>
            )}

          </>
        ) : homeTab === "wardrobe" ? (
          <>
            <SectionHeader
              title={t("home.wardrobe.title")}
              subtitle={t("home.wardrobe.subtitle")}
              actionLabel={t("home.action.open")}
              onAction={() => router.push("/(tabs)/discover")}
            />
            {closetLoading && closet.length === 0 ? (
              <View style={styles.hRow}>
                {[0, 1, 2].map((i) => <Skeleton key={i} width={110} height={140} radius={theme.borderRadius.md} />)}
              </View>
            ) : closet.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyTop}>
                  <View style={styles.emptyIconTile}>
                    <Ionicons name="shirt-outline" size={22} color={theme.colors.text} />
                  </View>
                  <View style={styles.emptyBody}>
                    <Text style={styles.emptyTitle}>{t("home.wardrobe.empty.title")}</Text>
                    <Text style={styles.emptyText}>{t("home.wardrobe.empty.message")}</Text>
                  </View>
                </View>
                <AppButton label={t("home.wardrobe.empty.button")} size="md" icon="add" onPress={() => router.push("/(tabs)/discover")} style={styles.emptyBtn} />
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tileRow}>
                {closet.slice(0, 8).map((item) => (
                  <WardrobeTile
                    key={item.id}
                    id={item.id}
                    imageRef={item.image_url}
                    name={item.name || item.category || "Item"}
                    category={item.category ?? ""}
                    onPress={() => router.push(`/item/${item.id}`)}
                  />
                ))}
              </ScrollView>
            )}
          </>
        ) : (
          <>
            <SectionHeader
              title={t("home.looks.recent.title")}
              subtitle={t("home.looks.recent.subtitle")}
              actionLabel={t("home.action.all")}
              onAction={() => router.push("/(tabs)/outfits")}
            />
            {savedLoading ? (
              <SkeletonRow />
            ) : saved.length === 0 ? (
              <Text style={styles.emptyLine}>{t("home.looks.recent.empty")}</Text>
            ) : (
              <View style={styles.savedList}>
                {saved.slice(0, 4).map((o) => (
                  <SavedLookRow key={o.id} outfit={o} onPress={() => router.push(`/outfit/${o.id}`)} />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <ProfilePhotoSheet
        visible={photoSheetOpen}
        initial={(nickname?.[0] ?? "").toUpperCase()}
        avatarRef={avatarRef}
        onChanged={setAvatarRef}
        onOpenProfile={() => router.push("/(tabs)/profile")}
        onClose={() => setPhotoSheetOpen(false)}
      />
    </View>
  );
}

function greetingFor(hour: number, t: any): string {
  if (hour < 12) return t("home.greeting.morning");
  if (hour < 17) return t("home.greeting.afternoon");
  return t("home.greeting.evening");
}

function HomeTopBar({
  nickname,
  avatarRef,
  loading,
  onOpenProfile,
  onOpenSettings,
}: {
  nickname: string | null;
  avatarRef: string | null;
  loading: boolean;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
}) {
  const { t } = useT();
  const theme = useAppTheme();
  const styles = useStyles();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  
  const greeting = greetingFor(now.getHours(), t);
  const initial = (nickname?.[0] ?? "").toUpperCase();
  const place = useCurrentPlace();
  const [enter] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const entrance = Animated.timing(enter, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    entrance.start();
    return () => entrance.stop();
  }, [enter]);

  return (
    <Animated.View
      style={[
        styles.topBar,
        {
          opacity: enter,
          transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        },
      ]}
    >
      <View style={styles.greetingBody}>
        <Text style={styles.greetingTitle} numberOfLines={1}>
          {nickname ? `${greeting}, ${nickname}!` : loading ? "…" : `${greeting}!`}
        </Text>
        <Pressable
          onPress={place.status === "blocked" ? place.request : undefined}
          disabled={place.status !== "blocked"}
          style={styles.greetingPlaceRow}
          hitSlop={6}
        >
          <Ionicons name={place.status === "blocked" ? "location-outline" : "location"} size={12} color={theme.colors.textMuted} />
          <Text style={styles.greetingPlace} numberOfLines={1}>
            {place.status === "loading"
              ? t("home.location.finding")
              : place.status === "ready"
                ? place.label
                : t("home.location.off")}
          </Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("home.settings_a11y")}
        hitSlop={6}
        onPress={onOpenSettings}
        style={({ pressed }) => [styles.settingsBtn, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="settings-outline" size={20} color={theme.colors.text} />
      </Pressable>
      <ProfileAvatar size={40} initial={initial} avatarRef={avatarRef} onPress={onOpenProfile} />
    </Animated.View>
  );
}

function Hero({ pieceCount, lookCount, loading }: { pieceCount: number; lookCount: number; loading: boolean }) {
  const router = useRouter();
  const { t } = useT();
  const theme = useAppTheme();
  const styles = useStyles();
  const { width } = useWindowDimensions();

  const cardW = Math.max(240, width - theme.spacing.page * 2);
  const mascot = Math.round(Math.min(Math.max(cardW * 0.5, 128), 300));
  const mascotLane = Math.round(mascot * 0.72);

  const DIALOGUE = [
    t("home.hero.dialogue.welcome"),
    t("home.hero.dialogue.tip1"),
    t("home.hero.dialogue.tip2"),
    t("home.hero.dialogue.tip3"),
    t("home.hero.dialogue.tip4"),
  ] as const;

  const [tipIndex, setTipIndex] = useState(0);
  const [typed, setTyped] = useState(0);
  const tip = DIALOGUE[tipIndex];

  useEffect(() => {
    const done = typed >= tip.length;
    const id = setTimeout(
      () => {
        if (done) {
          setTyped(0);
          setTipIndex((i) => (i + 1 >= DIALOGUE.length ? 1 : i + 1));
        } else {
          setTyped((n) => n + 1);
        }
      },
      done ? 3000 : 38,
    );
    return () => clearTimeout(id);
  }, [tip, typed, DIALOGUE.length]);

  const [appear] = useState(() => new Animated.Value(0));
  const [bob] = useState(() => new Animated.Value(0));
  const [caret] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const entrance = Animated.timing(appear, { toValue: 1, duration: 520, delay: 100, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    const bobLoop = Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: 1, duration: 2100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(bob, { toValue: 0, duration: 2100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    const caretLoop = Animated.loop(Animated.sequence([
      Animated.timing(caret, { toValue: 0, duration: 520, useNativeDriver: true }),
      Animated.timing(caret, { toValue: 1, duration: 520, useNativeDriver: true }),
    ]));
    entrance.start();
    bobLoop.start();
    caretLoop.start();
    return () => { entrance.stop(); bobLoop.stop(); caretLoop.stop(); };
  }, [appear, bob, caret]);

  return (
    <View style={styles.hero}>
      <View style={[styles.heroBlob, styles.heroBlobA]} pointerEvents="none" />
      <View style={[styles.heroBlob, styles.heroBlobB]} pointerEvents="none" />

      <View style={styles.heroTop}>
        <View style={styles.heroCopy}>
          <View style={styles.heroPill}>
            <Ionicons name="sparkles" size={11} color={theme.colors.text} />
            <Text style={styles.heroPillText}>{t("home.hero.badge")}</Text>
          </View>
          <Text style={styles.heroTitle}>{t("home.hero.title")}</Text>
          <Text style={styles.heroText}>{t("home.hero.description")}</Text>
        </View>

        <View style={styles.heroStats}>
          <StatCell icon="shirt-outline" value={loading ? "—" : String(pieceCount)} label={t("home.hero.pieces")} />
          <View style={styles.heroStatDivider} />
          <StatCell icon="sparkles-outline" value={loading ? "—" : String(lookCount)} label={t("home.hero.looks")} />
        </View>
      </View>

      <View style={styles.heroButtons}>
        <AppButton label={t("home.hero.btn.create")} icon="shirt-outline" onPress={() => router.push("/ai-picker")} style={styles.heroBtn} />
        <AppButton label={t("home.hero.btn.try")} icon="sparkles-outline" variant="secondary" onPress={() => router.push("/(tabs)/scan")} style={styles.heroBtn} />
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/(tabs)/discover")}
        style={({ pressed }) => [styles.heroLink, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="folder-open-outline" size={15} color={theme.colors.text} />
        <Text style={styles.heroLinkText}>{t("home.hero.link.wardrobe")}</Text>
        <Ionicons name="chevron-forward" size={13} color={theme.colors.textMuted} />
      </Pressable>

      <View style={[styles.heroStageBlob, { width: Math.round(mascot * 1.1), height: Math.round(mascot * 0.2), left: -Math.round(mascot * 0.16) }]} pointerEvents="none" />

      <Animated.View
        pointerEvents="none"
        style={[
          styles.heroMascot,
          {
            width: mascot,
            height: mascot,
            left: -Math.round(mascot * 0.06),
            bottom: -Math.round(mascot * 0.04),
            opacity: appear,
            transform: [
              { translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
              { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) },
            ],
          },
        ]}
      >
        <Mascot size={mascot} />
      </Animated.View>

      <View style={[styles.heroSpeak, { minHeight: Math.round(mascot * 0.9) }]}>
        <View style={{ width: mascotLane }} pointerEvents="none" />
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setTyped(0);
            setTipIndex((i) => (i + 1 >= DIALOGUE.length ? 1 : i + 1));
          }}
          style={({ pressed }) => [styles.bubbleWrap, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.bubbleTail} pointerEvents="none" />
          <View style={styles.bubble}>
            <View style={styles.bubbleHead}>
              <Ionicons name={tipIndex === 0 ? "sparkles" : "bulb-outline"} size={13} color={theme.colors.text} />
              <Text style={styles.bubbleLabel}>{tipIndex === 0 ? t("home.hero.badge").toUpperCase() : t("home.hero.dialogue.label")}</Text>
              <Ionicons name="refresh" size={13} color={theme.colors.textMuted} />
            </View>
            <Text style={styles.bubbleText} numberOfLines={3}>
              {tip.slice(0, typed)}
              <Animated.Text style={[styles.bubbleCaret, { opacity: caret }]}>▍</Animated.Text>
            </Text>
          </View>
          <View style={styles.bubbleTail} pointerEvents="none" />
        </Pressable>
      </View>
    </View>
  );
}

function StatCell({ icon, value, label }: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string }) {
  const styles = useStyles();
  const theme = useAppTheme();
  return (
    <View style={styles.statCell}>
      <View style={styles.statValueRow}>
        <Ionicons name={icon} size={13} color={theme.colors.onPrimaryMuted} />
        <Text style={styles.statValue}>{value}</Text>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function WardrobeTile({ id, imageRef, name, category, onPress }: { id: string; imageRef: string | null; name: string; category: string; onPress: () => void }) {
  const theme = useAppTheme();
  const styles = useStyles();
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    resolveMediaUrl(imageRef, 900).then((u) => { if (alive) setUri(u); });
    return () => { alive = false; };
  }, [imageRef]);

  return (
    <Pressable accessibilityRole="button" key={id} onPress={onPress} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.9 }]}>
      {uri ? (
        <Image source={{ uri }} style={styles.tileImage} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.tileImage, styles.tilePlaceholder]}>
          <Ionicons name="shirt-outline" size={22} color={theme.colors.textMuted} />
        </View>
      )}
      <Text style={styles.tileName} numberOfLines={1}>{name}</Text>
      <Text style={styles.tileMeta} numberOfLines={1}>{category}</Text>
    </Pressable>
  );
}

function SavedLookRow({ outfit, onPress }: { outfit: SavedOutfit; onPress: () => void }) {
  const { t } = useT();
  const theme = useAppTheme();
  const styles = useStyles();
  const count = outfit.clothing_ids?.length ?? 0;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.savedRow, pressed && { opacity: 0.85 }]}>
      <View style={styles.savedIcon}><Ionicons name="sparkles" size={18} color={theme.colors.onPrimary} /></View>
      <View style={styles.savedBody}>
        <Text style={styles.savedName} numberOfLines={1}>
          {outfit.name || (outfit.occasion ? t("home.looks.occasion_look", { occasion: outfit.occasion }) : t("home.looks.untitled"))}
        </Text>
        <Text style={styles.savedMeta} numberOfLines={1}>
          {outfit.occasion ?? t("home.looks.no_occasion")} · {t("home.looks.items", { count })} · {new Date(outfit.created_at).toLocaleDateString()}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
    </Pressable>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingHorizontal: theme.spacing.page, paddingBottom: 40 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: theme.spacing.sm, marginBottom: theme.spacing.xs },
  greetingBody: { flex: 1, minWidth: 0 },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  greetingTitle: { fontSize: 20, lineHeight: 26, fontWeight: "800", letterSpacing: -0.4, color: theme.colors.text },
  greetingPlaceRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  greetingPlace: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 16, fontWeight: "600", color: theme.colors.textMuted },
  bubbleWrap: { flex: 1, minWidth: 0 },
  bubbleTail: { position: "absolute", left: -7, top: 24, width: 14, height: 14, backgroundColor: theme.colors.surface, borderLeftWidth: 1.5, borderBottomWidth: 1.5, borderColor: theme.colors.text, transform: [{ rotate: "45deg" }] },
  bubble: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md, borderWidth: 1.5, borderColor: theme.colors.text, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12 },
  bubbleHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  bubbleLabel: { flex: 1, fontSize: 10, fontWeight: "800", letterSpacing: 1.3, color: theme.colors.textMuted },
  bubbleText: { fontSize: 12.5, lineHeight: 18, fontWeight: "600", color: theme.colors.text, minHeight: 54 },
  bubbleCaret: { color: theme.colors.text, fontWeight: "700" },
  hero: { backgroundColor: theme.colors.surface, borderRadius: 28, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, padding: 20, marginTop: theme.spacing.sm, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.07, shadowRadius: 22, elevation: 4 },
  heroBlob: { position: "absolute", borderRadius: 999, backgroundColor: theme.colors.textFaint },
  heroBlobA: { width: 220, height: 220, top: -110, right: -70 },
  heroBlobB: { width: 150, height: 150, bottom: 30, right: -70, backgroundColor: theme.colors.textFaint },
  heroTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  heroCopy: { flex: 1, minWidth: 0 },
  heroPill: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.borderRadius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  heroPillText: { fontSize: 10.5, fontWeight: "800", letterSpacing: 1.2, color: theme.colors.text },
  heroTitle: { fontSize: 30, lineHeight: 34, fontWeight: "800", letterSpacing: -0.8, color: theme.colors.text, marginTop: 12 },
  heroText: { fontSize: 13.5, lineHeight: 19, color: theme.colors.textMuted, marginTop: 8 },
  heroStats: { backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.md, paddingHorizontal: 12, paddingVertical: 11, gap: 9, minWidth: 88 },
  heroStatDivider: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.onPrimarySubtle },
  statCell: { gap: 1 },
  statValueRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statValue: { fontSize: 17, fontWeight: "800", letterSpacing: -0.4, color: theme.colors.onPrimary },
  statLabel: { fontSize: 9.5, fontWeight: "700", letterSpacing: 0.8, color: theme.colors.onPrimaryMuted },
  heroStageBlob: { position: "absolute", bottom: 0, borderRadius: 999, backgroundColor: theme.colors.textFaint },
  heroSpeak: { flexDirection: "row", alignItems: "center", marginTop: 18 },
  heroButtons: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 18 },
  heroBtn: { flexGrow: 1, flexShrink: 1, flexBasis: 150, minWidth: 130 },
  heroBtnAlt: { backgroundColor: theme.colors.primaryMuted },
  heroLink: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4, marginTop: 12, alignSelf: "flex-start" },
  heroLinkText: { fontSize: 13.5, fontWeight: "700", color: theme.colors.text },
  heroMascot: { position: "absolute" },
  chips: { gap: 8, paddingRight: 16, paddingBottom: 4 },
  chipsSpacer: { height: 4 },
  segment: { flexDirection: "row", backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.borderRadius.pill, padding: 4, gap: 4, marginTop: theme.spacing.md, marginBottom: theme.spacing.xs },
  segmentBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 9, borderRadius: theme.borderRadius.pill },
  segmentBtnActive: { backgroundColor: theme.colors.primary },
  segmentText: { fontSize: 13, fontWeight: "700", color: theme.colors.textMuted },
  segmentTextActive: { color: theme.colors.onPrimary },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "flex-start" },
  hRow: { flexDirection: "row", gap: 12 },
  emptyCard: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, padding: 16, gap: 14 },
  emptyTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  emptyIconTile: { width: 44, height: 44, borderRadius: 14, backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  emptyBody: { flex: 1, minWidth: 0 },
  emptyTitle: { fontSize: 14, fontWeight: "800", color: theme.colors.text },
  emptyText: { fontSize: 12.5, color: theme.colors.textMuted, marginTop: 2, lineHeight: 17 },
  emptyBtn: { alignSelf: "stretch" },
  tileRow: { gap: 12, paddingRight: 16 },
  tile: { width: 108 },
  tileImage: { width: 108, height: 128, borderRadius: theme.borderRadius.md, backgroundColor: theme.colors.surfaceAlt },
  tilePlaceholder: { alignItems: "center", justifyContent: "center" },
  tileName: { fontSize: 13, fontWeight: "700", color: theme.colors.text, marginTop: 6 },
  tileMeta: { fontSize: 11, color: theme.colors.textMuted, marginTop: 1 },
  savedList: { gap: 10 },
  savedRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, padding: 12 },
  savedIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
  savedBody: { flex: 1, minWidth: 0 },
  savedName: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  savedMeta: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2 },
  emptyLine: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 19, paddingVertical: 8 },
  emptyCloset: { gap: 8, alignItems: "flex-start" },
  captureBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  captureBtnText: { color: theme.colors.onPrimary, fontWeight: "700", fontSize: 13 },
  unavailable: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.borderRadius.md, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  unavailableBody: { flex: 1, minWidth: 0 },
  unavailableTitle: { fontSize: 13, fontWeight: "800", color: theme.colors.text },
  unavailableText: { fontSize: 12, color: theme.colors.textMuted, lineHeight: 17, marginTop: 2 },
  unavailableRetry: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.borderRadius.sm, backgroundColor: theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  unavailableRetryText: { fontSize: 12, fontWeight: "700", color: theme.colors.text }
}));