// C:\OOTDify\src\app\ai-picker.tsx
// AI Outfit Picker: asks the backend for complete looks composed from the real
// catalog (POST /api/outfits → services/outfit_service.py) and lets the user
// save any look to their account.
//
// Real data only: every item shown is a catalog row the server returned. When
// the backend is down we say so honestly and offer a retry — we never invent a
// look. Weather is passed through so hot days drop heavy layers and cold days
// add one.
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

import { insertSavedOutfit } from "../features/clothing/service";
import { OCCASIONS } from "../features/clothing/types";
import { AppButton } from "../shared/components/AppButton";
import { Chip } from "../shared/components/Chip";
import { ClothingCard } from "../shared/components/ClothingCard";
import { EmptyState, ErrorState } from "../shared/components/StateViews";
import { SectionHeader } from "../shared/components/SectionHeader";
import { Skeleton } from "../shared/components/Skeleton";
import { theme } from "../shared/config/theme";
import {
  ApiError,
  ComposedOutfit,
  composeOutfits,
  OutfitsResult,
} from "../services/aiApi";

const CONDITIONS = [
  { label: "Sunny", tempC: 28, hint: "Hot — light layers" },
  { label: "Mild", tempC: 18, hint: "Comfortable" },
  { label: "Rainy", tempC: 12, hint: "Cool + wet" },
  { label: "Cold", tempC: 4, hint: "Layer up" },
] as const;

type Condition = (typeof CONDITIONS)[number];
type GenderChoice = "all" | "men" | "women";

const GENDERS: { key: GenderChoice; label: string }[] = [
  { key: "all", label: "Everyone" },
  { key: "men", label: "Men" },
  { key: "women", label: "Women" },
];

const LOOK_COUNT = 3;

export default function AiPickerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [occasion, setOccasion] = useState<string>("Casual");
  const [condition, setCondition] = useState<Condition>(CONDITIONS[1]);
  const [gender, setGender] = useState<GenderChoice>("all");

  const [result, setResult] = useState<OutfitsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Core composer — effect-safe (no synchronous setState); state starts as loading.
  // Re-compose whenever the user changes occasion / weather / gender.
  const runGenerate = useCallback(
    async (seed?: number) => {
      try {
        const res = await composeOutfits({
          occasion,
          count: LOOK_COUNT,
          weather: { tempC: condition.tempC, condition: condition.label.toLowerCase() },
          gender: gender === "all" ? undefined : gender,
          seed: seed ?? Math.floor(Date.now() / 60000),
        });
        setResult(res);
      } catch (e) {
        setError(
          e instanceof ApiError
            ? e
            : new ApiError("unknown", "Something went wrong. Please try again.", 0, e),
        );
      } finally {
        setLoading(false);
      }
    },
    [occasion, condition, gender],
  );

  // Handler-facing wrapper (shuffle / retry): show the spinner first.
  const generate = useCallback(
    async (seed?: number) => {
      setLoading(true);
      setError(null);
      await runGenerate(seed);
    },
    [runGenerate],
  );

  // Reset loading/error during render when the inputs change — React's
  // documented alternative to a synchronous setState inside an effect.
  const genKey = `${occasion}|${condition.label}|${gender}`;
  const [prevGenKey, setPrevGenKey] = useState(genKey);
  if (prevGenKey !== genKey) {
    setPrevGenKey(genKey);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    // Microtask kick-off: no setState runs synchronously within the effect
    // body; the composer only sets state after its await.
    Promise.resolve()
      .then(() => runGenerate())
      .catch(() => {});
  }, [runGenerate]);

  const saveLook = useCallback(
    async (outfit: ComposedOutfit) => {
      const clothingIds = outfit.items.map((i) => i.id);
      if (!clothingIds.length) {
        Alert.alert("Nothing to save", "This look has no catalog items to save.");
        return;
      }
      setSavingId(outfit.id);
      try {
        const saved = await insertSavedOutfit({
          name: outfit.occasion ? `${outfit.occasion} look` : "AI look",
          occasion: outfit.occasion,
          clothing_ids: clothingIds,
          try_on_id: null,
        });
        Alert.alert("Look saved", "Added to your saved outfits.", [
          { text: "View", onPress: () => router.push(`/outfit/${saved.id}`) },
          { text: "OK" },
        ]);
      } catch (e) {
        Alert.alert(
          "Could not save",
          e instanceof Error ? e.message : "Something went wrong while saving.",
        );
      } finally {
        setSavingId(null);
      }
    },
    [router],
  );

  const openItem = useCallback(
    (id: string) => router.push(`/catalog/${id}`),
    [router],
  );

  const outfits = result?.outfits ?? [];
  const pool = result?.pool ?? 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* -------------------------------- Header */}
        <View style={styles.headerRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
            onPress={() => router.back()}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
          </Pressable>
          <View style={styles.headerBlock}>
            <Text style={styles.headerTitle}>AI Outfit Picker</Text>
            <Text style={styles.headerSubtitle}>
              Complete looks, composed from real catalog pieces.
            </Text>
          </View>
        </View>

        {/* -------------------------------- Controls */}
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

        <Text style={styles.sectionLabel}>WEATHER</Text>
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
        <Text style={styles.conditionHint}>{condition.hint}</Text>

        <Text style={styles.sectionLabel}>STYLE FOR</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {GENDERS.map((g) => (
            <Chip
              key={g.key}
              label={g.label}
              active={g.key === gender}
              onPress={() => setGender(g.key)}
            />
          ))}
        </ScrollView>

        <View style={styles.actionRow}>
          <AppButton
            label={loading ? "Composing…" : "Re-compose"}
            icon="sparkles-outline"
            loading={loading}
            onPress={() => void generate(Math.floor(Math.random() * 1_000_000))}
            style={styles.flex}
          />
        </View>

        {/* -------------------------------- Results */}
        <SectionHeader
          title="Your looks"
          subtitle={
            pool > 0
              ? `Composed from ${pool} catalog pieces for “${occasion}”.`
              : "Server-composed looks from the live catalog."
          }
        />

        {loading && outfits.length === 0 ? (
          <View style={styles.lookList}>
            {[0, 1].map((i) => (
              <View key={i} style={styles.lookCard}>
                <Skeleton width={140} height={24} radius={8} />
                <View style={styles.lookItems}>
                  {[0, 1, 2].map((j) => (
                    <Skeleton key={j} width={132} height={176} radius={theme.borderRadius.md} />
                  ))}
                </View>
              </View>
            ))}
          </View>
        ) : error ? (
          <ErrorState message={error.message} onRetry={() => void generate()} />
        ) : outfits.length === 0 ? (
          <EmptyState
            icon="shirt-outline"
            title={pool === 0 ? "The catalog is empty" : "No looks for this combination"}
            message={
              pool === 0
                ? "Run the ingestion script to fill the catalog with real clothing, then come back."
                : "Try a different occasion or weather."
            }
            actionLabel="Try again"
            onAction={() => void generate()}
          />
        ) : (
          <View style={styles.lookList}>
            {outfits.map((outfit) => (
              <LookCard
                key={outfit.id}
                outfit={outfit}
                saving={savingId === outfit.id}
                onSave={() => void saveLook(outfit)}
                onOpenItem={openItem}
              />
            ))}
          </View>
        )}

        <Text style={styles.footnote}>
          Looks are composed server-side from the shared catalog. Every piece is a
          real product row — nothing is fabricated. If the AI service is offline,
          generation fails honestly instead of guessing.
        </Text>
      </ScrollView>
    </View>
  );
}

function LookCard({
  outfit,
  saving,
  onSave,
  onOpenItem,
}: {
  outfit: ComposedOutfit;
  saving: boolean;
  onSave: () => void;
  onOpenItem: (id: string) => void;
}) {
  return (
    <View style={styles.lookCard}>
      <View style={styles.lookTopRow}>
        <View style={styles.lookTitleBlock}>
          <Text style={styles.lookTitle} numberOfLines={1}>
            {outfit.occasion ?? "Look"} · {outfit.items.length} pieces
          </Text>
          <Text style={styles.lookReason} numberOfLines={2}>
            {outfit.reason}
          </Text>
        </View>
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreValue}>{outfit.score}</Text>
          <Text style={styles.scoreMax}>/100</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.lookItems}
      >
        {outfit.items.map((item) => (
          <ClothingCard
            key={item.id}
            item={item}
            width={132}
            onPress={() => onOpenItem(item.id)}
          />
        ))}
      </ScrollView>

      {outfit.missing.length > 0 ? (
        <View style={styles.missingRow}>
          <Ionicons name="information-circle-outline" size={14} color={theme.colors.textMuted} />
          <Text style={styles.missingText}>
            Catalog has no {outfit.missing.join(", ")} to complete this look yet.
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={onSave}
        disabled={saving}
        style={({ pressed }) => [
          styles.saveBtn,
          pressed && !saving && { opacity: 0.9 },
          saving && styles.saveBtnDisabled,
        ]}
      >
        {saving ? (
          <ActivityIndicator color="#FFF" size="small" />
        ) : (
          <>
            <Ionicons name="bookmark-outline" size={16} color="#FFF" />
            <Text style={styles.saveBtnText}>Save this look</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingHorizontal: theme.spacing.page, paddingBottom: 48 },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: theme.spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBlock: { flex: 1, minWidth: 0 },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: theme.colors.text,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginTop: 2,
    lineHeight: 18,
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: theme.colors.textMuted,
    marginTop: 16,
    marginBottom: 8,
  },
  chips: { gap: 8, paddingRight: 16 },
  conditionHint: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 6,
  },

  actionRow: { flexDirection: "row", marginTop: 20 },
  flex: { flex: 1 },

  lookList: { gap: 16 },
  lookCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 14,
    gap: 12,
  },
  lookTopRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  lookTitleBlock: { flex: 1, minWidth: 0 },
  lookTitle: { fontSize: 15, fontWeight: "800", color: theme.colors.text },
  lookReason: { fontSize: 12.5, color: theme.colors.textMuted, marginTop: 3, lineHeight: 18 },
  scoreBadge: {
    flexDirection: "row",
    alignItems: "baseline",
    backgroundColor: theme.colors.primaryMuted,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  scoreValue: { fontSize: 18, fontWeight: "800", color: theme.colors.primary },
  scoreMax: { fontSize: 11, fontWeight: "700", color: theme.colors.textMuted },

  lookItems: { gap: 10, paddingRight: 8 },

  missingRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  missingText: { flex: 1, fontSize: 11.5, color: theme.colors.textMuted, lineHeight: 16 },

  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 13,
    minHeight: 46,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },

  footnote: {
    fontSize: 11,
    color: theme.colors.textMuted,
    lineHeight: 16,
    marginTop: 20,
  },
});
