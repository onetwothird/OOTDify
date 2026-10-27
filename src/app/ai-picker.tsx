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
import { useAppTheme } from "../shared/theme/ThemeProvider";
import { makeStyles } from "../shared/theme/makeStyles";
import type { Theme } from "../shared/config/theme";
import { useCaptureModalStore } from "../features/capture/captureModalStore";
import { pieceHref } from "../features/clothing/pieces";
import { useT } from "../shared/i18n/useT";
import type { TranslationKey } from "../shared/i18n/translate";
import { toast } from "../shared/lib/toast";
import {
  ApiError,
  ComposedOutfit,
  composeOutfits,
  OutfitsResult,
} from "../services/aiApi";

const CONDITIONS = [
  { label: "Sunny", key: "sunny", tempC: 28 },
  { label: "Mild", key: "mild", tempC: 18 },
  { label: "Rainy", key: "rainy", tempC: 12 },
  { label: "Cold", key: "cold", tempC: 4 },
] as const;

type Condition = (typeof CONDITIONS)[number];
type GenderChoice = "all" | "men" | "women";

const GENDERS: { key: GenderChoice }[] = [
  { key: "all" },
  { key: "men" },
  { key: "women" },
];

const LOOK_COUNT = 3;

export default function AiPickerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useAppTheme();
  const styles = useStyles();
  const { t, tl } = useT();

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
            : new ApiError("unknown", t("home.error.unknown"), 0, e),
        );
      } finally {
        setLoading(false);
      }
    },
    [occasion, condition, gender, t],
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
        toast.info(t("outfits.toast.nothing_to_save.title"), t("outfits.toast.nothing_to_save.message"));
        return;
      }
      setSavingId(outfit.id);
      try {
        const saved = await insertSavedOutfit({
          name: outfit.occasion ? t("home.looks.occasion_look", { occasion: outfit.occasion }) : t("ai_picker.default_name"),
          occasion: outfit.occasion,
          clothing_ids: clothingIds,
          try_on_id: null,
        });
        toast.success(t("ai_picker.toast.saved.title"), t("outfits.toast.saved.message"), {
          label: t("outfits.toast.view"),
          onPress: () => router.push(`/outfit/${saved.id}`),
        });
      } catch (e) {
        toast.error(
          t("outfits.toast.save_error.title"),
          e instanceof Error ? e.message : t("outfits.toast.save_error.message"),
        );
      } finally {
        setSavingId(null);
      }
    },
    [router, t],
  );

  const openCapture = useCaptureModalStore((s) => s.open);
  const openItem = useCallback(
    (id: string) => router.push(pieceHref({ id, source: "closet" })),
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
            accessibilityLabel={t("ai_picker.back_a11y")}
            hitSlop={8}
            onPress={() => router.back()}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
          </Pressable>
          <View style={styles.headerBlock}>
            <Text style={styles.headerTitle}>{t("ai_picker.title")}</Text>
            <Text style={styles.headerSubtitle}>
              {t("ai_picker.subtitle")}
            </Text>
          </View>
        </View>

        {/* -------------------------------- Controls */}
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

        <Text style={styles.sectionLabel}>{t("ai_picker.weather_label")}</Text>
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
        <Text style={styles.conditionHint}>{t(`condition.hint.${condition.key}` as TranslationKey)}</Text>

        <Text style={styles.sectionLabel}>{t("ai_picker.style_for_label")}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {GENDERS.map((g) => (
            <Chip
              key={g.key}
              label={
                g.key === "all"
                  ? t("ai_picker.gender.all")
                  : g.key === "men"
                    ? t("profile.gender.men")
                    : t("profile.gender.women")
              }
              active={g.key === gender}
              onPress={() => setGender(g.key)}
            />
          ))}
        </ScrollView>

        <View style={styles.actionRow}>
          <AppButton
            label={loading ? t("outfits.builder.composing") : t("ai_picker.recompose")}
            icon="sparkles-outline"
            loading={loading}
            onPress={() => void generate(Math.floor(Math.random() * 1_000_000))}
            style={styles.flex}
          />
        </View>

        {/* -------------------------------- Results */}
        <SectionHeader
          title={t("ai_picker.results_title")}
          subtitle={
            pool > 0
              ? t("ai_picker.results_subtitle_pool", { count: pool, occasion: tl("occasion", occasion) })
              : t("ai_picker.results_subtitle_empty")
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
            title={pool === 0 ? t("ai_picker.empty.title_closet") : t("ai_picker.empty.title_combo")}
            message={
              pool === 0
                ? t("ai_picker.empty.message_closet")
                : t("ai_picker.empty.message_combo")
            }
            actionLabel={pool === 0 ? t("home.action.capture") : t("ai_picker.try_again")}
            onAction={pool === 0 ? openCapture : () => void generate()}
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
          {t("ai_picker.footnote")}
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
  const theme = useAppTheme();
  const styles = useStyles();
  const { t, tl } = useT();
  return (
    <View style={styles.lookCard}>
      <View style={styles.lookTopRow}>
        <View style={styles.lookTitleBlock}>
          <Text style={styles.lookTitle} numberOfLines={1}>
            {t("ai_picker.look_title", {
              occasion: outfit.occasion ? tl("occasion", outfit.occasion) : t("outfits.builder.preview.default_occasion"),
              count: outfit.items.length,
            })}
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
            {t("ai_picker.missing_items", { list: outfit.missing.join(", ") })}
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
          <ActivityIndicator color={theme.colors.onPrimary} size="small" />
        ) : (
          <>
            <Ionicons name="bookmark-outline" size={16} color={theme.colors.onPrimary} />
            <Text style={styles.saveBtnText}>{t("ai_picker.save_look")}</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
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
    fontWeight: "700",
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
    fontWeight: "700",
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
  lookTitle: { fontSize: 15, fontWeight: "700", color: theme.colors.text },
  lookReason: { fontSize: 12.5, color: theme.colors.textMuted, marginTop: 3, lineHeight: 18 },
  scoreBadge: {
    flexDirection: "row",
    alignItems: "baseline",
    backgroundColor: theme.colors.primaryMuted,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  scoreValue: { fontSize: 18, fontWeight: "700", color: theme.colors.primary },
  scoreMax: { fontSize: 11, fontWeight: "600", color: theme.colors.textMuted },

  lookItems: { gap: 10, paddingRight: 8 },

  missingRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  missingText: { flex: 1, fontSize: 11.5, color: theme.colors.textMuted, lineHeight: 16 },

  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.brand,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 13,
    minHeight: 46,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: theme.colors.onPrimary, fontWeight: "600", fontSize: 14 },

  footnote: {
    fontSize: 11,
    color: theme.colors.textMuted,
    lineHeight: 16,
    marginTop: 20,
  },
}));
