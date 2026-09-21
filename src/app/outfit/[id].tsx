// C:\OOTDify\src\app\outfit\[id].tsx
// Saved outfit detail: pulls the real row from saved_outfits, hydrates the
// garment ids from the catalog, and shows the try-on result image (private
// bucket → signed URL) when one exists.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CatalogItem } from "../../features/clothing/types";
import {
  deleteSavedOutfit,
  fetchCatalog,
  fetchSavedOutfits,
  SavedOutfit,
} from "../../features/clothing/service";
import { ErrorState } from "../../shared/components/StateViews";
import { LoadingState } from "../../shared/components/LoadingState";
import { theme } from "../../shared/config/theme";
import { resolveMediaUrl } from "../../shared/lib/storageUrl";

export default function OutfitDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [outfit, setOutfit] = useState<SavedOutfit | null>(null);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [heroUri, setHeroUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const saved = await fetchSavedOutfits();
        const row = saved.find((o) => o.id === id) ?? null;
        if (!alive) return;
        if (!row) {
          setError("This outfit was not found.");
          setLoading(false);
          return;
        }
        setOutfit(row);
        const ids = row.clothing_ids ?? [];
        if (ids.length) {
          const { data } = await fetchCatalogish(ids);
          if (alive) setItems(data);
        }
        if (row.result_url) {
          const u = await resolveMediaUrl(row.result_url, 900);
          if (alive) setHeroUri(u);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Could not load this outfit.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const remove = () => {
    if (!outfit) return;
    Alert.alert("Delete outfit?", "This removes the outfit from your account.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteSavedOutfit(outfit.id);
              router.back();
            } catch (e) {
              Alert.alert(
                "Delete failed",
                e instanceof Error ? e.message : "Could not delete the outfit.",
              );
            }
          })();
        },
      },
    ]);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.navRow}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8} style={styles.navBtn}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.navTitle}>Saved Outfit</Text>
        <Pressable accessibilityRole="button" onPress={remove} hitSlop={8} style={styles.navBtn}>
          <Ionicons name="trash-outline" size={20} color={theme.colors.textMuted} />
        </Pressable>
      </View>

      {loading ? (
        <LoadingState label="Loading outfit" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => router.back()} />
      ) : outfit ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{outfit.name || "Untitled outfit"}</Text>
          <Text style={styles.meta}>
            {outfit.occasion ?? "No occasion"} ·{" "}
            {new Date(outfit.created_at).toLocaleDateString()}
          </Text>

          {heroUri ? (
            <View style={styles.heroWrap}>
              <Image source={{ uri: heroUri }} style={styles.heroImage} contentFit="cover" transition={150} />
              <Text style={styles.heroLabel}>Virtual try-on result</Text>
            </View>
          ) : outfit.try_on_id ? (
            <Text style={styles.missingResult}>
              This outfit was built from a try-on, but the result image is no longer
              available. The garments are listed below.
            </Text>
          ) : null}

          <Text style={styles.sectionLabel}>GARMENTS</Text>
          {items.length === 0 ? (
            <Text style={styles.emptyItems}>
              No garment details were saved with this outfit.
            </Text>
          ) : (
            items.map((it) => (
              <Pressable
                key={it.id}
                accessibilityRole="button"
                style={({ pressed }) => [styles.itemRow, pressed && { opacity: 0.9 }]}
                onPress={() => router.push(`/catalog/${it.id}`)}
              >
                <ItemThumb ref={it.image_url} />
                <View style={styles.itemBody}>
                  <Text style={styles.itemCategory}>{it.category}</Text>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {it.name}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
              </Pressable>
            ))
          )}
        </ScrollView>
      ) : null}
    </View>
  );
}

/** Fetch catalog rows by ids (public.clothing has no RLS filter issues here). */
async function fetchCatalogish(ids: string[]): Promise<{ data: CatalogItem[] }> {
  const all = await fetchCatalog({ limit: 500 });
  const byId = new Map(all.map((c) => [c.id, c]));
  const data = ids.map((i) => byId.get(i)).filter((v): v is CatalogItem => !!v);
  return { data };
}

function ItemThumb({ ref: imageRef }: { ref: string | null }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!imageRef) return;
    resolveMediaUrl(imageRef, 900).then((u) => {
      if (alive) setUri(u);
    });
    return () => {
      alive = false;
    };
  }, [imageRef]);
  return uri ? (
    <Image source={{ uri }} style={styles.itemImage} contentFit="cover" />
  ) : (
    <View style={[styles.itemImage, styles.itemImagePlaceholder]} />
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
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  title: { fontSize: 22, fontWeight: "800", color: theme.colors.text, letterSpacing: -0.3 },
  meta: { fontSize: 12.5, color: theme.colors.textMuted, marginTop: -6 },
  heroWrap: { borderRadius: theme.borderRadius.lg, overflow: "hidden" },
  heroImage: { width: "100%", aspectRatio: 0.85, backgroundColor: theme.colors.primaryMuted },
  heroLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: theme.colors.textMuted,
    marginTop: 6,
  },
  missingResult: {
    fontSize: 12.5,
    color: theme.colors.textMuted,
    lineHeight: 18,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: theme.colors.textMuted,
    marginTop: 8,
  },
  emptyItems: { fontSize: 13, color: theme.colors.textMuted },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 10,
  },
  itemImage: {
    width: 52,
    height: 62,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.primaryMuted,
  },
  itemImagePlaceholder: { backgroundColor: theme.colors.border },
  itemBody: { flex: 1, minWidth: 0 },
  itemCategory: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: theme.colors.textMuted,
  },
  itemName: { fontSize: 14, fontWeight: "700", color: theme.colors.text, marginTop: 2 },
});