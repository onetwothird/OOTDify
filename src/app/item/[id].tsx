// C:\OOTDify\src\app\item\[id].tsx
// Wardrobe item detail: full metadata, favorite, edit, delete, and hand-off to
// the virtual try-on (Create) tab. Real row from clothing_items — owner only.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import EditClothingModal from "../../features/capture/EditClothingModal";
import type { ClothingItem } from "../../features/clothing/types";
import {
  addItemFavorite,
  fetchItemFavoriteIds,
  fetchMyCloset,
  removeItemFavorite,
} from "../../features/clothing/service";
import { useTryOnSelection } from "../../features/tryon/selectionStore";
import { useWardrobeStore } from "../../features/wardrobe/store";
import { AppButton } from "../../shared/components/AppButton";
import { EmptyState, ErrorState } from "../../shared/components/StateViews";
import { LoadingState } from "../../shared/components/LoadingState";
import { theme } from "../../shared/config/theme";
import { resolveMediaUrl } from "../../shared/lib/storageUrl";

export default function ItemDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const setClothing = useTryOnSelection((s) => s.setClothing);

  const storeItems = useWardrobeStore((s) => s.items);
  const [item, setItem] = useState<ClothingItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fav, setFav] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        // Prefer the in-memory store; fall back to a server fetch when stale.
        let found = storeItems.find((i) => i.id === id) ?? null;
        if (!found) {
          const all = await fetchMyCloset();
          found = all.find((i) => i.id === id) ?? null;
        }
        if (!alive) return;
        if (!found) {
          setError("This item could not be found in your wardrobe.");
        } else {
          setItem(found);
          const favs = await fetchItemFavoriteIds().catch(() => new Set<string>());
          if (alive) setFav(favs.has(found.id));
          const u = await resolveMediaUrl(found.image_url, 900);
          if (alive) setUri(u);
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
  }, [id, storeItems]);

  const toggleFavorite = useCallback(async () => {
    if (!item) return;
    const next = !fav;
    setFav(next);
    try {
      if (next) await addItemFavorite(item.id);
      else await removeItemFavorite(item.id);
    } catch {
      setFav(!next);
    }
  }, [item, fav]);

  const confirmDelete = useCallback(() => {
    if (!item) return;
    Alert.alert(
      "Delete this item?",
      "It will be removed from your wardrobe. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await useWardrobeStore.getState().removeItem(item.id);
                router.back();
              } catch (e) {
                Alert.alert(
                  "Delete failed",
                  e instanceof Error ? e.message : "Could not delete this item.",
                );
              }
            })();
          },
        },
      ],
    );
  }, [item, router]);

  const meta = useMemo(() => {
    if (!item) return [] as Array<{ k: string; v: string }>;
    const out: Array<{ k: string; v: string }> = [];
    if (item.category) out.push({ k: "Category", v: item.category });
    if (item.color) out.push({ k: "Color", v: item.color });
    if (item.size) out.push({ k: "Size", v: item.size });
    if (item.brand) out.push({ k: "Brand", v: item.brand });
    if (item.style) out.push({ k: "Style", v: item.style });
    if (item.season) out.push({ k: "Season", v: item.season });
    if ((item.occasion ?? []).length) out.push({ k: "Occasions", v: item.occasion.join(", ") });
    return out;
  }, [item]);

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <LoadingState />
      </View>
    );
  }

  if (error || !item) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ErrorState message={error ?? "Item not found."} onRetry={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Back */}
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            hitSlop={8}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={toggleFavorite}
            hitSlop={8}
            style={styles.backBtn}
          >
            <Ionicons
              name={fav ? "heart" : "heart-outline"}
              size={22}
              color={fav ? theme.colors.accent : theme.colors.text}
            />
          </Pressable>
        </View>

        {/* Image */}
        <View style={styles.heroWrap}>
          {uri ? (
            <Image source={{ uri }} style={styles.hero} contentFit="cover" transition={150} />
          ) : (
            <View style={[styles.hero, styles.heroPlaceholder]}>
              <Ionicons name="shirt-outline" size={40} color={theme.colors.textMuted} />
            </View>
          )}
        </View>

        {/* Title */}
        <Text style={styles.name} testID="item-name">
          {item.name || item.category || "Untitled item"}
        </Text>
        {item.tags && item.tags.length > 0 ? (
          <Text style={styles.tags}>{item.tags.join(" · ")}</Text>
        ) : null}

        {/* Metadata */}
        {meta.length > 0 ? (
          <View style={styles.metaGrid}>
            {meta.map((m) => (
              <View key={m.k} style={styles.metaCell}>
                <Text style={styles.metaKey}>{m.k}</Text>
                <Text style={styles.metaValue} numberOfLines={2}>
                  {m.v}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <EmptyState
            icon="pricetags-outline"
            title="No details yet"
            message="Add size, color, brand and more to make your wardrobe searchable."
          />
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <AppButton
            label="Try it on"
            icon="sparkles-outline"
            onPress={() => {
              setClothing(item.id, "item");
              router.push("/(tabs)/scan");
            }}
          />
          <AppButton
            label="Edit details"
            variant="secondary"
            icon="create-outline"
            onPress={() => setEditOpen(true)}
          />
          <Pressable accessibilityRole="button" onPress={confirmDelete} style={styles.deleteBtn}>
            <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
            <Text style={styles.deleteText}>Delete item</Text>
          </Pressable>
        </View>

        <Text style={styles.privacyNote}>
          This photo is stored privately on your account and is never shared.
        </Text>
      </ScrollView>

      <EditClothingModal item={item} onClose={() => setEditOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingHorizontal: theme.spacing.page, paddingBottom: 40 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  heroWrap: {
    borderRadius: theme.borderRadius.lg,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceAlt,
    marginTop: 4,
  },
  hero: { width: "100%", aspectRatio: 0.85 },
  heroPlaceholder: { alignItems: "center", justifyContent: "center" },
  name: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: theme.colors.text,
    marginTop: 18,
  },
  tags: {
    fontSize: 12.5,
    color: theme.colors.accent,
    fontWeight: "600",
    marginTop: 4,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 16,
  },
  metaCell: {
    minWidth: "30%",
    flexGrow: 1,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 12,
  },
  metaKey: {
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: theme.colors.textMuted,
  },
  metaValue: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text,
    marginTop: 4,
  },
  actions: { gap: 10, marginTop: 24 },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  deleteText: { color: theme.colors.danger, fontWeight: "700", fontSize: 14 },
  privacyNote: {
    fontSize: 11.5,
    color: theme.colors.textMuted,
    textAlign: "center",
    marginTop: 18,
  },
});