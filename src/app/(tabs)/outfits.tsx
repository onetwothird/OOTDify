// C:\OOTDify\src\app\(tabs)\outfits.tsx
// Outfits: your saved outfits (real rows from saved_outfits) + a builder that
// asks the server for real catalog recommendations, composes a deterministic
// outfit, and persists it. No mock looks, no hardcoded content.
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
import { LoadingState } from "../../shared/components/LoadingState";
import { ScreenHeader } from "../../shared/components/ScreenHeader";
import { SectionHeader } from "../../shared/components/SectionHeader";
import { theme } from "../../shared/config/theme";
import { toast } from "../../shared/lib/toast";
import { recommendCatalog } from "../../services/aiApi";

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
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
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

        <ScreenHeader
          title={builderMode ? "Build an outfit" : "Outfits"}
          subtitle={
            builderMode
              ? "Compose a new look from real catalog picks."
              : view === "calendar"
                ? "Plan which look to wear each day."
                : "Looks you've built and saved."
          }
          right={
            builderMode ? null : (
              <View style={styles.headerActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Build outfit"
                  hitSlop={6}
                  onPress={() => setBuilderMode(true)}
                  style={({ pressed }) => [styles.headerAction, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="add-circle-outline" size={20} color={theme.colors.primary} />
                  <Text style={styles.headerActionText}>Build</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="AI Picker"
                  hitSlop={6}
                  onPress={() => router.push("/ai-picker")}
                  style={({ pressed }) => [styles.headerAction, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="sparkles-outline" size={20} color={theme.colors.primary} />
                  <Text style={styles.headerActionText}>AI Picker</Text>
                </Pressable>
              </View>
            )
          }
        />

        {!builderMode ? (
          <>
            <View style={styles.segment}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: view === "looks" }}
                onPress={() => setView("looks")}
                style={[styles.segmentBtn, view === "looks" && styles.segmentBtnActive]}
              >
                <Text
                  style={[styles.segmentText, view === "looks" && styles.segmentTextActive]}
                >
                  Saved looks
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: view === "calendar" }}
                onPress={() => setView("calendar")}
                style={[styles.segmentBtn, view === "calendar" && styles.segmentBtnActive]}
              >
                <Text
                  style={[styles.segmentText, view === "calendar" && styles.segmentTextActive]}
                >
                  Calendar
                </Text>
              </Pressable>
            </View>

            {view === "calendar" ? (
              <OutfitCalendar
                outfits={saved}
                onOpenOutfit={(id) => router.push(`/outfit/${id}`)}
              />
            ) : (
              <>
                <SectionHeader
                  title="Saved looks"
                  subtitle="Outfits you've built and kept."
                  right={(
                    <View style={styles.viewToggle}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: looksView === "list" }}
                        onPress={() => setLooksView("list")}
                        style={[styles.toggleBtn, looksView === "list" && styles.toggleBtnActive]}
                      >
                        <Ionicons
                          name="list"
                          size={14}
                          color={looksView === "list" ? theme.colors.onPrimary : theme.colors.textMuted}
                        />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: looksView === "grid" }}
                        onPress={() => setLooksView("grid")}
                        style={[styles.toggleBtn, looksView === "grid" && styles.toggleBtnActive]}
                      >
                        <Ionicons
                          name="grid"
                          size={14}
                          color={looksView === "grid" ? theme.colors.onPrimary : theme.colors.textMuted}
                        />
                      </Pressable>
                    </View>
                  )}
                />

                {savedLoading ? (
                  <LoadingState label="Loading outfits" />
                ) : savedError ? (
                  <ErrorState message={savedError} onRetry={loadSaved} />
                ) : saved.length === 0 ? (
                  <EmptyState
                    icon="shirt-outline"
                    title="No saved outfits yet"
                    message="Build an outfit from the catalog and it will appear here."
                    actionLabel="Build outfit"
                    onAction={() => setBuilderMode(true)}
                  />
                ) : looksView === "list" ? (
                  saved.map((o) => (
                    <SavedOutfitRow
                      key={o.id}
                      outfit={o}
                      thumbnails={thumbnailsFor(o, catalogById)}
                      onPress={() => router.push(`/outfit/${o.id}`)}
                      onDelete={() => removeOutfit(o.id)}
                    />
                  ))
                ) : (
                  <View style={styles.gridWrap}>
                    {saved.map((o) => (
                      <SavedOutfitCard
                        key={o.id}
                        outfit={o}
                        thumbnails={thumbnailsFor(o, catalogById)}
                        width={gridCardWidth}
                        onPress={() => router.push(`/outfit/${o.id}`)}
                        onDelete={() => removeOutfit(o.id)}
                      />
                    ))}
                  </View>
                )}
              </>
            )}
          </>
        ) : (
          <View style={styles.builder}>
            <Text style={styles.sectionLabel}>OCCASION</Text>
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

            <Text style={styles.sectionLabel}>CONDITION</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {CONDITIONS.map((c) => (
                <Chip
                  key={c.label}
                  label={c.label}
                  active={c.label === condition.label}
                  onPress={() => setCondition(c)}
                />
              ))}
            </ScrollView>

            <AppButton
              label={building ? "Composing…" : "Compose outfit"}
              icon="sparkles-outline"
              loading={building}
              onPress={build}
              style={building ? styles.btnDisabled : undefined}
            />
            {buildError ? <Text style={styles.errorText}>{buildError}</Text> : null}

            {outfit ? (
              <View style={styles.outfitPreview}>
                <Text style={styles.previewTitle}>
                  {outfit.occasion ?? "Look"} · {condition.label}
                </Text>
                <Text style={styles.scoreLine}>
                  Compatibility score {outfit.score}/100
                </Text>
                <View style={styles.previewGrid}>
                  {outfit.items.map((entry) => (
                    <ClothingCard
                      key={entry.id}
                      item={entry.item}
                      width={150}
                      onPress={() =>
                        router.push(
                          entry.source === "catalog"
                            ? `/catalog/${entry.id}`
                            : "/(tabs)/discover",
                        )
                      }
                    />
                  ))}
                </View>
                <View style={styles.previewActions}>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.ghostBtn}
                    onPress={() => setOutfit(null)}
                  >
                    <Text style={styles.ghostBtnText}>Discard</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.saveBtn}
                    onPress={saveOutfit}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <Text style={styles.saveBtnText}>Save outfit</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : null}

            {pool.length > 0 ? (
              <Text style={styles.poolHint}>
                Pooled from {pool.length} real catalog recommendations for
                &ldquo;{occasion}&rdquo;.
              </Text>
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/**
 * First few real thumbnails for a saved look, in the outfit's own item order.
 * Falls back to [] when the catalog rows are unavailable.
 */
function thumbnailsFor(
  outfit: SavedOutfit,
  catalog: Record<string, CatalogItem>,
  max = 4,
): string[] {
  const urls: string[] = [];
  for (const id of outfit.clothing_ids ?? []) {
    const item = catalog[id];
    const url = item?.thumbnail_url || item?.image_url;
    if (url) urls.push(url);
    if (urls.length >= max) break;
  }
  return urls;
}

/** Row of item thumbnails for a look; falls back to the shirt icon. */
function LookThumbs({ urls, size, gap }: { urls: string[]; size: number; gap: number }) {
  if (!urls.length) {
    return (
      <View style={[styles.lookIcon, { width: size, height: size }]}>
        <Ionicons name="shirt-outline" size={Math.round(size * 0.42)} color={theme.colors.primary} />
      </View>
    );
  }
  return (
    <View style={styles.lookIcon}>
      {urls.map((url, i) => (
        <Image
          key={`${url}-${i}`}
          source={{ uri: url }}
          style={{
            width: size,
            height: size,
            borderRadius: theme.borderRadius.sm,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.colors.border,
            marginLeft: i === 0 ? 0 : -size + gap,
            zIndex: urls.length - i,
          }}
          contentFit="cover"
        />
      ))}
    </View>
  );
}

function SavedOutfitRow({
  outfit,
  thumbnails,
  onPress,
  onDelete,
}: {
  outfit: SavedOutfit;
  thumbnails?: string[];
  onPress: () => void;
  onDelete: () => void;
}) {
  const count = outfit.clothing_ids?.length ?? 0;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.savedRow, pressed && { opacity: 0.9 }]}
    >
      <LookThumbs urls={thumbnails ?? []} size={42} gap={10} />
      <View style={styles.savedBody}>
        <Text style={styles.savedName} numberOfLines={1}>
          {outfit.name || "Untitled outfit"}
        </Text>
        <Text style={styles.savedMeta} numberOfLines={1}>
          {outfit.occasion ?? "No occasion"} · {count} item{count === 1 ? "" : "s"} ·{" "}
          {new Date(outfit.created_at).toLocaleDateString()}
        </Text>
      </View>
      <Pressable accessibilityRole="button" hitSlop={8} onPress={onDelete} style={styles.savedTrash}>
        <Ionicons name="trash-outline" size={16} color={theme.colors.textMuted} />
      </Pressable>
    </Pressable>
  );
}

function SavedOutfitCard({
  outfit,
  thumbnails,
  width,
  onPress,
  onDelete,
}: {
  outfit: SavedOutfit;
  thumbnails?: string[];
  width?: number;
  onPress: () => void;
  onDelete: () => void;
}) {
  const count = outfit.clothing_ids?.length ?? 0;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.savedCard,
        width ? { width } : null,
        pressed && { opacity: 0.95 },
      ]}
    >
      <View style={styles.savedCardMedia}>
        <LookThumbs urls={thumbnails ?? []} size={64} gap={16} />
      </View>
      <View style={styles.savedCardBody}>
        <Text style={styles.savedCardName} numberOfLines={2}>
          {outfit.name || "Untitled outfit"}
        </Text>
        <Text style={styles.savedCardMeta} numberOfLines={1}>
          {outfit.occasion ?? "No occasion"} · {count} item{count === 1 ? "" : "s"}
        </Text>
        <Text style={styles.savedCardDate} numberOfLines={1}>
          {new Date(outfit.created_at).toLocaleDateString()}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        onPress={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        style={styles.savedCardTrash}
      >
        <Ionicons name="trash-outline" size={16} color={theme.colors.textMuted} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  headerActions: { flexDirection: "row", gap: 14, alignItems: "center" },
  headerAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  headerActionText: { fontSize: 12.5, fontWeight: "700", color: theme.colors.primary },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: theme.colors.textMuted,
    marginTop: 8,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.borderRadius.pill,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    borderRadius: theme.borderRadius.pill,
  },
  segmentBtnActive: { backgroundColor: theme.colors.primary },
  segmentText: { fontSize: 13, fontWeight: "700", color: theme.colors.textMuted },
  segmentTextActive: { color: theme.colors.onPrimary },
  chips: { gap: 8, paddingRight: 16 },

  builder: { gap: 12 },
  btnDisabled: { opacity: 0.4 },
  errorText: { color: theme.colors.warning, fontSize: 12.5 },
  outfitPreview: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 14,
    gap: 10,
  },
  previewTitle: { fontSize: 16, fontWeight: "800", color: theme.colors.text },
  scoreLine: { fontSize: 12, color: theme.colors.textMuted },
  previewGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  previewActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  saveBtn: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
  },
  saveBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  ghostBtn: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  ghostBtnText: { color: theme.colors.text, fontWeight: "700", fontSize: 14 },
  builderBack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    alignSelf: "flex-start",
    marginTop: 2,
    marginLeft: -4,
    paddingVertical: 6,
    paddingRight: 12,
  },
  builderBackText: { color: theme.colors.primary, fontWeight: "700", fontSize: 14 },
  poolHint: { fontSize: 11, color: theme.colors.textMuted, lineHeight: 16 },

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
  lookIcon: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.primaryMuted,
    minWidth: 42,
    minHeight: 42,
  },
  savedCardMedia: { alignItems: "center", justifyContent: "center", minHeight: 64 },
  savedBody: { flex: 1, minWidth: 0 },
  savedName: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  savedMeta: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2 },
  savedTrash: { padding: 6 },
  viewToggle: {
    flexDirection: "row",
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.borderRadius.pill,
    padding: 2,
    gap: 2,
  },
  toggleBtn: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleBtnActive: { backgroundColor: theme.colors.primary },
  gridWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
  },
  savedCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 12,
    gap: 10,
  },
  savedCardBody: { gap: 4 },
  savedCardName: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  savedCardMeta: { fontSize: 11.5, color: theme.colors.textMuted },
  savedCardDate: { fontSize: 11, color: theme.colors.textMuted },
  savedCardTrash: { position: "absolute", top: 8, right: 8, padding: 6 },
});