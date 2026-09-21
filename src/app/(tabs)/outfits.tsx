// C:\OOTDify\src\app\(tabs)\outfits.tsx
// Outfits: your saved outfits (real rows from saved_outfits) + a builder that
// asks the server for real catalog recommendations, composes a deterministic
// outfit, and persists it. No mock looks, no hardcoded content.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OCCASIONS } from "../../features/clothing/types";
import {
  deleteSavedOutfit,
  fetchSavedOutfits,
  insertSavedOutfit,
  SavedOutfit,
} from "../../features/clothing/service";
import { generateOutfit } from "../../features/outfit/generator";
import { Outfit } from "../../features/outfit/types";
import { CatalogItem } from "../../features/clothing/types";
import { AppButton } from "../../shared/components/AppButton";
import { Chip } from "../../shared/components/Chip";
import { ClothingCard } from "../../shared/components/ClothingCard";
import { EmptyState, ErrorState } from "../../shared/components/StateViews";
import { LoadingState } from "../../shared/components/LoadingState";
import { ScreenHeader } from "../../shared/components/ScreenHeader";
import { SectionHeader } from "../../shared/components/SectionHeader";
import { theme } from "../../shared/config/theme";
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

  const [saved, setSaved] = useState<SavedOutfit[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedError, setSavedError] = useState<string | null>(null);

  // Builder state
  const [builderMode, setBuilderMode] = useState(false);
  const [occasion, setOccasion] = useState<string>("Casual");
  const [condition, setCondition] = useState<(typeof CONDITIONS)[number]>(CONDITIONS[0]);
  const [pool, setPool] = useState<CatalogItem[]>([]);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [outfit, setOutfit] = useState<Outfit | null>(null);
  const [saving, setSaving] = useState(false);

  const loadSaved = useCallback(async () => {
    setSavedLoading(true);
    setSavedError(null);
    try {
      setSaved(await fetchSavedOutfits());
    } catch (e) {
      setSavedError(e instanceof Error ? e.message : "Could not load saved outfits.");
    } finally {
      setSavedLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);

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
        Alert.alert("Nothing to save", "This outfit has no catalog items to save.");
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
      Alert.alert("Outfit saved", "Added to your saved outfits.", [
        {
          text: "View",
          onPress: () => router.push(`/outfit/${saved.id}`),
        },
        { text: "OK" },
      ]);
    } catch (e) {
      Alert.alert(
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
        <ScreenHeader
          title="Outfits"
          subtitle={
            builderMode
              ? "Compose a new look from real catalog picks."
              : "Looks you've built and saved."
          }
        />

        {!builderMode ? (
          <>
            <AppButton
              label="Build a new outfit"
              icon="add-circle-outline"
              onPress={() => setBuilderMode(true)}
              style={styles.buildCta}
            />
            <SectionHeader
              title="Saved looks"
              subtitle="Outfits you've built and kept."
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
            ) : (
              saved.map((o) => (
                <SavedOutfitRow
                  key={o.id}
                  outfit={o}
                  onPress={() => router.push(`/outfit/${o.id}`)}
                  onDelete={() => removeOutfit(o.id)}
                />
              ))
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
              style={[styles.buildBtn, building && styles.btnDisabled]}
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

            <Pressable
              accessibilityRole="button"
              style={styles.backLink}
              onPress={() => setBuilderMode(false)}
            >
              <Ionicons name="arrow-back" size={16} color={theme.colors.primary} />
              <Text style={styles.backLinkText}>Back to saved outfits</Text>
            </Pressable>

            {pool.length > 0 ? (
              <Text style={styles.poolHint}>
                Pooled from {pool.length} real catalog recommendations for "
                {occasion}".
              </Text>
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function SavedOutfitRow({
  outfit,
  onPress,
  onDelete,
}: {
  outfit: SavedOutfit;
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
      <View style={styles.savedIcon}>
        <Ionicons name="shirt-outline" size={20} color={theme.colors.primary} />
      </View>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  buildCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 14,
  },
  buildCtaText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: theme.colors.textMuted,
    marginTop: 8,
  },
  chips: { gap: 8, paddingRight: 16 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  chipActive: { backgroundColor: theme.colors.primary },
  chipText: { fontSize: 13, fontWeight: "600", color: theme.colors.text },
  chipTextActive: { color: "#FFFFFF" },

  builder: { gap: 12 },
  buildBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 14,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  buildBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  btnDisabled: { opacity: 0.4 },
  errorText: { color: "#B45309", fontSize: 12.5 },
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
  backLink: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  backLinkText: { color: theme.colors.primary, fontWeight: "700", fontSize: 13 },
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
  savedIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: theme.colors.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  savedBody: { flex: 1, minWidth: 0 },
  savedName: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  savedMeta: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2 },
  savedTrash: { padding: 6 },
});