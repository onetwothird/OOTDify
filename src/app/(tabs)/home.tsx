// C:\OOTDify\src\app\(tabs)\home.tsx
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
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
import { useWardrobeStore } from "../../features/wardrobe/store";
import { AppButton } from "../../shared/components/AppButton";
import { Chip } from "../../shared/components/Chip";
import { ClothingCard } from "../../shared/components/ClothingCard";
import { SkeletonGrid, SkeletonRow } from "../../shared/components/LoadingState";
import { SectionHeader } from "../../shared/components/SectionHeader";
import { Skeleton } from "../../shared/components/Skeleton";
import { theme } from "../../shared/config/theme";
import { useResponsiveColumns } from "../../shared/hooks/useResponsiveColumns";
import { resolveMediaUrl } from "../../shared/lib/storageUrl";
import { ApiError, recommendCatalog } from "../../services/aiApi";

const HORIZONTAL_CARD_W = 150;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { columns, itemWidth, onLayout } = useResponsiveColumns(16, 120, 12);

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

  const firstFocus = useRef(true);

  // ---------------------------------------------------------------------------
  // Loaders (real endpoints only)
  // ---------------------------------------------------------------------------
  const loadRecommendations = useCallback(async (occ: string) => {
    setRecLoading(true);
    setRecError(null);
    try {
      const { recommendations } = await recommendCatalog({ occasion: occ, limit: 8 });
      setRecommended(recommendations);
    } catch (e) {
      setRecError(e instanceof ApiError ? e : new ApiError("unknown", "Something went wrong. Please try again.", 0, e));
    } finally {
      setRecLoading(false);
    }
  }, []);

  const loadTrending = useCallback(async () => {
    setTrendingLoading(true);
    setTrendingError(null);
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

  useEffect(() => {
    void loadRecommendations(occasion);
  }, [occasion, loadRecommendations]);

  useEffect(() => {
    void loadTrending();
  }, [loadTrending]);

  useFocusEffect(
    useCallback(() => {
      // Refresh lightweight lists on every focus so cross-tab changes appear;
      // avoid replacing visible content on the very first mount.
      if (firstFocus.current) {
        firstFocus.current = false;
        void loadStatic();
        return;
      }
      void loadStatic();
    }, [loadStatic]),
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
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ------------------------------------------------ Hero */}
        <Hero />

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
          <View style={styles.hEmpty}>
            <Text style={styles.emptyLine}>
              Your wardrobe is empty — add your first pieces.
            </Text>
            <AppButton
              label="Add clothes"
              size="md"
              icon="add"
              onPress={() => router.push("/(tabs)/discover")}
              style={styles.inlineBtn}
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
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------
function Hero() {
  const router = useRouter();
  return (
    <View style={styles.hero}>
      <Text style={styles.heroEyebrow}>OOTDIFY · AI STYLIST</Text>
      <Text style={styles.heroTitle}>
        Your wardrobe.
        {"\n"}
        Styled by AI.
      </Text>
      <Text style={styles.heroText}>
        Create outfits, try clothes virtually, and discover what to wear next.
      </Text>
      <View style={styles.heroActions}>
        <AppButton
          label="Create outfit"
          icon="shirt-outline"
          onPress={() => router.push("/(tabs)/outfits")}
          style={styles.heroBtn}
        />
        <AppButton
          label="Try it on"
          icon="sparkles-outline"
          variant="secondary"
          onPress={() => router.push("/(tabs)/scan")}
          style={styles.heroBtn}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/(tabs)/discover")}
        style={styles.heroWalletLink}
      >
        <Ionicons name="folder-open-outline" size={16} color={theme.colors.onPrimary} />
        <Text style={styles.heroWalletText}>My wardrobe</Text>
        <Ionicons name="chevron-forward" size={14} color={theme.colors.onPrimary} />
      </Pressable>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingHorizontal: theme.spacing.page, paddingBottom: 40 },

  // Hero
  hero: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    padding: 22,
    paddingBottom: 18,
    marginTop: theme.spacing.sm,
  },
  heroEyebrow: {
    color: "#E8A88F",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 10,
  },
  heroTitle: {
    color: theme.colors.onPrimary,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "800",
    letterSpacing: -1,
  },
  heroText: {
    color: "#C9C5BC",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
    maxWidth: 300,
  },
  heroActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  heroBtn: { flex: 1 },
  heroWalletLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
    alignSelf: "flex-start",
  },
  heroWalletText: {
    color: theme.colors.onPrimary,
    fontSize: 13.5,
    fontWeight: "700",
  },

  // Sections
  chips: { gap: 8, paddingRight: 16, paddingBottom: 4 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "flex-start",
  },
  hRow: { flexDirection: "row", gap: 12 },
  hEmpty: { gap: 10 },
  tileRow: { gap: 12, paddingRight: 16 },
  tile: { width: 108 },
  tileImage: {
    width: 108,
    height: 128,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceAlt,
  },
  tilePlaceholder: { alignItems: "center", justifyContent: "center" },
  tileName: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text,
    marginTop: 6,
  },
  tileMeta: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 1,
  },

  savedList: { gap: 10 },
  savedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 12,
  },
  savedIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  savedBody: { flex: 1, minWidth: 0 },
  savedName: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  savedMeta: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2 },

  emptyLine: {
    fontSize: 13,
    color: theme.colors.textMuted,
    lineHeight: 19,
    paddingVertical: 8,
  },
  inlineBtn: { alignSelf: "flex-start" },

  // Backend-unavailable banner (friendly, actionable)
  unavailable: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FBF0EA",
    borderRadius: theme.borderRadius.md,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#EBCFBE",
  },
  unavailableBody: { flex: 1, minWidth: 0 },
  unavailableTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#9A4A28",
  },
  unavailableText: {
    fontSize: 12,
    color: "#8A5A40",
    lineHeight: 17,
    marginTop: 2,
  },
  unavailableRetry: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E0BFA9",
  },
  unavailableRetryText: { fontSize: 12, fontWeight: "700", color: "#9A4A28" },
});