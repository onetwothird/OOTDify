// C:\OOTDify\src\features\outfit\OutfitsScreen.tsx
// Outfits: your saved outfits (real rows from saved_outfits) + a builder that
// asks the server for real catalog recommendations, composes a deterministic
// outfit, and persists it. No mock looks, no hardcoded content.
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCaptureModalStore } from "../../features/capture/captureModalStore";
import { OutfitPiece, pieceHref } from "../../features/clothing/pieces";
import { CatalogItem, OCCASIONS } from "../../features/clothing/types";
import {
  deleteSavedOutfit,
  fetchOutfitPieces,
  fetchSavedOutfits,
  insertSavedOutfit,
  SavedOutfit,
} from "../../features/clothing/service";
import { generateOutfit } from "../../features/outfit/generator";
import { lookThumbnails, savedLookTarget } from "../../features/outfit/savedLooks";
import { fetchDirectory } from "../../features/community/service";
import { displayName } from "../../features/community/socialService";
import { Outfit } from "../../features/outfit/types";
import { OutfitCalendar } from "../../features/outfit/components/OutfitCalendar";
import { AppButton } from "../../shared/components/AppButton";
import { Chip } from "../../shared/components/Chip";
import { ConfirmSheet } from "../../shared/components/ConfirmSheet";
import { Sheet } from "../../shared/components/Sheet";
import { SmartImage } from "../../shared/components/SmartImage";
import { ClothingCard } from "../../shared/components/ClothingCard";
import { EmptyState, ErrorState } from "../../shared/components/StateViews";
import { LoadingState } from "../../shared/components/LoadingState";
import { ScreenHeader } from "../../shared/components/ScreenHeader";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { makeStyles } from "../../shared/theme/makeStyles";
import type { Theme } from "../../shared/config/theme";
import { useT } from "../../shared/i18n/useT";
import { useHideOnScroll, useTabBarSpace } from "../../shared/navigation/useTabChrome";
import type { TranslationKey } from "../../shared/i18n/translate";
import { toast } from "../../shared/lib/toast";
import { recommendCatalog } from "../../services/aiApi";

const CONDITIONS = [
  { label: "Sunny", key: "sunny", tempC: 28 },
  { label: "Mild", key: "mild", tempC: 18 },
  { label: "Rainy", key: "rainy", tempC: 12 },
  { label: "Cold", key: "cold", tempC: 4 },
] as const;

/** The Outfits half of the Wardrobe tab; `switcher` (Closet | Outfits) sits under its header. */
export function OutfitsScreen({ switcher }: { switcher: ReactNode }) {
  // The tab bar slides away while scrolling down; content clears it at the end.
  const hideOnScroll = useHideOnScroll();
  const tabBarSpace = useTabBarSpace();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useAppTheme();
  const styles = useStyles();
  const { t, tl } = useT();
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
  const [deleteTarget, setDeleteTarget] = useState<SavedOutfit | null>(null);
  const [deleting, setDeleting] = useState(false);
  // clothing_id -> real catalog row, so saved outfits can show item thumbnails.
  const [piecesById, setPiecesById] = useState<Record<string, OutfitPiece>>({});

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
  const [closetTooSmall, setClosetTooSmall] = useState(false);
  const openCapture = useCaptureModalStore((s) => s.open);
  const [outfit, setOutfit] = useState<Outfit | null>(null);
  const [saving, setSaving] = useState(false);

  // Core loader — effect-safe (no synchronous setState); state starts as loading.
  // Names for looks saved from someone else's Discover post ("Saved from …").
  const [sourceNames, setSourceNames] = useState<Record<string, string>>({});
  const openSaved = (o: SavedOutfit) => {
    const target = savedLookTarget(o);
    if (target.kind === "post") router.push({ pathname: "/community/post/[id]", params: { id: target.id } });
    else router.push(`/outfit/${target.id}`);
  };

  const fetchSavedRows = useCallback(async () => {
    try {
      setSaved(await fetchSavedOutfits());
    } catch (e) {
      setSavedError(e instanceof Error ? e.message : t("outfits.error.load"));
    } finally {
      setSavedLoading(false);
    }
  }, [t]);

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

  useEffect(() => {
    const ids = Array.from(new Set(saved.map((o) => o.source_user_id).filter((id): id is string => !!id)));
    if (!ids.length) return;
    let cancelled = false;
    void fetchDirectory(ids)
      .then((dir) => {
        if (cancelled) return;
        const names: Record<string, string> = {};
        for (const [id, profile] of dir) names[id] = displayName(profile);
        setSourceNames((prev) => ({ ...prev, ...names }));
      })
      .catch(() => {
        // Non-fatal: the row still says it was saved from someone.
      });
    return () => {
      cancelled = true;
    };
  }, [saved]);

  // Hydrate the real pieces (closet items, or legacy catalog rows) referenced
  // by saved outfits so each look can show its actual item thumbnails.
  // Failures are non-fatal: rows fall back to the icon — nothing is faked.
  useEffect(() => {
    const ids = Array.from(new Set(saved.flatMap((o) => o.clothing_ids ?? [])));
    if (!ids.length) return;
    let cancelled = false;
    void (async () => {
      try {
        const pieces = await fetchOutfitPieces(ids);
        if (cancelled) return;
        const map: Record<string, OutfitPiece> = {};
        for (const piece of pieces) map[piece.id] = piece;
        setPiecesById((prev) => ({ ...prev, ...map }));
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
    setClosetTooSmall(false);
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
        setClosetTooSmall(true);
      } else {
        setPool(recommendations);
        setOutfit(next);
      }
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : t("outfits.builder.error.generic"));
    } finally {
      setBuilding(false);
    }
  };

  const saveOutfit = async () => {
    if (!outfit) return;
    setSaving(true);
    try {
      const clothingIds = outfit.items.map((e) => e.id);
      if (!clothingIds.length) {
        toast.info(t("outfits.toast.nothing_to_save.title"), t("outfits.toast.nothing_to_save.message"));
        setSaving(false);
        return;
      }
      const saved = await insertSavedOutfit({
        name: outfit.occasion
          ? t("home.looks.occasion_look", { occasion: outfit.occasion })
          : `Outfit ${new Date().toLocaleDateString()}`,
        occasion: outfit.occasion ?? null,
        clothing_ids: clothingIds,
        try_on_id: null,
      });
      setOutfit(null);
      setBuilderMode(false);
      await loadSaved();
      toast.success(t("outfits.toast.saved.title"), t("outfits.toast.saved.message"), {
        label: t("outfits.toast.view"),
        onPress: () => router.push(`/outfit/${saved.id}`),
      });
    } catch (e) {
      toast.error(
        t("outfits.toast.save_error.title"),
        e instanceof Error ? e.message : t("outfits.toast.save_error.message"),
      );
    } finally {
      setSaving(false);
    }
  };

  const removeOutfit = (outfitId: string) => {
    setDeleteTarget(saved.find((o) => o.id === outfitId) ?? null);
  };

  const confirmRemove = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteSavedOutfit(deleteTarget.id);
      setSaved((prev) => prev.filter((o) => o.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      toast.error(
        t("outfits.delete_error.title"),
        e instanceof Error ? e.message : t("outfits.delete_error.message"),
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabBarSpace }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        {...hideOnScroll}
      >
        {builderMode ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("outfits.builder.back_a11y")}
            onPress={() => setBuilderMode(false)}
            hitSlop={8}
            style={({ pressed }) => [styles.builderBack, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="chevron-back" size={18} color={theme.colors.brand} />
            <Text style={styles.builderBackText}>{t("outfits.builder.back")}</Text>
          </Pressable>
        ) : null}

        <ScreenHeader
          variant="tab"
          icon={builderMode ? "construct" : "layers"}
          title={builderMode ? t("outfits.builder.title") : t("outfits.title")}
          subtitle={builderMode ? t("outfits.builder.subtitle") : t("outfits.subtitle")}
        />
        {!builderMode ? switcher : null}

        {!builderMode ? (
          <>
            <View style={styles.actionRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("outfits.action.build_a11y")}
                onPress={() => setBuilderMode(true)}
                style={({ pressed }) => [
                  styles.actionTile,
                  styles.actionTilePrimary,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View style={[styles.actionIcon, styles.actionIconPrimary]}>
                  <Ionicons name="add" size={20} color={theme.colors.onFeature} />
                </View>
                <Text style={[styles.actionTitle, { color: theme.colors.onFeature }]}>
                  {t("outfits.action.build")}
                </Text>
                <Text style={[styles.actionHint, { color: theme.colors.onFeatureMuted }]}>
                  {t("outfits.action.build_hint")}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("outfits.action.ai_picker")}
                onPress={() => router.push("/ai-picker")}
                style={({ pressed }) => [styles.actionTile, pressed && { opacity: 0.85 }]}
              >
                <View style={styles.actionIcon}>
                  <Ionicons name="sparkles" size={18} color={theme.colors.text} />
                </View>
                <Text style={styles.actionTitle}>{t("outfits.action.ai_picker")}</Text>
                <Text style={styles.actionHint}>{t("outfits.action.ai_hint")}</Text>
              </Pressable>
            </View>

            {/* The content's heading is also its view switch: the view you're on
                is dark, the other one grey. Distinct from the page tabs above. */}
            <View style={styles.viewHead}>
              <View style={styles.viewTitles} accessibilityRole="tablist">
                {(["looks", "calendar"] as const).map((key) => {
                  const active = view === key;
                  return (
                    <Pressable
                      key={key}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      onPress={() => setView(key)}
                      hitSlop={6}
                    >
                      <Text style={[styles.viewTitle, active && styles.viewTitleActive]} numberOfLines={1}>
                        {key === "looks" ? t("outfits.tab.looks") : t("outfits.tab.calendar")}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {view === "looks" ? (
                <View style={styles.viewToggle}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("outfits.view.list_a11y")}
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
                    accessibilityLabel={t("outfits.view.grid_a11y")}
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
              ) : null}
            </View>
            <Text style={styles.viewSubtitle}>
              {view === "calendar" ? t("outfits.calendar.subtitle") : t("outfits.saved.subtitle")}
            </Text>

            {view === "calendar" ? (
              <OutfitCalendar
                outfits={saved}
                onOpenOutfit={(id) => router.push(`/outfit/${id}`)}
              />
            ) : (
              <>
                {savedLoading ? (
                  <LoadingState label={t("outfits.loading")} />
                ) : savedError ? (
                  <ErrorState message={savedError} onRetry={loadSaved} />
                ) : saved.length === 0 ? (
                  <EmptyState
                    icon="shirt-outline"
                    title={t("outfits.saved.empty.title")}
                    message={t("outfits.saved.empty.message")}
                    actionLabel={t("outfits.saved.empty.action")}
                    actionIcon="add"
                    onAction={() => setBuilderMode(true)}
                  />
                ) : looksView === "list" ? (
                  saved.map((o) => (
                    <SavedOutfitRow
                      key={o.id}
                      outfit={o}
                      savedFrom={o.source_post_id ? (o.source_user_id ? sourceNames[o.source_user_id] ?? "" : "") : null}
                      thumbnails={lookThumbnails(o, piecesById)}
                      onPress={() => openSaved(o)}
                      onDelete={() => removeOutfit(o.id)}
                    />
                  ))
                ) : (
                  <View style={styles.gridWrap}>
                    {saved.map((o) => (
                      <SavedOutfitCard
                        key={o.id}
                        outfit={o}
                        savedFrom={o.source_post_id ? (o.source_user_id ? sourceNames[o.source_user_id] ?? "" : "") : null}
                        thumbnails={lookThumbnails(o, piecesById)}
                        width={gridCardWidth}
                        onPress={() => openSaved(o)}
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
            <Text style={styles.sectionLabel}>{t("outfits.builder.occasion")}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {OCCASIONS.map((occ) => (
                <Chip
                  key={occ}
                  label={tl("occasion", occ)}
                  active={occ === occasion}
                  onPress={() => setOccasion(occ)}
                />
              ))}
            </ScrollView>

            <Text style={styles.sectionLabel}>{t("outfits.builder.condition")}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {CONDITIONS.map((c) => (
                <Chip
                  key={c.label}
                  label={t(`condition.${c.key}` as TranslationKey)}
                  active={c.label === condition.label}
                  onPress={() => setCondition(c)}
                />
              ))}
            </ScrollView>

            <AppButton
              label={building ? t("outfits.builder.composing") : t("outfits.builder.compose")}
              icon="sparkles-outline"
              loading={building}
              onPress={build}
              style={building ? styles.btnDisabled : undefined}
            />
            {buildError ? <Text style={styles.errorText}>{buildError}</Text> : null}

            {outfit ? (
              <View style={styles.outfitPreview}>
                <Text style={styles.previewTitle}>
                  {t("outfits.builder.preview.title", {
                    occasion: outfit.occasion ?? t("outfits.builder.preview.default_occasion"),
                    condition: t(`condition.${condition.key}` as TranslationKey),
                  })}
                </Text>
                <Text style={styles.scoreLine}>
                  {t("outfits.builder.compatibility", { score: outfit.score })}
                </Text>
                <View style={styles.previewGrid}>
                  {outfit.items.map((entry) => (
                    <ClothingCard
                      key={entry.id}
                      item={entry.item}
                      width={150}
                      onPress={() =>
                        router.push(
                          pieceHref({ id: entry.id, source: entry.source === "catalog" ? "catalog" : "closet" }),
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
                    <Text style={styles.ghostBtnText}>{t("outfits.builder.discard")}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.saveBtn}
                    onPress={saveOutfit}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator color={theme.colors.onBrand} />
                    ) : (
                      <Text style={styles.saveBtnText}>{t("outfits.builder.save")}</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : null}

            {pool.length > 0 ? (
              <Text style={styles.poolHint}>
                {t("outfits.builder.pool_hint", { count: pool.length, occasion: tl("occasion", occasion) })}
              </Text>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* Composing needs clothes: an empty closet asks for a capture first. */}
      <Sheet
        visible={closetTooSmall}
        onClose={() => setClosetTooSmall(false)}
        icon="camera-outline"
        title={t("outfits.builder.need_clothes.title")}
        scroll={false}
        footer={
          <View style={styles.needActions}>
            <AppButton
              label={t("home.action.capture")}
              icon="camera-outline"
              onPress={() => {
                setClosetTooSmall(false);
                openCapture();
              }}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => setClosetTooSmall(false)}
              style={({ pressed }) => [styles.needLater, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.needLaterText}>{t("outfits.builder.need_clothes.later")}</Text>
            </Pressable>
          </View>
        }
      >
        {/* The look's empty slots, so it's clear what the closet is missing. */}
        <View style={styles.slots}>
          {(["top", "bottom", "shoes"] as const).map((slot) => (
            <View key={slot} style={styles.slot}>
              <Ionicons name="add" size={18} color={theme.colors.textMuted} />
              <Text style={styles.slotLabel} numberOfLines={1}>
                {t(`outfits.builder.slot.${slot}`)}
              </Text>
            </View>
          ))}
        </View>
        <Text style={styles.needText}>{t("outfits.builder.error.no_items")}</Text>
      </Sheet>
      <ConfirmSheet
        visible={deleteTarget !== null}
        onClose={() => !deleting && setDeleteTarget(null)}
        icon="trash-outline"
        title={t("outfits.delete_confirm.title")}
        message={t("outfits.delete_confirm.message")}
        confirmLabel={t("outfits.delete_confirm.confirm")}
        cancelLabel={t("outfits.delete_confirm.keep")}
        busy={deleting}
        hero={
          deleteTarget?.result_url ? (
            <SmartImage source={deleteTarget.result_url} style={styles.deleteHero} accessibilityLabel={deleteTarget.name ?? ""} />
          ) : undefined
        }
        onConfirm={() => void confirmRemove()}
      />
    </View>
  );
}

/**
 * First few real thumbnails for a saved look, in the outfit's own item order.
 * Falls back to [] when the pieces are unavailable.
 */
/** Row of item thumbnails for a look; falls back to the shirt icon. */
function LookThumbs({ urls, size, gap }: { urls: string[]; size: number; gap: number }) {
  const theme = useAppTheme();
  const styles = useStyles();
  if (!urls.length) {
    return (
      <View style={[styles.lookIcon, { width: size, height: size }]}>
        <Ionicons name="shirt-outline" size={Math.round(size * 0.42)} color={theme.colors.brand} />
      </View>
    );
  }
  return (
    <View style={styles.lookIcon}>
      {urls.map((url, i) => (
        <SmartImage
          key={`${url}-${i}`}
          source={url}
          style={{
            width: size,
            height: size,
            borderRadius: theme.borderRadius.sm,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.colors.border,
            marginLeft: i === 0 ? 0 : -size + gap,
            zIndex: urls.length - i,
          }}
        />
      ))}
    </View>
  );
}

function SavedOutfitRow({
  outfit,
  savedFrom,
  thumbnails,
  onPress,
  onDelete,
}: {
  outfit: SavedOutfit;
  /** Owner's name when saved from someone's look ("" while it loads); null for my own. */
  savedFrom?: string | null;
  thumbnails?: string[];
  onPress: () => void;
  onDelete: () => void;
}) {
  const theme = useAppTheme();
  const styles = useStyles();
  const { t } = useT();
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
          {outfit.name || t("outfits.untitled")}
        </Text>
        <Text style={styles.savedMeta} numberOfLines={1}>
          {savedFrom != null
            ? savedFrom
              ? t("outfits.saved_from", { name: savedFrom })
              : t("outfits.saved_from_someone")
            : `${outfit.occasion ?? t("home.looks.no_occasion")} · ${t("home.looks.items", { count })} · ${new Date(outfit.created_at).toLocaleDateString()}`}
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
  savedFrom,
  thumbnails,
  width,
  onPress,
  onDelete,
}: {
  outfit: SavedOutfit;
  /** Owner's name when saved from someone's look ("" while it loads); null for my own. */
  savedFrom?: string | null;
  thumbnails?: string[];
  width?: number;
  onPress: () => void;
  onDelete: () => void;
}) {
  const theme = useAppTheme();
  const styles = useStyles();
  const { t } = useT();
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
          {outfit.name || t("outfits.untitled")}
        </Text>
        <Text style={styles.savedCardMeta} numberOfLines={1}>
          {savedFrom != null
            ? savedFrom
              ? t("outfits.saved_from", { name: savedFrom })
              : t("outfits.saved_from_someone")
            : `${outfit.occasion ?? t("home.looks.no_occasion")} · ${t("home.looks.items", { count })}`}
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

const useStyles = makeStyles((theme: Theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  actionRow: { flexDirection: "row", gap: 12 },
  actionTile: {
    flex: 1,
    minWidth: 0,
    padding: 14,
    gap: 3,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  actionTilePrimary: { backgroundColor: theme.colors.feature, borderColor: theme.colors.feature },
  actionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    backgroundColor: theme.colors.surfaceAlt,
  },
  actionIconPrimary: { backgroundColor: theme.colors.onFeatureSubtle },
  actionTitle: { fontSize: 15, fontWeight: "700", color: theme.colors.text },
  actionHint: { fontSize: 12, lineHeight: 16, color: theme.colors.textMuted },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    color: theme.colors.textMuted,
    marginTop: 8,
  },
  viewHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: theme.spacing.sm,
  },
  viewTitles: { flexDirection: "row", alignItems: "baseline", gap: 18, flexShrink: 1 },
  viewTitle: { fontSize: 19, fontWeight: "700", letterSpacing: -0.3, color: theme.colors.textMuted },
  viewTitleActive: { color: theme.colors.text },
  viewSubtitle: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2, marginBottom: 4 },
  chips: { gap: 8, paddingRight: 16 },

  builder: { gap: 12 },
  btnDisabled: { opacity: 0.4 },
  errorText: { color: theme.colors.warning, fontSize: 12.5 },
  slots: { flexDirection: "row", gap: 8, marginTop: 4 },
  slot: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  slotLabel: { fontSize: 12.5, fontWeight: "600", color: theme.colors.textMuted },
  needText: { fontSize: 14, color: theme.colors.textMuted, lineHeight: 20, textAlign: "center", marginTop: 14 },
  needActions: { gap: 4 },
  needLater: { alignItems: "center", paddingVertical: 12 },
  needLaterText: { fontSize: 14, fontWeight: "600", color: theme.colors.textMuted },
  outfitPreview: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 14,
    gap: 10,
  },
  previewTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.text },
  scoreLine: { fontSize: 12, color: theme.colors.textMuted },
  previewGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  previewActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  saveBtn: {
    flex: 1,
    backgroundColor: theme.colors.brand,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
  },
  saveBtnText: { color: theme.colors.onBrand, fontWeight: "600", fontSize: 14 },
  ghostBtn: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  ghostBtnText: { color: theme.colors.text, fontWeight: "600", fontSize: 14 },
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
  builderBackText: { color: theme.colors.brand, fontWeight: "600", fontSize: 14 },
  deleteHero: {
    width: 84,
    height: 112,
    borderRadius: theme.borderRadius.md,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceAlt,
  },
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
  savedName: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
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
  savedCardName: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
  savedCardMeta: { fontSize: 11.5, color: theme.colors.textMuted },
  savedCardDate: { fontSize: 11, color: theme.colors.textMuted },
  savedCardTrash: { position: "absolute", top: 8, right: 8, padding: 6 },
}));