// C:\OOTDify\src\app\catalog\[id].tsx
// Catalog item detail: real row from public.clothing, favorite toggle, and a
// "Try it on" action that hands the garment to the Scan tab.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CatalogItem } from "../../features/clothing/types";
import {
  addFavorite,
  fetchCatalogItem,
  fetchFavoriteIds,
  recordRecentlyViewed,
  removeFavorite,
} from "../../features/clothing/service";
import { useTryOnSelection } from "../../features/tryon/selectionStore";
import { ErrorState } from "../../shared/components/StateViews";
import { LoadingState } from "../../shared/components/LoadingState";
import { theme } from "../../shared/config/theme";
import { resolveMediaUrl } from "../../shared/lib/storageUrl";

export default function CatalogDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const setClothing = useTryOnSelection((s) => s.setClothing);

  const [item, setItem] = useState<CatalogItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fav, setFav] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [row, favs] = await Promise.all([
          fetchCatalogItem(id),
          fetchFavoriteIds().catch(() => new Set<string>()),
        ]);
        if (!alive) return;
        if (!row) {
          setError("This item is no longer in the catalog.");
        } else {
          setItem(row);
          setFav(favs.has(row.id));
          recordRecentlyViewed(row.id).catch(() => {});
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Could not load this item.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (!item) return;
    let alive = true;
    resolveMediaUrl(item.image_url, 900).then((u) => {
      if (alive) setImageUri(u);
    });
    return () => {
      alive = false;
    };
  }, [item]);

  const toggleFav = async () => {
    if (!item) return;
    const next = !fav;
    setFav(next);
    try {
      if (next) await addFavorite(item.id);
      else await removeFavorite(item.id);
    } catch (e) {
      setFav(!next);
      console.warn("favorite toggle failed", e);
    }
  };

  const tryItOn = () => {
    if (!item) return;
    setClothing(item.id, "catalog");
    router.push("/(tabs)/scan");
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.navRow}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8} style={styles.navBtn}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.navTitle}>Item</Text>
        <Pressable accessibilityRole="button" onPress={toggleFav} hitSlop={8} style={styles.navBtn}>
          <Ionicons
            name={fav ? "heart" : "heart-outline"}
            size={22}
            color={fav ? theme.colors.primary : theme.colors.textMuted}
          />
        </Pressable>
      </View>

      {loading ? (
        <LoadingState label="Loading item" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => router.back()} />
      ) : item ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            {imageUri ? (
              <Image
                source={{ uri: imageUri }}
                style={styles.heroImage}
                contentFit="cover"
                transition={150}
              />
            ) : (
              <View style={[styles.heroImage, styles.heroPlaceholder]} />
            )}
            <View style={styles.pricePill}>
              <Text style={styles.priceText}>
                {item.currency === "USD" ? "$" : `${item.currency} `}
                {Number(item.price ?? 0).toFixed(2)}
              </Text>
            </View>
          </View>

          <View style={styles.body}>
            <Text style={styles.name}>{item.name}</Text>
            {item.brand ? <Text style={styles.brand}>{item.brand}</Text> : null}
            {item.description ? (
              <Text style={styles.description}>{item.description}</Text>
            ) : null}

            <MetaList title="Category" values={[item.category, item.subcategory].filter(Boolean) as string[]} />
            <MetaList title="Style" values={item.style ? [item.style] : []} />
            <MetaList title="Colors" values={item.color} />
            <MetaList title="Sizes" values={item.sizes} />
            <MetaList title="Occasions" values={item.occasion} />

            <Pressable accessibilityRole="button" style={styles.tryonBtn} onPress={tryItOn}>
              <Ionicons name="sparkles-outline" size={18} color="#FFF" />
              <Text style={styles.tryonBtnText}>Try it on</Text>
            </Pressable>
            <Text style={styles.tryonHint}>
              Opens the Scan tab — pick a body photo and run a virtual try-on.
            </Text>
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

function MetaList({ title, values }: { title: string; values: string[] }) {
  if (!values.length) return null;
  return (
    <View style={styles.metaBlock}>
      <Text style={styles.metaTitle}>{title}</Text>
      <View style={styles.metaChips}>
        {values.map((v) => (
          <View key={v} style={styles.metaChip}>
            <Text style={styles.metaChipText}>{v}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  navBtn: { padding: 6 },
  navTitle: { fontSize: 15, fontWeight: "800", color: theme.colors.text },
  content: { paddingBottom: 40 },
  hero: { position: "relative" },
  heroImage: { width: "100%", aspectRatio: 0.8, backgroundColor: theme.colors.primaryMuted },
  heroPlaceholder: { backgroundColor: theme.colors.border },
  pricePill: {
    position: "absolute",
    bottom: 12,
    left: 12,
    backgroundColor: "rgba(9,9,11,0.82)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  priceText: { color: "#FFF", fontWeight: "800", fontSize: 14 },
  body: { padding: 16, gap: 14 },
  name: { fontSize: 22, fontWeight: "800", color: theme.colors.text, letterSpacing: -0.3 },
  brand: { fontSize: 13, color: theme.colors.textMuted, marginTop: -8 },
  description: { fontSize: 14, color: theme.colors.text, lineHeight: 20 },
  metaBlock: { gap: 6 },
  metaTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: theme.colors.textMuted },
  metaChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  metaChip: {
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  metaChipText: { fontSize: 12, fontWeight: "600", color: theme.colors.text },
  tryonBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 15,
    marginTop: 4,
  },
  tryonBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  tryonHint: { fontSize: 11.5, color: theme.colors.textMuted, textAlign: "center" },
});