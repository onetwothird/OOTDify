// C:\OOTDIFY\src\app\(tabs)\home.tsx
// Home: "Your wardrobe. Styled by AI." — hero + real-data sections.
//
// Real data only: recommendations and trending come from the catalog/DB, saved
// looks from saved_outfits, wardrobe from clothing_items, recently viewed from
// the user's history. When the Flask backend is down, the recommendations
// section degrades to a friendly banner and the rest of the app keeps working.
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
  fetchCatalog,
  fetchRecentlyViewed,
  fetchSavedOutfits,
  recordRecentlyViewed,
  SavedOutfit,
} from "../../features/clothing/service";
import { CatalogItem, OCCASIONS } from "../../features/clothing/types";
import { TodayLookCard } from "../../features/outfit/components/TodayLookCard";
import { fetchOutfitPlans, OutfitPlan, toISODate } from "../../features/outfit/planner";
import { ProfileAvatar } from "../../features/profile/ProfileAvatar";
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
import { ShareOutfitModal } from "../../features/community/components/ShareOutfitModal";
import { CreateRoomModal } from "../../features/community/components/CreateRoomModal";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { useResponsiveColumns } from "../../shared/hooks/useResponsiveColumns";
import { useCurrentPlace } from "../../shared/lib/location";
import { resolveMediaUrl } from "../../shared/lib/storageUrl";
import { ApiError, getProfile, recommendCatalog } from "../../services/aiApi";

const HORIZONTAL_CARD_W = 150;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { itemWidth, onLayout } = useResponsiveColumns(120, 12);
  const styles = useStyles();
  const theme = useAppTheme();

  // ---- Recommendations (Flask /api/recommend → real catalog ids) -----------
  const [occasion, setOccasion] = useState<string>("Casual");
  const [recommended, setRecommended] = useState<CatalogItem[]>([]);
  const [recLoading, setRecLoading] = useState(true);
  const [recError, setRecError] = useState<ApiError | null>(null);

  // ---- Trending (fresh catalog rows, real DB data) --------------------------
  const [trending, setTrending] = useState<CatalogItem[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [trendingError, setTrendingError] = useState<string | null>(null);

  // ---- Wardrobe / saved / recent (Supabase anon, owner scoped by RLS) ------
  const closet = useWardrobeStore((s) => s.items);
  const closetLoading = useWardrobeStore((s) => s.loading);
  const [saved, setSaved] = useState<SavedOutfit[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [recent, setRecent] = useState<CatalogItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  // Which Home section is visible. The old layout stacked every section in one
  // long scroll; the switcher shows one at a time so the page stays short.
  const [homeTab, setHomeTab] = useState<"discover" | "wardrobe" | "looks">("discover");

  // ---- Today's planned look (public.outfit_plans, owner-only via RLS) ------
  const [todayPlan, setTodayPlan] = useState<OutfitPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [planError, setPlanError] = useState<string | null>(null);

  // ---- Greeting (real profile nickname + avatar; fallbacks are honest) ------
  const [nickname, setNickname] = useState<string | null>(null);
  // The photo lives in a shared store so Profile changes show up here at once.
  const avatarRef = useAvatarStore((s) => s.ref);
  const setAvatarRef = useAvatarStore((s) => s.setRef);
  const [greetingLoading, setGreetingLoading] = useState(true);
  // The onboarding prompt is only considered once per mount (loadGreeting runs
  // on every focus; navigating must not repeat).
  const onboardingChecked = useRef(false);

  // ---------------------------------------------------------------------------
  // Loaders (real endpoints only)
  // ---------------------------------------------------------------------------
  // Core loader — safe to call from effects: no synchronous setState (the
  // loading flag starts true; the spinner/error reset lives in the wrapper).
  // ---------------------------------------------------------------------------
  const fetchRecommendations = useCallback(async (occ: string) => {
    try {
      const { recommendations } = await recommendCatalog({ occasion: occ, limit: 8 });
      setRecommended(recommendations);
    } catch (e) {
      setRecError(e instanceof ApiError ? e : new ApiError("unknown", "Something went wrong. Please try again.", 0, e));
    } finally {
      setRecLoading(false);
    }
  }, []);

  // Handler-facing wrapper: show the spinner and clear the previous error.
  const loadRecommendations = useCallback(
    async (occ: string) => {
      setRecLoading(true);
      setRecError(null);
      await fetchRecommendations(occ);
    },
    [fetchRecommendations],
  );

  const loadTrending = useCallback(async () => {
    // Effect-only (no synchronous setState); state starts as loading.
    try {
      setTrending(await fetchCatalog({ limit: 6 }));
    } catch (e) {
      setTrendingError(e instanceof Error ? e.message : "Could not load trending items.");
    } finally {
      setTrendingLoading(false);
    }
  }, []);

  const loadStatic = useCallback(async () => {
    setSavedLoading(true);
    setRecentLoading(true);
    try {
      const [rows, history] = await Promise.all([
        fetchSavedOutfits(),
        fetchRecentlyViewed(10),
      ]);
      setSaved(rows);
      setRecent(history);
    } catch {
      // Individual sections render their own empty/error states; ignore globally.
    } finally {
      setSavedLoading(false);
      setRecentLoading(false);
    }
    // Wardrobe lives in the shared store; keep it fresh on focus.
    void useWardrobeStore.getState().loadFromServer().catch(() => {});
  }, []);

  // Today's planned look. Kept separate from loadStatic so a failure here is
  // reported honestly instead of looking like an empty day.
  const loadTodayPlan = useCallback(async () => {
    const todayISO = toISODate(new Date());
    try {
      const rows = await fetchOutfitPlans(todayISO, todayISO);
      setTodayPlan(rows[0] ?? null);
      setPlanError(null);
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : "Could not load today's plan.");
    } finally {
      setPlanLoading(false);
    }
  }, []);

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

      // First moment the new account can own its photo: a picture chosen or
      // captured in the signup wizard is uploaded here. It was never uploaded
      // while signed out.
      const applied = await applyPendingAvatar();
      if (applied) setAvatarRef(applied);

      // Post-signup prompt: a fresh account is asked once for its nickname and
      // style preferences. Flag is local + email-tagged; opening the route once
      // per mount keeps a saved/skipped answer from ever looping.
      if (!onboardingChecked.current) {
        onboardingChecked.current = true;
        if (await isOnboardingPending(email)) {
          router.replace("/onboarding");
          return;
        }
      }
    } catch {
      // AI service down / not signed in: fall back to a generic greeting.
      setNickname(null);
    } finally {
      setGreetingLoading(false);
    }
  }, [setAvatarRef, router]);

  // Reset loading/error during render when the occasion changes — React's
  // documented alternative to a synchronous setState inside an effect.
  const [prevOccasion, setPrevOccasion] = useState(occasion);
  if (prevOccasion !== occasion) {
    setPrevOccasion(occasion);
    setRecLoading(true);
    setRecError(null);
  }

  useEffect(() => {
    // Microtask kick-off: keeps setState from running synchronously inside the
    // effect body (cascading renders) — the loader only sets state after await.
    Promise.resolve()
      .then(() => fetchRecommendations(occasion))
      .catch(() => {});
  }, [occasion, fetchRecommendations]);

  useEffect(() => {
    Promise.resolve()
      .then(() => loadTrending())
      .catch(() => {});
  }, [loadTrending]);

  useFocusEffect(
    useCallback(() => {
      // Refresh lightweight lists on every focus so cross-tab changes appear.
      void loadStatic();
      void loadTodayPlan();
      void loadGreeting();
    }, [loadStatic, loadTodayPlan, loadGreeting]),
  );

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const openItem = useCallback(
    (item: CatalogItem) => {
      recordRecentlyViewed(item.id).catch(() => {});
      router.push(`/catalog/${item.id}`);
    },
    [router],
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ------------------------------------------------ Top bar */}
        <HomeTopBar
          nickname={nickname}
          avatarRef={avatarRef}
          loading={greetingLoading}
          onOpenProfile={() => router.push("/(tabs)/profile")}
        />

        {/* ------------------------------------------------ Hero */}
        <Hero
          pieceCount={closet.length}
          lookCount={saved.length}
          loading={closetLoading || savedLoading}
        />

        {/* ------------------------------------------------ Today's planned look */}
        <TodayLookCard
          plan={todayPlan}
          outfit={saved.find((o) => o.id === todayPlan?.outfit_id)}
          loading={planLoading}
          error={planError}
          onOpenOutfit={(id) => router.push(`/outfit/${id}`)}
          onPlanLook={() =>
            router.push({ pathname: "/(tabs)/outfits", params: { view: "calendar" } })
          }
        />

        {/* ------------------------------------------------ Section switcher */}
        <View style={styles.segment}>
          {(
            [
              ["discover", "Discover"],
              ["wardrobe", "Wardrobe"],
              ["looks", "Looks"],
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
            {/* ------------------------------------------------ Recommended looks */}
            <SectionHeader
              title="Recommended for you"
              subtitle={`Real catalog picks for “${occasion}”, scored by the style engine.`}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {OCCASIONS.map((occ) => (
                <Chip
                  key={occ}
                  label={occ}
                  active={occ === occasion}
                  onPress={() => setOccasion(occ)}
                />
              ))}
            </ScrollView>
            <View style={styles.chipsSpacer} />

            {recLoading ? (
              <SkeletonGrid />
            ) : recError ? (
              <View style={styles.unavailable}>
                <Ionicons name="cloud-offline-outline" size={20} color={theme.colors.accent} />
                <View style={styles.unavailableBody}>
                  <Text style={styles.unavailableTitle}>AI styling is temporarily unavailable</Text>
                  <Text style={styles.unavailableText}>
                    {recError.message} Make sure the AI service is running, then try again.
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void loadRecommendations(occasion)}
                  style={styles.unavailableRetry}
                >
                  <Text style={styles.unavailableRetryText}>Retry</Text>
                </Pressable>
              </View>
            ) : recommended.length === 0 ? (
              <Text style={styles.emptyLine}>
                No catalog items for this occasion yet — try another one.
              </Text>
            ) : (
              <View style={styles.grid} onLayout={onLayout}>
                {recommended.map((item) => (
                  <ClothingCard
                    key={item.id}
                    item={item}
                    width={itemWidth}
                    onPress={() => openItem(item)}
                  />
                ))}
              </View>
            )}

            {/* ------------------------------------------------ Trending inspiration */}
            <SectionHeader
              title="Trending inspiration"
              subtitle="Fresh from the catalog."
              actionLabel="Browse"
              onAction={() => router.push("/(tabs)/discover")}
            />
            {trendingLoading ? (
              <SkeletonGrid count={3} />
            ) : trendingError ? (
              <Text style={styles.emptyLine}>{trendingError}</Text>
            ) : trending.length === 0 ? (
              <Text style={styles.emptyLine}>The catalog is being seeded — check back soon.</Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tileRow}
              >
                {trending.map((item) => (
                  <ClothingCard
                    key={item.id}
                    item={item}
                    width={HORIZONTAL_CARD_W}
                    onPress={() => openItem(item)}
                  />
                ))}
              </ScrollView>
            )}
          </>
        ) : homeTab === "wardrobe" ? (
          <>
            {/* ------------------------------------------------ My wardrobe */}
            <SectionHeader
              title="My wardrobe"
              subtitle="Your pieces, stored privately."
              actionLabel="Open"
              onAction={() => router.push("/(tabs)/discover")}
            />
            {closetLoading && closet.length === 0 ? (
              <View style={styles.hRow}>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} width={110} height={140} radius={theme.borderRadius.md} />
                ))}
              </View>
            ) : closet.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyTop}>
                  <View style={styles.emptyIconTile}>
                    <Ionicons name="shirt-outline" size={22} color={theme.colors.text} />
                  </View>
                  <View style={styles.emptyBody}>
                    <Text style={styles.emptyTitle}>Your wardrobe is empty</Text>
                    <Text style={styles.emptyText}>
                      Add your first pieces to build looks and try them on.
                    </Text>
                  </View>
                </View>
                <AppButton
                  label="Add clothes"
                  size="md"
                  icon="add"
                  onPress={() => router.push("/(tabs)/discover")}
                  style={styles.emptyBtn}
                />
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tileRow}
              >
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
            {/* ------------------------------------------------ Recent looks (saved) */}
            <SectionHeader
              title="Recent looks"
              subtitle="Outfits you saved — built from real pieces."
              actionLabel="All"
              onAction={() => router.push("/(tabs)/outfits")}
            />
            {savedLoading ? (
              <SkeletonRow />
            ) : saved.length === 0 ? (
              <Text style={styles.emptyLine}>
                Build your first outfit and it will show up here.
              </Text>
            ) : (
              <View style={styles.savedList}>
                {saved.slice(0, 4).map((o) => (
                  <SavedLookRow
                    key={o.id}
                    outfit={o}
                    onPress={() => router.push(`/outfit/${o.id}`)}
                  />
                ))}
              </View>
            )}

            {/* ------------------------------------------------ Recently viewed */}
            <SectionHeader title="Recently viewed" subtitle="Pick up where you left off." />
            {recentLoading ? (
              <SkeletonRow />
            ) : recent.length === 0 ? (
              <Text style={styles.emptyLine}>
                Items you open will appear here.
              </Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tileRow}
              >
                {recent.slice(0, 10).map((item) => (
                  <ClothingCard
                    key={item.id}
                    item={item}
                    width={HORIZONTAL_CARD_W}
                    onPress={() => openItem(item)}
                  />
                ))}
              </ScrollView>
            )}
          </>
        )}

        <ShareOutfitModal
          visible={false}
          onClose={() => {}}
          onShared={() => {}}
        />

        <CreateRoomModal
          visible={false}
          onClose={() => {}}
          onCreated={() => {}}
        />
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Greeting header — time-aware greeting, animated mascot, avatar → Profile,
// and a tappable style tip. Visual only; the greeting name comes from the real
// profile fetched by the screen.
// ---------------------------------------------------------------------------
const GREETING_TIPS = [
  "Tag every piece — sharper recommendations start with a full closet.",
  "Plan tomorrow's look from the Outfits calendar.",
  "Try a look on virtually before you commit to it.",
  "Save the looks you love and they'll surface right here.",
] as const;

const WELCOME_LINE =
  "Hi! I'm Fitguin, your style guide — I'll drop tips right here while you browse.";
const DIALOGUE = [WELCOME_LINE, ...GREETING_TIPS] as const;

/** Advance the dialogue, skipping the welcome line (index 0) on wrap. */
const nextDialogueIndex = (i: number) => (i + 1 >= DIALOGUE.length ? 1 : i + 1);

function greetingFor(hour: number): string {
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

// Flat top bar: greeting + live location on the left, avatar on the right. The
// old greeting card (with blobs) is gone — the header is now a light row so the
// hero below carries the visual weight.
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
  const styles = useStyles();
  const theme = useAppTheme();

  // Recompute the greeting as real time passes so "Good morning" never sticks
  // into the afternoon while the app stays open.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const greeting = greetingFor(now.getHours());
  const initial = (nickname?.[0] ?? "").toUpperCase();

  // Real GPS + reverse geocoding — shown right under the greeting. Honest states:
  // loading while locating, the actual place when ready, tappable retry when off.
  const place = useCurrentPlace();

  // Entrance (fade + rise).
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
          transform: [
            {
              translateY: enter.interpolate({
                inputRange: [0, 1],
                outputRange: [10, 0],
              }),
            },
          ],
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
          <Ionicons
            name={place.status === "blocked" ? "location-outline" : "location"}
            size={12}
            color={theme.colors.textMuted}
          />
          <Text style={styles.greetingPlace} numberOfLines={1}>
            {place.status === "loading"
              ? "Finding your location…"
              : place.status === "ready"
                ? place.label
                : "Location off — tap to enable"}
          </Text>
        </Pressable>
      </View>

      <ProfileAvatar
        size={40}
        initial={initial}
        avatarRef={avatarRef}
        onPress={onOpenProfile}
      />
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------
// Dashboard-style hero. The mascot is anchored to the bottom-left corner of the
// card and sized as a share of the card width (≈40% of the visible card once
// the PNG's transparent margin is accounted for), so it reads as part of the
// composition rather than a small icon beside the heading.
function Hero({
  pieceCount,
  lookCount,
  loading,
}: {
  pieceCount: number;
  lookCount: number;
  loading: boolean;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();

  // The hero sits inside the page gutter, so the card is the window minus both
  // gutters. Clamped so the mascot stays sane on small phones and tablets.
  const cardW = Math.max(240, width - theme.spacing.page * 2);
  const mascot = Math.round(Math.min(Math.max(cardW * 0.5, 128), 300));
  // Leave a lane beside the mascot so its speech bubble never sits on its body.
  const mascotLane = Math.round(mascot * 0.72);

  // The mascot "speaks" the dialogue: type it out, hold, then swap. Index 0 is
  // the welcome; wrapping skips back to 1 so the hello never repeats.
  const [tipIndex, setTipIndex] = useState(0);
  const [typed, setTyped] = useState(0);
  const tip = DIALOGUE[tipIndex];

  useEffect(() => {
    const done = typed >= tip.length;
    const id = setTimeout(
      () => {
        if (done) {
          setTyped(0);
          setTipIndex((i) => nextDialogueIndex(i));
        } else {
          setTyped((n) => n + 1);
        }
      },
      done ? 3000 : 38,
    );
    return () => clearTimeout(id);
  }, [tip, typed]);

  // Entrance (fade + rise), a slow offset bob, and a blinking caret.
  const [appear] = useState(() => new Animated.Value(0));
  const [bob] = useState(() => new Animated.Value(0));
  const [caret] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const entrance = Animated.timing(appear, {
      toValue: 1,
      duration: 520,
      delay: 100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 2100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 2100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    const caretLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(caret, { toValue: 0, duration: 520, useNativeDriver: true }),
        Animated.timing(caret, { toValue: 1, duration: 520, useNativeDriver: true }),
      ]),
    );
    entrance.start();
    bobLoop.start();
    caretLoop.start();
    return () => {
      entrance.stop();
      bobLoop.stop();
      caretLoop.stop();
    };
  }, [appear, bob, caret]);

  return (
    <View style={styles.hero}>
      <View style={[styles.heroBlob, styles.heroBlobA]} pointerEvents="none" />
      <View style={[styles.heroBlob, styles.heroBlobB]} pointerEvents="none" />

      <View style={styles.heroTop}>
        <View style={styles.heroCopy}>
          <View style={styles.heroPill}>
            <Ionicons name="sparkles" size={11} color={theme.colors.text} />
            <Text style={styles.heroPillText}>Fitguin</Text>
          </View>
          <Text style={styles.heroTitle}>
            Your wardrobe.
            {"\n"}
            Styled by AI.
          </Text>
          <Text style={styles.heroText}>
            Create outfits, try clothes virtually, and discover what to wear next.
          </Text>
        </View>

        {/* Real counts from the user's own rows — dashes until they load. */}
        <View style={styles.heroStats}>
          <StatCell
            icon="shirt-outline"
            value={loading ? "—" : String(pieceCount)}
            label="PIECES"
          />
          <View style={styles.heroStatDivider} />
          <StatCell
            icon="sparkles-outline"
            value={loading ? "—" : String(lookCount)}
            label="LOOKS"
          />
        </View>
      </View>

      <View style={styles.heroButtons}>
        <AppButton
          label="Create outfit"
          icon="shirt-outline"
          onPress={() => router.push("/ai-picker")}
          style={styles.heroBtn}
        />
        <AppButton
          label="Try it on"
          icon="sparkles-outline"
          variant="secondary"
          onPress={() => router.push("/(tabs)/scan")}
          style={[styles.heroBtn, styles.heroBtnAlt]}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/(tabs)/discover")}
        style={({ pressed }) => [styles.heroLink, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="folder-open-outline" size={15} color={theme.colors.text} />
        <Text style={styles.heroLinkText}>My wardrobe</Text>
        <Ionicons name="chevron-forward" size={13} color={theme.colors.textMuted} />
      </Pressable>

      {/* Soft stage the penguin stands on — keeps the corner from feeling empty. */}
      <View
        style={[
          styles.heroStageBlob,
          {
            width: Math.round(mascot * 1.1),
            height: Math.round(mascot * 0.2),
            left: -Math.round(mascot * 0.16),
          },
        ]}
        pointerEvents="none"
      />

      {/* The app's one mascot: anchored to the card's bottom-left corner,
          painted before the bubble so its speech sits in front of it. */}
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
              {
                translateY: appear.interpolate({
                  inputRange: [0, 1],
                  outputRange: [18, 0],
                }),
              },
              {
                translateY: bob.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -6],
                }),
              },
            ],
          },
        ]}
      >
        <Mascot size={mascot} />
      </Animated.View>

      {/* One mascot, one voice — the penguin says the rotating tip in a
          manga-style bubble whose tail points back at its head. */}
      <View style={[styles.heroSpeak, { minHeight: Math.round(mascot * 0.9) }]}>
        <View style={{ width: mascotLane }} pointerEvents="none" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show the next line"
          onPress={() => {
            setTyped(0);
            setTipIndex((i) => nextDialogueIndex(i));
          }}
          style={({ pressed }) => [styles.bubbleWrap, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.bubbleTail} pointerEvents="none" />
          <View style={styles.bubble}>
            <View style={styles.bubbleHead}>
              <Ionicons
                name={tipIndex === 0 ? "sparkles" : "bulb-outline"}
                size={13}
                color={theme.colors.text}
              />
              <Text style={styles.bubbleLabel}>
                {tipIndex === 0 ? "FITGUIN" : "STYLING TIP"}
              </Text>
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

/** Compact "dashboard widget" cell: real count over a small caps label. */
function StatCell({
  icon,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
}) {
  const styles = useStyles();
  const theme = useAppTheme();

  return (
    <View style={styles.statCell}>
      <View style={styles.statValueRow}>
        <Ionicons name={icon} size={13} color="rgba(255,255,255,0.62)" />
        <Text style={styles.statValue}>{value}</Text>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Wardrobe tile (home preview)
// ---------------------------------------------------------------------------
function WardrobeTile({
  id,
  imageRef,
  name,
  category,
  onPress,
}: {
  id: string;
  imageRef: string | null;
  name: string;
  category: string;
  onPress: () => void;
}) {
  const styles = useStyles();
  const theme = useAppTheme();
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    resolveMediaUrl(imageRef, 900).then((u) => {
      if (alive) setUri(u);
    });
    return () => {
      alive = false;
    };
  }, [imageRef]);

  return (
    <Pressable
      accessibilityRole="button"
      key={id}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && { opacity: 0.9 }]}
    >
      {uri ? (
        <Image source={{ uri }} style={styles.tileImage} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.tileImage, styles.tilePlaceholder]}>
          <Ionicons name="shirt-outline" size={22} color={theme.colors.textMuted} />
        </View>
      )}
      <Text style={styles.tileName} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.tileMeta} numberOfLines={1}>
        {category}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Saved look row
// ---------------------------------------------------------------------------
function SavedLookRow({ outfit, onPress }: { outfit: SavedOutfit; onPress: () => void }) {
  const styles = useStyles();
  const theme = useAppTheme();
  const count = outfit.clothing_ids?.length ?? 0;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.savedRow, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.savedIcon}>
        <Ionicons name="sparkles" size={18} color={theme.colors.onPrimary} />
      </View>
      <View style={styles.savedBody}>
        <Text style={styles.savedName} numberOfLines={1}>
          {outfit.name || (outfit.occasion ? `${outfit.occasion} look` : "Untitled look")}
        </Text>
        <Text style={styles.savedMeta} numberOfLines={1}>
          {outfit.occasion ?? "No occasion"} · {count} item{count === 1 ? "" : "s"} ·{" "}
          {new Date(outfit.created_at).toLocaleDateString()}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 120,
  },
  hRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  heroMascot: {
    width: 90,
    height: 90,
  },
  statCell: {
    flex: 1,
    alignItems: "flex-start",
    gap: 2,
  },
  statValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.text,
  },
  statLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  tile: {
    width: "48%",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    overflow: "hidden",
    paddingBottom: 8,
  },
  tileImage: {
    width: "100%",
    height: 120,
  },
  tilePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceAlt,
  },
  tileName: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.text,
    paddingHorizontal: 8,
    marginTop: 6,
  },
  tileMeta: {
    fontSize: 11,
    color: theme.colors.textMuted,
    paddingHorizontal: 8,
    marginTop: 2,
  },
  savedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  savedIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  savedBody: {
    flex: 1,
    minWidth: 0,
  },
  savedName: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text,
  },
  savedMeta: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2,
  },

  // Top bar (flat, no card)
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  greetingBody: { flex: 1, minWidth: 0 },
  greetingTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: theme.colors.text,
  },
  greetingPlaceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  greetingPlace: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: theme.colors.textMuted,
  },
  // Manga-style speech bubble — the penguin's voice in the hero
  bubbleWrap: { flex: 1, minWidth: 0 },
  bubbleTail: {
    position: "absolute",
    left: -7,
    top: 24,
    width: 14,
    height: 14,
    backgroundColor: theme.colors.surface,
    borderLeftWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: theme.colors.text,
    transform: [{ rotate: "45deg" }],
  },
  bubble: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.text,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
  },
  bubbleHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  bubbleLabel: {
    flex: 1,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.3,
    color: theme.colors.textMuted,
  },
  bubbleText: {
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
    color: theme.colors.text,
    minHeight: 54,
  },
  bubbleCaret: { color: theme.colors.text, fontWeight: "700" },

  // Hero (dashboard-style panel; the mascot is anchored bottom-left)
  hero: {
    backgroundColor: theme.colors.surface,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 20,
    marginTop: theme.spacing.sm,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.07,
    shadowRadius: 22,
    elevation: 4,
  },
  heroBlob: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "rgba(17,17,17,0.03)",
  },
  heroBlobA: { width: 220, height: 220, top: -110, right: -70 },
  heroBlobB: {
    width: 150,
    height: 150,
    bottom: 30,
    right: -70,
    backgroundColor: "rgba(17,17,17,0.02)",
  },
  heroTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  heroCopy: { flex: 1, minWidth: 0 },
  heroPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.borderRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroPillText: {
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: theme.colors.text,
  },
  heroTitle: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "800",
    letterSpacing: -0.8,
    color: theme.colors.text,
    marginTop: 12,
  },
  heroText: {
    fontSize: 13.5,
    lineHeight: 19,
    color: theme.colors.textMuted,
    marginTop: 8,
  },
  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  heroStatDivider: {
    width: 1,
    height: 20,
    backgroundColor: theme.colors.border,
  },
  heroButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  heroBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
  },
  heroBtnAlt: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  heroLink: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceAlt,
  },
  heroLinkText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text,
  },

  // Segment switcher
  segment: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    marginTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.surfaceAlt,
  },
  segmentBtnActive: { backgroundColor: theme.colors.primary },
  segmentText: { fontSize: 13, fontWeight: "700", color: theme.colors.textMuted },
  segmentTextActive: { color: theme.colors.onPrimary },

  // Chips
  chips: { gap: 8, paddingTop: 12, paddingRight: 16 },
  chipsSpacer: { height: 4 },

  // Grid layouts
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "flex-start",
  },
  tileRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "flex-start",
  },

  // Unavailable state
  unavailable: {
    paddingVertical: 40,
    alignItems: "center",
  },
  unavailableBody: { gap: 8, maxWidth: 280 },
  unavailableTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text,
  },
  unavailableText: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  unavailableRetry: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
  },
  unavailableRetryText: { color: theme.colors.onPrimary, fontWeight: "700" },

  // Empty states
  emptyLine: {
    fontSize: 13,
    color: theme.colors.textMuted,
    paddingVertical: 8,
  },

  // Wardrobe empty state
  emptyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTop: { flexDirection: "column", alignItems: "center", gap: 12 },
  emptyIconTile: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyBody: { textAlign: "center", maxWidth: 200 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.text },
  emptyText: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  emptyBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
  },

  // Saved list
  savedList: { gap: 8, marginTop: 8 },

  // Hero stage blob
  heroStageBlob: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    height: 30,
    backgroundColor: "rgba(17,17,17,0.03)",
  },

  // Hero speak bubble
  heroSpeak: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 8,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
}));