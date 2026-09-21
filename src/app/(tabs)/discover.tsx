// C:\OOTDify\src\app\(tabs)\discover.tsx
// Wardrobe: your private closet (real clothing_items rows, RLS owner-only) with
// search, category filters, favorites, and item details — plus the shared
// catalog to browse below. "Capture" opens the photo-capture modal.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCaptureModalStore } from "../../features/capture/captureModalStore";
import type { CatalogItem, ClothingItem } from "../../features/clothing/types";
import { CATALOG_CATEGORIES, WARDROBE_CATEGORIES } from "../../features/clothing/types";
import {
  addItemFavorite,
  fetchItemFavoriteIds,
  fetchMyCloset,
  recordRecentlyViewed,
  removeItemFavorite,
} from "../../features/clothing/service";
import { useCatalog } from "../../features/clothing/useCatalog";
import { useWardrobeStore } from "../../features/wardrobe/store";
import { AppButton } from "../../shared/components/AppButton";
import { Chip } from "../../shared/components/Chip";
import { ClothingCard } from "../../shared/components/ClothingCard";
import { SkeletonGrid } from "../../shared/components/LoadingState";
import { EmptyState } from "../../shared/components/StateViews";
import { SectionHeader } from "../../shared/components/SectionHeader";
import { theme } from "../../shared/config/theme";
import { useResponsiveColumns } from "../../shared/hooks/useResponsiveColumns";
import { resolveMediaUrl } from "../../shared/lib/storageUrl";

export default function WardrobeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const openCapture = useCaptureModalStore((s) => s.open);
  const { columns, itemWidth, onLayout } = useResponsiveColumns(16, 110, 12);

  // ---- My closet (real, owner-scoped) --------------------------------------
  const closet = useWardrobeStore((s) => s.items);
  const closetLoading = useWardrobeStore((s) => s.loading);
  const closetError = useWardrobeStore((s) => s.error);

  // ---- Filters -------------------------------------------------------------
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
  const [catalogCategory, setCatalogCategory] = useState<string | null>(null);

  // ---- Item favorites (target_type = "item") --------------------------------
  const [favIds, setFavIds] = useState<Set<string>>(new Set());
  const [favReady, setFavReady] = useState(false);

  const firstFocus = useRef(true);

  const catalogs = useCatalog(catalogCategory ?? undefined);

  const loadCloset = useCallback(async () => {
    await Promise.all([
      useWardrobeStore.getState().loadFromServer().catch(() => {}),
      fetchItemFavoriteIds()
        .then((ids) => {
          setFavIds(ids);
          setFavReady(true);
        })
        .catch(() => setFavReady(true)),
    ]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Refresh on every focus so captures/edits made elsewhere show up.
      if (firstFocus.current) {
        firstFocus.current = false;
        void loadCloset();
        return;
      }
      void loadCloset();
    }, [loadCloset]),
  );

  const filteredCloset = useMemo(() => {
    const q = query.trim().toLowerCase();
    return closet.filter((item) => {
      const matchesFilter = !filter || item.category === filter;
      if (!matchesFilter) return false;
      if (!q) return true;
      const haystack = [
        item.name,
        item.category,
        item.color,
        item.size,
        item.brand,
        item.style,
        item.season,
        ...(item.tags ?? []),
        ...(item.occasion ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [closet, query, filter]);

  const toggleFavorite = useCallback(
    (item: ClothingItem) => {
      const isFav = favIds.has(item.id);
      setFavIds((prev) => {
        const next = new Set(prev);
        if (isFav) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
      void (isFav ? removeItemFavorite(item.id) : addItemFavorite(item.id)).catch(() => {
        // Roll back the optimistic toggle.
        setFavIds((prev) => {
          const next = new Set(prev);
          if (isFav) next.add(item.id);
          else next.delete(item.id);
          return next;
        });
      });
    },
    [favIds],
  );

  const openCatalogItem = useCallback(
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
        {/* ------------------------- Header + add ------------------------- */}
        <View style={styles.headerRow}>
          <View style={styles.headerBlock}>
            <Text style={styles.headerTitle}>My Wardrobe</Text>
            <Text style={styles.headerSubtitle}>
              Your pieces, stored privately.
            </Text>
          </View>
          <AppButton
            label="Add"
            size="md"
            icon="add"
            onPress={openCapture}
            style={styles.addBtn}
          />
        </View>

        {/* ------------------------- Search ------------------------- */}
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={17} color={theme.colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search name, color, brand, tag…"
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityRole="button">
              <Ionicons name="close-circle" size={17} color={theme.colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {/* ------------------------- Category filter ------------------------- */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <Chip label="All" active={filter === null} onPress={() => setFilter(null)} />
          {WARDROBE_CATEGORIES.map((cat) => (
            <Chip key={cat} label={cat} active={cat === filter} onPress={() => setFilter(cat)} />
          ))}
        </ScrollView>

        {/* ------------------------- Closet grid ------------------------- */}
        {closetLoading && closet.length === 0 ? (
          <SkeletonGrid />
        ) : closetError ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load your wardrobe"
            message={closetError}
            actionLabel="Try again"
            onAction={() => void loadCloset()}
          />
        ) : closet.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              icon="shirt-outline"
              title="Your wardrobe is empty"
              message="Capture photos of your pieces to build a private, searchable closet."
              actionLabel="Add clothes"
              onAction={openCapture}
            />
          </View>
        ) : filteredCloset.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              icon="filter-outline"
              title="Nothing matches"
              message="Try a different search or clear the category filter."
              actionLabel="Clear filters"
              onAction={() => {
                setQuery("");
                setFilter(null);
              }}
            />
          </View>
        ) : (
          <View style={styles.grid} onLayout={onLayout}>
            {filteredCloset.map((item) => (
              <ClosetCard
                key={item.id}
                item={item}
                width={itemWidth}
                favorited={favReady && favIds.has(item.id)}
                onPress={() => router.push(`/item/${item.id}`)}
                onToggleFavorite={() => toggleFavorite(item)}
              />
            ))}
          </View>
        )}

        {/* ------------------------- Shopping import (honest roadmap) -------- */}
        <View style={styles.importCard}>
          <View style={styles.importIcon}>
            <Ionicons name="bag-handle-outline" size={20} color={theme.colors.onPrimary} />
          </View>
          <View style={styles.importBody}>
            <Text style={styles.importTitle}>Import from shopping platforms</Text>
            <Text style={styles.importText}>
              Shopee & TikTok Shop imports are on the roadmap. When a provider is
              added, you'll be able to bring products in by official link or
              product photo — no scraping, ever.
            </Text>
          </View>
        </View>

        {/* ------------------------- Browse the catalog ---------------------- */}
        <SectionHeader
          title="Browse the catalog"
          subtitle="Discover pieces to add to a look."
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <Chip label="All" active={catalogCategory === null} onPress={() => setCatalogCategory(null)} />
          {CATALOG_CATEGORIES.map((cat) => (
            <Chip
              key={cat}
              label={cat}
              active={cat === catalogCategory}
              onPress={() => setCatalogCategory(cat)}
            />
          ))}
        </ScrollView>

        {catalogs.loading ? (
          <SkeletonGrid />
        ) : catalogs.error ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load the catalog"
            message={catalogs.error}
            actionLabel="Try again"
            onAction={() => void catalogs.refetch()}
          />
        ) : catalogs.items.length === 0 ? (
          <Text style={styles.smallNote}>No catalog items in this category yet.</Text>
        ) : (
          <View style={styles.grid} onLayout={onLayout}>
            {catalogs.items.map((item) => (
              <ClothingCard
                key={item.id}
                item={item}
                width={columns >= 4 ? itemWidth : itemWidth}
                favorited={catalogs.favoriteIds.has(item.id)}
                onPress={() => openCatalogItem(item)}
                onToggleFavorite={() => catalogs.toggleFavorite(item).catch(() => {})}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Closet card: image, name, category, favorite toggle → item detail screen
// ---------------------------------------------------------------------------
const ClosetCard = memo(function ClosetCard({
  item,
  width,
  favorited,
  onPress,
  onToggleFavorite,
}: {
  item: ClothingItem;
  width: number;
  favorited: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
}) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    resolveMediaUrl(item.image_url, 900).then((u) => {
      if (alive) setUri(u);
    });
    return () => {
      alive = false;
    };
  }, [item.image_url]);

  return (
    <View style={[styles.closetCard, { width }]}>
      <Pressable accessibilityRole="button" onPress={onPress} style={styles.cardImageWrap}>
        {uri ? (
          <Image source={{ uri }} style={styles.closetImage} contentFit="cover" transition={120} />
        ) : (
          <View style={styles.closetImagePlaceholder}>
            <Ionicons name="shirt-outline" size={22} color={theme.colors.textMuted} />
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={favorited ? "Remove from favorites" : "Add to favorites"}
          hitSlop={8}
          onPress={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          style={styles.heartButton}
        >
          <Ionicons
            name={favorited ? "heart" : "heart-outline"}
            size={16}
            color={favorited ? theme.colors.accent : "#FFFFFF"}
          />
        </Pressable>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onPress} style={styles.cardMeta}>
        <Text style={styles.closetName} numberOfLines={1}>
          {item.name || item.category || "Untitled"}
        </Text>
        <Text style={styles.closetMeta} numberOfLines={1}>
          {[item.category, item.color, item.size].filter(Boolean).join(" · ") || "Item"}
        </Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingHorizontal: theme.spacing.page, paddingBottom: 40 },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  headerBlock: { flex: 1, minWidth: 0 },
  headerTitle: {
    fontSize: theme.typography.hero.fontSize,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: theme.colors.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  addBtn: { paddingHorizontal: 16 },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 12,
    marginTop: theme.spacing.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: "500",
  },

  chips: { gap: 8, paddingTop: 12, paddingRight: 16 },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "flex-start",
  },

  closetCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  cardImageWrap: {
    width: "100%",
    aspectRatio: 0.85,
    backgroundColor: theme.colors.surfaceAlt,
    position: "relative",
  },
  closetImage: { width: "100%", height: "100%" },
  closetImagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceAlt,
  },
  heartButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(20,20,20,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardMeta: { padding: 8 },
  closetName: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text,
  },
  closetMeta: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2,
  },

  emptyWrap: { paddingVertical: 24 },

  importCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.borderRadius.md,
    padding: 14,
    marginTop: theme.spacing.section - 8,
  },
  importIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  importBody: { flex: 1, minWidth: 0 },
  importTitle: {
    fontSize: 13.5,
    fontWeight: "800",
    color: theme.colors.text,
  },
  importText: {
    fontSize: 12,
    lineHeight: 17,
    color: theme.colors.textMuted,
    marginTop: 3,
  },

  smallNote: {
    fontSize: 13,
    color: theme.colors.textMuted,
    paddingVertical: 8,
  },
});