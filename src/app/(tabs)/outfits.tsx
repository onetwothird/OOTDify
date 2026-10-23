// C:\OOTDIFY\src\app\(tabs)\outfits.tsx
// Outfits: your saved outfits (real rows from saved_outfits) + a builder that
// asks the server for real catalog recommendations, composes a deterministic
// outfit, and persists it. No mock looks, no hardcoded content.
//
// Header: the `Build` and `AI Picker` buttons have been moved to a persistent
// bottom action bar so they are always accessible and never get lost at the
// top of a long list. The screen title is still shown in the chrome header.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CatalogItem, OCCASIONS } from "../../features/clothing/types";
import {
  deleteSavedOutfit,
  fetchCatalog,
  fetchSavedOutfits,
  insertSavedOutfit,
  SavedOutfit,
} from "../../features/clothing/service";
import { generateOutfit } from "../../features/outfit/generator";
import { Outfit } from "../../features/outfit/types";
import { OutfitCalendar } from "../../features/outfit/components/OutfitCalendar";
import { AppButton } from "../../shared/components/AppButton";
import { Chip } from "../../shared/components/Chip";
import { ClothingCard } from "../../shared/components/ClothingCard";
import { EmptyState, ErrorState } from "../../shared/components/StateViews";
import { SkeletonGrid } from "../../shared/components/LoadingState";
import { ScreenHeader } from "../../shared/components/ScreenHeader";
import { SectionHeader } from "../../shared/components/SectionHeader";
import { toast } from "../../shared/lib/toast";
import { recommendCatalog } from "../../services/aiApi";
import { theme } from "../../shared/config/theme";

const CONDITIONS = [
  { label: "Sunny", tempC: 28 },
  { label: "Mild", tempC: 18 },
  { label: "Rainy", tempC: 12 },
  { label: "Cold", tempC: 4 },
] as const;

export default function OutfitsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: winWidth } = useWindowDimensions();
  // Two-column grid, one column on very narrow screens (<360dp content width).
  const gridCardWidth =
    winWidth - 16 * 2 < 360 ? winWidth - 16 * 2 : (winWidth - 16 * 2 - 10) / 2;

  // Deep link support: Home's "Today's look" card opens the calendar directly.
  const { view: viewParam } = useLocalSearchParams<{ view?: string }>();
  const requestedView = typeof viewParam === "string" ? viewParam : undefined;

  const [saved, setSaved] = useState<SavedOutfit[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedError, setSavedError] = useState<string | null>(null);
  // clothing_id -> real catalog row, so saved outfits can show item thumbnails.
  const [catalogById, setCatalogById] = useState<Record<string, CatalogItem>>({});

  // Builder state
  const [builderMode, setBuilderMode] = useState(false);
  const [view, setView] = useState<"looks" | "calendar">("looks");
  const [looksView, setLooksView] = useState<"list" | "grid">("list");

  // Honour a `view=calendar` deep link without a setState-in-effect: adjust
  // state during render when the param changes (React's documented pattern,
  // used elsewhere in this codebase).
  const [prevViewParam, setPrevViewParam] = useState(requestedView);
  if (requestedView !== prevViewParam) {
    setPrevViewParam(requestedView);
    if (requestedView === "calendar") setView("calendar");
  }
  const [occasion, setOccasion] = useState<string>("Casual");
  const [condition, setCondition] = useState<(typeof CONDITIONS)[number]>(CONDITIONS[0]);
  const [pool, setPool] = useState<CatalogItem[]>([]);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [outfit, setOutfit] = useState<Outfit | null>(null);
  const [saving, setSaving] = useState(false);

  // Core loader — effect-safe (no synchronous setState); state starts as loading.
  const fetchSavedRows = useCallback(async () => {
    try {
      setSaved(await fetchSavedOutfits());
    } catch (e) {
      setSavedError(e instanceof Error ? e.message : "Could not load saved outfits.");
    } finally {
      setSavedLoading(false);
    }
  }, []);

  // Handler-facing wrapper: show the spinner and clear the previous error.
  const loadSaved = useCallback(async () => {
    setSavedLoading(true);
    setSavedError(null);
    await fetchSavedRows();
  }, [fetchSavedRows]);

  useEffect(() => {
    // Microtask kick-off: no setState runs synchronously within the effect
    // body; the loader only sets state after its awaits.
    Promise.resolve()
      .then(() => fetchSavedRows())
      .catch(() => {});
  }, [fetchSavedRows]);

  // Hydrate the real catalog rows referenced by saved outfits so each look can
  // show its actual item thumbnails. Failures are non-fatal: rows fall back to
  // the icon when the catalog lookup fails — nothing is faked.
  useEffect(() => {
    const ids = Array.from(new Set(saved.flatMap((o) => o.clothing_ids ?? [])));
    if (!ids.length) return;
    let cancelled = false;
    void (async () => {
      try {
        const items = await fetchCatalog({ ids, limit: ids.length });
        if (cancelled) return;
        const map: Record<string, CatalogItem> = {};
        for (const item of items) map[item.id] = item;
        setCatalogById((prev) => ({ ...prev, ...map }));
      } catch {
        // Non-fatal: saved looks still render with the fallback icon.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [saved]);

  const build = async () => {
    setBuilding(true);
    setBuildError(null);
    setOutfit(null);
    try {
      const { recommendations } = await recommendCatalog({
        occasion,
        limit: 14,
      });
      const next = generateOutfit(recommendations, {
        occasion,
        weather: {
          tempC: condition.tempC,
          condition: condition.label.toLowerCase(),
        },
        seed: Math.floor(Date.now() / 60000), // changes at most once a minute
      });
      if (!next) {
        setBuildError("The catalog didn't return any items for this occasion.");
      } else {
        setPool(recommendations);
        setOutfit(next);
      }
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : "Could not build an outfit.");
    } finally {
      setBuilding(false);
    }
  };

  const saveOutfit = async () => {
    if (!outfit) return;
    setSaving(true);
    try {
      const clothingIds = outfit.items
        .filter((e) => e.source === "catalog")
        .map((e) => e.id);
      if (!clothingIds.length) {
        toast.info("Nothing to save", "This outfit has no catalog items to save.");
        setSaving(false);
        return;
      }
      const saved = await insertSavedOutfit({
        name: outfit.occasion
          ? `${outfit.occasion} look`
          : `Outfit ${new Date().toLocaleDateString()}`,
        occasion: outfit.occasion ?? null,
        clothing_ids: clothingIds,
        try_on_id: null,
      });
      setOutfit(null);
      setBuilderMode(false);
      await loadSaved();
      toast.success("Outfit saved", "Added to your saved outfits.", {
        label: "View",
        onPress: () => router.push(`/outfit/${saved.id}`),
      });
    } catch (e) {
      toast.error(
        "Could not save",
        e instanceof Error ? e.message : "Something went wrong while saving.",
      );
    } finally {
      setSaving(false);
    }
  };

  const removeOutfit = (outfitId: string) => {
    Alert.alert("Delete outfit?", "This removes the saved outfit from your account.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteSavedOutfit(outfitId);
              setSaved((prev) => prev.filter((o) => o.id !== outfitId));
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
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ------------------------------------------------ Chrome header */}
        <ScreenHeader
          title={view === "calendar" ? "Plan a look" : "Outfits"}
          subtitle={
            view === "calendar"
              ? "Plan which look to wear each day."
              : "Looks you've built and saved."
          }
          // No right-actions here anymore — Build/AI Picker are in the persistent
          // bottom action bar so they are always accessible.
        />

        {/* ------------------------------------------------ Builder mode */}
        {builderMode ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to saved outfits"
            onPress={() => setBuilderMode(false)}
            hitSlop={8}
            style={({ pressed }) => [styles.builderBack, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="chevron-back" size={18} color={theme.colors.primary} />
            <Text style={styles.builderBackText}>Saved outfits</Text>
          </Pressable>
        ) : null}

        {/* ------------------------------------------------ Saved / calendar views */}
        {view === "looks" ? (
          <>
            {/* ------------------------------------------------ Section header */}
            <SectionHeader
              title="Your outfits"
              subtitle="Saved looks and build options"
            />

            {/* ------------------------------------------------ Saved grid/list */}
            {savedLoading ? (
              <SkeletonGrid />
            ) : savedError ? (
              <ErrorState
                message={savedError}
                onRetry={() => void loadSaved()}
              />
            ) : saved.length === 0 ? (
              <EmptyState
                icon="folder-outline"
                title="No saved outfits yet"
                message="Build your first outfit using the action bar below."
                compact
              />
            ) : (
              <View style={styles.outfitGrid}>
                {saved.slice(0, 16).map((o) => {
                  const firstId = o.clothing_ids?.find(Boolean) ?? "";
                  const thumb = catalogById[firstId] ?? null;
                  return (
                    <ClothingCard
                      key={o.id}
                      item={thumb ?? { id: firstId, name: "Untitled" }}
                      width={gridCardWidth}
                      favorited={false}
                      onPress={() => router.push(`/outfit/${o.id}`)}
                      onToggleFavorite={() => {}}
                    />
                  );
                })}
              </View>
            )}

            {/* ------------------------------------------------ Builder CTA */}
            <View style={styles.builderCta}>
              <AppButton
                label={building ? "Building…" : "Build outfit"}
                icon="shirt-outline"
                onPress={() => void build()}
                loading={building}
                disabled={building}
                style={styles.buildButton}
              />
              <AppButton
                label="AI Picker"
                icon="sparkles-outline"
                onPress={() => router.push("/ai-picker")}
                size="md"
                variant="secondary"
                style={styles.aiPickerButton}
              />
            </View>
          </>
        ) : view === "calendar" ? (
          <OutfitCalendar
            outfits={saved}
            onOpenOutfit={(id) => router.push(`/outfit/${id}`)}
          />
        ) : null}

        {/* ------------------------------------------------ Empty state for looks */}
        {view === "looks" && saved.length === 0 && !builderMode ? (
          <EmptyState
            icon="sparkles-outline"
            title="No saved outfits yet"
            message="Build your first outfit using the action bar below."
            compact
          />
        ) : null}
      </ScrollView>

      {/* ------------------------------------------------ Persistent bottom action bar */}
      <View style={styles.actionBar}>
        <View style={styles.actionBarLeft}>
          {builderMode ? null : (
            <AppButton
              label="Build outfit"
              icon="add-circle-outline"
              onPress={() => setBuilderMode(true)}
              style={styles.actionBarButton}
            />
          )}
          {builderMode ? null : (
            <AppButton
              label="AI Picker"
              icon="sparkles-outline"
              onPress={() => router.push("/ai-picker")}
              style={styles.actionBarButton}
            />
          )}
        </View>
        <View style={styles.actionBarRight}>
          {builderMode ? (
            <AppButton
              label="Done"
              icon="checkmark-circle"
              onPress={() => setBuilderMode(false)}
              style={styles.actionBarButton}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  // Header is now minimal — just the title/subtitle, no right-actions.
  // The Build/AI Picker buttons live in the persistent bottom action bar.
  builderBack: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceAlt,
  },
  builderBackText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.text,
  },
  // Builder CTA when in builder mode (above the grid)
  builderCta: {
    flexDirection: "row",
    gap: 12,
    margin: 12,
    padding: 12,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
  },
  // Action bar styles
  actionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: insets.bottom + 8,
    backgroundColor: theme.colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    justifyContent: "space-between",
    zIndex: 100,
  },
  actionBarLeft: { flex: 1 },
  actionBarRight: { flex: 1, textAlign: "right" },
  actionBarButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
  },
  // Outfit grid
  outfitGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "flex-start",
  buildButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
  },
  aiPickerButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },