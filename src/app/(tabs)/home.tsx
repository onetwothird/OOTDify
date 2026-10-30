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
import { LogOutSheet } from "../../features/profile/LogOutSheet";
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
import { EmptyState } from "../../shared/components/StateViews";
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
import { useHideOnScroll, useTabBarSpace } from "../../shared/navigation/useTabChrome";


export default function HomeScreen() {
  // The tab bar slides away while scrolling down; content clears it at the end.
  const hideOnScroll = useHideOnScroll();
  const tabBarSpace = useTabBarSpace();
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
  const [logOutOpen, setLogOutOpen] = useState(false);
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
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabBarSpace }]}
        showsVerticalScrollIndicator={false}
        {...hideOnScroll}
      >
        <HomeTopBar
          nickname={nickname}
          avatarRef={avatarRef}
          loading={greetingLoading}
          onOpenProfile={() => setPhotoSheetOpen(true)}
        />

        <Hero pieceCount={closet.length} lookCount={saved.length} loading={closetLoading || savedLoading} />

        <TodayLookCard
          plan={todayPlan}
          outfit={saved.find((o) => o.id === todayPlan?.outfit_id)}
          loading={planLoading}
          error={planError}
          onOpenOutfit={(id) => router.push(`/outfit/${id}`)}
          onPlanLook={() => router.push({ pathname: "/(tabs)/wardrobe", params: { section: "outfits", view: "calendar" } })}
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
              <EmptyState
                compact
                icon="sparkles-outline"
                title={t("home.recommended.empty.title")}
                message={t("home.recommended.empty")}
                actionLabel={t("home.action.capture")}
                actionIcon="camera-outline"
                onAction={openCapture}
              />
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
              onAction={() => router.push("/(tabs)/wardrobe")}
            />
            {closetLoading && closet.length === 0 ? (
              <View style={styles.hRow}>
                {[0, 1, 2].map((i) => <Skeleton key={i} width={110} height={140} radius={theme.borderRadius.md} />)}
              </View>
            ) : closet.length === 0 ? (
              <EmptyState
                compact
                icon="shirt-outline"
                title={t("home.wardrobe.empty.title")}
                message={t("home.wardrobe.empty.message")}
                actionLabel={t("home.wardrobe.empty.button")}
                actionIcon="camera-outline"
                onAction={openCapture}
              />
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
              onAction={() => router.push({ pathname: "/(tabs)/wardrobe", params: { section: "outfits" } })}
            />
            {savedLoading ? (
              <SkeletonRow />
            ) : saved.length === 0 ? (
              <EmptyState
                compact
                icon="layers-outline"
                title={t("home.looks.recent.empty.title")}
                message={t("home.looks.recent.empty")}
                actionLabel={t("home.looks.recent.empty.action")}
                actionIcon="add"
                onAction={() => router.push({ pathname: "/(tabs)/wardrobe", params: { section: "outfits" } })}
              />
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
        onClose={() => setPhotoSheetOpen(false)}
        onSignOut={() => setLogOutOpen(true)}
      />
      <LogOutSheet visible={logOutOpen} onClose={() => setLogOutOpen(false)} />
    </View>
  );
}

function greetingFor(hour: number, t: any): string {
  if (hour < 12) return t("home.greeting.morning");
  if (hour < 17) return t("home.greeting.afternoon");
  return t("home.greeting.evening");
}

/**
 * Home header. OOTD is the outfit of the *day*, so the header opens with
 * today's date on the app's hang tag, then the greeting and where you are,
 * with your photo on the right.
 */
function HomeTopBar({
  nickname,
  avatarRef,
  loading,
  onOpenProfile,
}: {
  nickname: string | null;
  avatarRef: string | null;
  loading: boolean;
  onOpenProfile: () => void;
}) {
  const { t, locale } = useT();
  const theme = useAppTheme();
  const styles = useStyles();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const greeting = greetingFor(now.getHours(), t);
  const initial = (nickname?.[0] ?? "").toUpperCase();
  // One line at every width: the size steps with the screen, and anything
  // still too long shrinks a little instead of wrapping. Only the first word of
  // an older, longer display name is used.
  const { width } = useWindowDimensions();
  const greetingSize = width < 360 ? 21 : width >= 430 ? 25 : 23;
  const shortName = nickname?.trim().split(/\s+/)[0] ?? null;
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

  const day = now.toLocaleDateString(locale, { day: "numeric" });
  const month = now.toLocaleDateString(locale, { month: "short" }).replace(".", "");
  const fullDate = now.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" });

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
      <View style={styles.topRow}>
        <View style={styles.dateTag} accessible accessibilityLabel={fullDate}>
          <View style={styles.dateTagHole} />
          <Text style={styles.dateDay}>{day}</Text>
          <Text style={styles.dateMonth}>{month}</Text>
        </View>

        <View style={styles.greetingBody}>
          <Text
            style={[styles.greetingTitle, { fontSize: greetingSize, lineHeight: Math.round(greetingSize * 1.22) }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            accessibilityRole="header"
          >
            {shortName ? `${greeting}, ${shortName}` : loading ? "…" : greeting}
          </Text>
          <Pressable
            onPress={place.status === "blocked" ? place.request : undefined}
            disabled={place.status !== "blocked"}
            style={styles.greetingPlaceRow}
            hitSlop={6}
          >
            <Ionicons
              name={place.status === "blocked" ? "location-outline" : "location"}
              size={13}
              color={theme.colors.textMuted}
            />
            <Text style={styles.greetingPlace} numberOfLines={1}>
              {place.status === "loading"
                ? t("home.location.finding")
                : place.status === "ready"
                  ? place.label
                  : t("home.location.off")}
            </Text>
          </Pressable>
        </View>

        {/* A denim ring with a thin gap, so the photo reads as yours and tappable. */}
        <View style={styles.avatarRing}>
          <ProfileAvatar size={42} initial={initial} avatarRef={avatarRef} onPress={onOpenProfile} />
        </View>
      </View>
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

  // Penggi's lines: a hello first, then small talk alternating with styling
  // tips, looping (the hello is only said once).
  const DIALOGUE: { text: string; tip: boolean }[] = [
    { text: t("home.hero.dialogue.welcome"), tip: false },
    { text: t("home.hero.dialogue.chat1"), tip: false },
    { text: t("home.hero.dialogue.tip1"), tip: true },
    { text: t("home.hero.dialogue.chat2"), tip: false },
    { text: t("home.hero.dialogue.tip2"), tip: true },
    { text: t("home.hero.dialogue.chat3"), tip: false },
    { text: t("home.hero.dialogue.tip3"), tip: true },
    { text: t("home.hero.dialogue.chat4"), tip: false },
    { text: t("home.hero.dialogue.tip4"), tip: true },
    { text: t("home.hero.dialogue.chat5"), tip: false },
  ];

  const [tipIndex, setTipIndex] = useState(0);
  const [typed, setTyped] = useState(0);
  const line = DIALOGUE[tipIndex];
  const tip = line.text;

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
      <Text style={styles.heroTitle}>{t("home.hero.title")}</Text>
      <Text style={styles.heroText}>{t("home.hero.description")}</Text>

      <View style={styles.heroStats}>
        <StatCell
          value={loading ? "–" : String(pieceCount)}
          label={t("home.hero.pieces", { count: pieceCount })}
          onPress={() => router.push("/(tabs)/wardrobe")}
        />
        <View style={styles.heroStatDivider} />
        <StatCell
          value={loading ? "–" : String(lookCount)}
          label={t("home.hero.looks", { count: lookCount })}
          onPress={() => router.push({ pathname: "/(tabs)/wardrobe", params: { section: "outfits" } })}
        />
      </View>

      <View style={styles.heroButtons}>
        <AppButton label={t("home.hero.btn.create")} icon="shirt-outline" onPress={() => router.push("/ai-picker")} style={styles.heroBtn} />
        <AppButton label={t("home.hero.btn.try")} icon="sparkles-outline" variant="secondary" onPress={() => router.push("/(tabs)/scan")} style={styles.heroBtn} />
      </View>

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
          accessibilityLabel={t("home.hero.dialogue.a11y", { text: tip })}
          onPress={() => {
            setTyped(0);
            setTipIndex((i) => (i + 1 >= DIALOGUE.length ? 1 : i + 1));
          }}
          style={({ pressed }) => [styles.bubbleWrap, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.bubbleTail} pointerEvents="none" />
          <View style={styles.bubble}>
            <View style={styles.bubbleHead}>
              <Text style={styles.bubbleName}>{t("home.hero.badge")}</Text>
              {line.tip ? (
                <View style={styles.bubbleTipPill}>
                  <Ionicons name="bulb-outline" size={11} color={theme.colors.onPrimary} />
                  <Text style={styles.bubbleTipText}>{t("home.hero.dialogue.label")}</Text>
                </View>
              ) : null}
              <View style={styles.bubbleSpacer} />
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

function StatCell({ value, label, onPress }: { value: string; label: string; onPress: () => void }) {
  const styles = useStyles();
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${value} ${label}`}
      onPress={onPress}
      style={({ pressed }) => [styles.statCell, pressed && { opacity: 0.7 }]}
    >
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={14} color={theme.colors.textMuted} />
    </Pressable>
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
  topBar: { marginTop: theme.spacing.sm, marginBottom: theme.spacing.xs },
  topRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  // Today's hang tag: squared top, rounded bottom, punched hole — the same
  // silhouette as ScreenHeader's, carrying the date instead of an icon.
  dateTag: {
    width: 54,
    height: 66,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 8,
    transform: [{ rotate: "-4deg" }],
  },
  dateTagHole: {
    position: "absolute",
    top: 7,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.colors.background,
  },
  dateDay: { fontSize: 24, lineHeight: 26, fontWeight: "700", letterSpacing: -0.8, color: theme.colors.onPrimary },
  dateMonth: { fontSize: 12, lineHeight: 14, fontWeight: "600", color: theme.colors.onPrimaryMuted },
  greetingBody: { flex: 1, minWidth: 0 },
  greetingTitle: { fontWeight: "700", letterSpacing: -0.5, color: theme.colors.text },
  avatarRing: {
    padding: 2,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: theme.colors.brand,
    backgroundColor: theme.colors.background,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  greetingPlaceRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  greetingPlace: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 17, fontWeight: "600", color: theme.colors.textMuted },

  bubbleWrap: { flex: 1, minWidth: 0 },
  bubbleTail: { position: "absolute", left: -7, top: 24, width: 14, height: 14, backgroundColor: theme.colors.surface, borderLeftWidth: 1.5, borderBottomWidth: 1.5, borderColor: theme.colors.text, transform: [{ rotate: "45deg" }] },
  bubble: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md, borderWidth: 1.5, borderColor: theme.colors.text, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12 },
  bubbleHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  // Penggi's name, like a sender name in a chat.
  bubbleName: { fontSize: 13, fontWeight: "700", color: theme.colors.brand },
  bubbleTipPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.primary,
  },
  bubbleTipText: { fontSize: 11, fontWeight: "600", color: theme.colors.onPrimary },
  bubbleSpacer: { flex: 1 },
  bubbleText: { fontSize: 12.5, lineHeight: 18, fontWeight: "600", color: theme.colors.text, minHeight: 54 },
  bubbleCaret: { color: theme.colors.text, fontWeight: "600" },
  hero: { backgroundColor: theme.colors.surface, borderRadius: 28, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, padding: 20, marginTop: theme.spacing.sm, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.07, shadowRadius: 22, elevation: 4 },
  heroTitle: { fontSize: 30, lineHeight: 34, fontWeight: "700", letterSpacing: -0.8, color: theme.colors.text },
  heroText: { fontSize: 14, lineHeight: 20, color: theme.colors.textMuted, marginTop: 8, maxWidth: 420 },

  heroStats: { flexDirection: "row", alignItems: "stretch", marginTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
  heroStatDivider: { width: StyleSheet.hairlineWidth, marginVertical: 10, backgroundColor: theme.colors.border },
  statCell: { flex: 1, flexDirection: "row", alignItems: "baseline", gap: 6, paddingVertical: 12, paddingHorizontal: 4 },
  statValue: { fontSize: 26, lineHeight: 30, fontWeight: "700", letterSpacing: -0.8, color: theme.colors.text },
  statLabel: { flex: 1, fontSize: 13.5, fontWeight: "600", color: theme.colors.textMuted },
  heroStageBlob: { position: "absolute", bottom: 0, borderRadius: 999, backgroundColor: theme.colors.textFaint },
  heroSpeak: { flexDirection: "row", alignItems: "center", marginTop: 18 },
  heroButtons: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  heroBtn: { flexGrow: 1, flexShrink: 1, flexBasis: 150, minWidth: 130 },
  heroBtnAlt: { backgroundColor: theme.colors.primaryMuted },
  heroMascot: { position: "absolute" },
  chips: { gap: 8, paddingRight: 16, paddingBottom: 4 },
  chipsSpacer: { height: 4 },
  segment: { flexDirection: "row", backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.borderRadius.pill, padding: 4, gap: 4, marginTop: theme.spacing.md, marginBottom: theme.spacing.xs },
  segmentBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 9, borderRadius: theme.borderRadius.pill },
  segmentBtnActive: { backgroundColor: theme.colors.primary },
  segmentText: { fontSize: 13, fontWeight: "600", color: theme.colors.textMuted },
  segmentTextActive: { color: theme.colors.onPrimary },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "flex-start" },
  hRow: { flexDirection: "row", gap: 12 },
  tileRow: { gap: 12, paddingRight: 16 },
  tile: { width: 108 },
  tileImage: { width: 108, height: 128, borderRadius: theme.borderRadius.md, backgroundColor: theme.colors.surfaceAlt },
  tilePlaceholder: { alignItems: "center", justifyContent: "center" },
  tileName: { fontSize: 13, fontWeight: "600", color: theme.colors.text, marginTop: 6 },
  tileMeta: { fontSize: 11, color: theme.colors.textMuted, marginTop: 1 },
  savedList: { gap: 10 },
  savedRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, padding: 12 },
  savedIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
  savedBody: { flex: 1, minWidth: 0 },
  savedName: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
  savedMeta: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2 },
  unavailable: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.borderRadius.md, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  unavailableBody: { flex: 1, minWidth: 0 },
  unavailableTitle: { fontSize: 13, fontWeight: "700", color: theme.colors.text },
  unavailableText: { fontSize: 12, color: theme.colors.textMuted, lineHeight: 17, marginTop: 2 },
  unavailableRetry: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.borderRadius.sm, backgroundColor: theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  unavailableRetryText: { fontSize: 12, fontWeight: "600", color: theme.colors.text }
}));