// C:\OOTDify\src\app\catalog\[id].tsx
// Catalog item detail: real row from public.clothing, favorite toggle, and a
// "Try it on" action that hands the garment to the Scan tab.
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
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
import { SmartImage } from "../../shared/components/SmartImage";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";

export default function CatalogDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useStyles();
  const theme = useAppTheme();
  const { t, tl } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const setClothing = useTryOnSelection((s) => s.setClothing);

  const [item, setItem] = useState<CatalogItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fav, setFav] = useState(false);

  // Reset to the loading state during render when the route param changes —
  // React's documented alternative to a synchronous setState inside an effect.
  const [prevId, setPrevId] = useState(id);
  if (prevId !== id) {
    setPrevId(id);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      try {
        const [row, favs] = await Promise.all([
          fetchCatalogItem(id),
          fetchFavoriteIds().catch(() => new Set<string>()),
        ]);
        if (!alive) return;
        if (!row) {
          setError(t("catalog.not_found"));
        } else {
          setItem(row);
          setFav(favs.has(row.id));
          recordRecentlyViewed(row.id).catch(() => {});
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : t("catalog.error.load"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, t]);

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
        <Text style={styles.navTitle}>{t("catalog.nav_title")}</Text>
        <Pressable accessibilityRole="button" onPress={toggleFav} hitSlop={8} style={styles.navBtn}>
          <Ionicons
            name={fav ? "heart" : "heart-outline"}
            size={22}
            color={fav ? theme.colors.brand : theme.colors.textMuted}
          />
        </Pressable>
      </View>

      {loading ? (
        <LoadingState label={t("catalog.loading")} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => router.back()} />
      ) : item ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <SmartImage source={item.image_url} style={styles.heroImage} accessibilityLabel={item.name ?? undefined} />
            </View>

          <View style={styles.body}>
            <Text style={styles.name}>{item.name}</Text>
            {item.brand ? <Text style={styles.brand}>{item.brand}</Text> : null}
            {item.description ? (
              <Text style={styles.description}>{item.description}</Text>
            ) : null}

            <MetaList
              title={t("catalog.meta.category")}
              values={[item.category, item.subcategory].filter(Boolean) as string[]}
              translatePrefix="category"
            />
            <MetaList title={t("catalog.meta.style")} values={item.style ? [item.style] : []} />
            <MetaList title={t("catalog.meta.colors")} values={item.color} />
            <MetaList title={t("catalog.meta.sizes")} values={item.sizes} />
            <MetaList title={t("catalog.meta.occasions")} values={item.occasion} translatePrefix="occasion" />

            <Pressable accessibilityRole="button" style={styles.tryonBtn} onPress={tryItOn}>
              <Ionicons name="sparkles-outline" size={18} color={theme.colors.onBrand} />
              <Text style={styles.tryonBtnText}>{t("catalog.action.try_on")}</Text>
            </Pressable>
            <Text style={styles.tryonHint}>
              {t("catalog.try_on_hint")}
            </Text>
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

function MetaList({
  title,
  values,
  translatePrefix,
}: {
  title: string;
  values: string[];
  translatePrefix?: string;
}) {
  const styles = useStyles();
  const { tl } = useT();
  if (!values.length) return null;
  return (
    <View style={styles.metaBlock}>
      <Text style={styles.metaTitle}>{title}</Text>
      <View style={styles.metaChips}>
        {values.map((v) => (
          <View key={v} style={styles.metaChip}>
            <Text style={styles.metaChipText}>{translatePrefix ? tl(translatePrefix, v) : v}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  navBtn: { padding: 6 },
  navTitle: { fontSize: 15, fontWeight: "700", color: theme.colors.text },
  content: { paddingBottom: 40 },
  hero: { position: "relative" },
  heroImage: { width: "100%", aspectRatio: 0.8, backgroundColor: theme.colors.primaryMuted },
  body: { padding: 16, gap: 14 },
  name: { fontSize: 22, fontWeight: "700", color: theme.colors.text, letterSpacing: -0.3 },
  brand: { fontSize: 13, color: theme.colors.textMuted, marginTop: -8 },
  description: { fontSize: 14, color: theme.colors.text, lineHeight: 20 },
  metaBlock: { gap: 6 },
  metaTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: theme.colors.textMuted },
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
    backgroundColor: theme.colors.brand,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 15,
    marginTop: 4,
  },
  tryonBtnText: { color: theme.colors.onBrand, fontWeight: "600", fontSize: 15 },
  tryonHint: { fontSize: 11.5, color: theme.colors.textMuted, textAlign: "center" },
}));