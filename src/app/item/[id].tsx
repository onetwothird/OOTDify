// C:\OOTDify\src\app\item\[id].tsx
// Wardrobe item detail: full metadata, favorite, edit, delete, and hand-off to
// the virtual try-on (Create) tab. Real row from clothing_items — owner only.
import { Ionicons } from "@expo/vector-icons";
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
import { garmentFit } from "../../features/tryon/ar/overlayGeometry";
import { useLiveGarment } from "../../features/tryon/ar/liveGarmentStore";
import { PHOTO_TRYON_AVAILABLE } from "../../features/tryon/config";
import { useTryOnSelection } from "../../features/tryon/selectionStore";
import { useWardrobeStore } from "../../features/wardrobe/store";
import { AppButton } from "../../shared/components/AppButton";
import { EmptyState, ErrorState } from "../../shared/components/StateViews";
import { LoadingState } from "../../shared/components/LoadingState";
import { SmartImage } from "../../shared/components/SmartImage";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";

export default function ItemDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useStyles();
  const theme = useAppTheme();
  const { t, tl } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const setClothing = useTryOnSelection((s) => s.setClothing);

  const storeItems = useWardrobeStore((s) => s.items);
  const [item, setItem] = useState<ClothingItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fav, setFav] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

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
        // Prefer the in-memory store; fall back to a server fetch when stale.
        let found = storeItems.find((i) => i.id === id) ?? null;
        if (!found) {
          const all = await fetchMyCloset();
          found = all.find((i) => i.id === id) ?? null;
        }
        if (!alive) return;
        if (!found) {
          setError(t("item.not_found"));
        } else {
          setItem(found);
          const favs = await fetchItemFavoriteIds().catch(() => new Set<string>());
          if (alive) setFav(favs.has(found.id));
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : t("item.error.load"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, storeItems, t]);

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
      t("item.delete_confirm.title"),
      t("item.delete_confirm.message"),
      [
        { text: t("item.delete_confirm.cancel"), style: "cancel" },
        {
          text: t("item.delete_confirm.confirm"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await useWardrobeStore.getState().removeItem(item.id);
                router.back();
              } catch (e) {
                Alert.alert(
                  t("item.delete_error.title"),
                  e instanceof Error ? e.message : t("item.delete_error.message"),
                );
              }
            })();
          },
        },
      ],
    );
  }, [item, router, t]);

  const meta = useMemo(() => {
    if (!item) return [] as { k: string; v: string }[];
    const out: { k: string; v: string }[] = [];
    if (item.category) out.push({ k: t("item.meta.category"), v: tl("category", item.category) });
    if (item.color) out.push({ k: t("item.meta.color"), v: item.color });
    if (item.size) out.push({ k: t("item.meta.size"), v: item.size });
    if (item.brand) out.push({ k: t("item.meta.brand"), v: item.brand });
    if (item.style) out.push({ k: t("item.meta.style"), v: item.style });
    if (item.season) out.push({ k: t("item.meta.season"), v: tl("season", item.season) });
    if ((item.occasion ?? []).length)
      out.push({ k: t("item.meta.occasions"), v: item.occasion.map((o) => tl("occasion", o)).join(", ") });
    return out;
  }, [item, t, tl]);

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
        <ErrorState message={error ?? t("item.not_found_title")} onRetry={() => router.back()} />
      </View>
    );
  }

  // The live preview needs an image and a category it knows how to place.
  const canTryLive = !!item.image_url && garmentFit(item.category, []).kind !== "unsupported";

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Back */}
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("item.back_a11y")}
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
          <SmartImage
            source={item.image_url}
            style={styles.hero}
            fallbackIcon="shirt-outline"
            accessibilityLabel={item.name ?? undefined}
          />
        </View>

        {/* Title */}
        <Text style={styles.name} testID="item-name">
          {item.name || (item.category ? tl("category", item.category) : t("item.untitled"))}
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
            title={t("item.empty.title")}
            message={t("item.empty.message")}
          />
        )}

        {/* Actions */}
        <View style={styles.actions}>
          {PHOTO_TRYON_AVAILABLE ? (
            <AppButton
              label={t("item.action.try_on")}
              icon="sparkles-outline"
              onPress={() => {
                setClothing(item.id, "item");
                router.push("/(tabs)/scan");
              }}
            />
          ) : null}
          {canTryLive ? (
            <AppButton
              label={t("scan.tryon.live")}
              icon="body-outline"
              variant={PHOTO_TRYON_AVAILABLE ? "secondary" : undefined}
              onPress={() => {
                useLiveGarment.getState().set({
                  imageRef: item.image_url ?? "",
                  category: item.category,
                  name: item.name || t("scan.item_fallback"),
                });
                router.push("/tryon/live");
              }}
            />
          ) : null}
          <AppButton
            label={t("item.action.edit")}
            variant="secondary"
            icon="create-outline"
            onPress={() => setEditOpen(true)}
          />
          <Pressable accessibilityRole="button" onPress={confirmDelete} style={styles.deleteBtn}>
            <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
            <Text style={styles.deleteText}>{t("item.action.delete")}</Text>
          </Pressable>
        </View>

        <Text style={styles.privacyNote}>
          {t("item.privacy_note")}
        </Text>
      </ScrollView>

      {/* Mounted only while open: the modal's `visible` is true on mount, and
          unmounting on close resets the form for the next edit. */}
      {editOpen ? (
        <EditClothingModal item={item} onClose={() => setEditOpen(false)} />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
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
}));