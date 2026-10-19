// C:\OOTDify\src\features\outfit\components\TodayLookCard.tsx
// "Today's look" — the outfit planned for today, read from public.outfit_plans
// (owner-only via RLS). Rendered inside expo-glass-effect's GlassView on iOS 26+
// (Liquid Glass) and a plain opaque surface everywhere else, since GlassView
// degrades to a regular View off-iOS.
//
// Real data only: with nothing planned the card says so and offers the calendar
// instead of inventing a look.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { SavedOutfit } from "../../clothing/service";
import { theme } from "../../../shared/config/theme";
import { resolveMediaUrl } from "../../../shared/lib/storageUrl";
import { fetchClothingImageRefs, OutfitPlan } from "../planner";

// Static for the life of the app: either the Liquid Glass components are in the
// binary or they aren't. Used to pick the tint + fallback surface.
const LIQUID_GLASS = isLiquidGlassAvailable();

interface Props {
  /** Today's plan row, or null when nothing is planned. */
  plan: OutfitPlan | null;
  /** The saved outfit that plan points at, when it is still in the wardrobe. */
  outfit: SavedOutfit | undefined;
  /** True only until the first plan load settles. */
  loading: boolean;
  /** Set when the plan could not be read — never shown as "nothing planned". */
  error: string | null;
  onOpenOutfit: (id: string) => void;
  onPlanLook: () => void;
}

export function TodayLookCard({
  plan,
  outfit,
  loading,
  error,
  onOpenOutfit,
  onPlanLook,
}: Props) {
  const planned = Boolean(plan?.outfit_id);

  return (
    <GlassView
      glassEffectStyle="regular"
      // Force a light material so the near-black type stays readable over the
      // light hero card it sits beneath.
      tintColor={LIQUID_GLASS ? "rgba(255,255,255,0.82)" : undefined}
      colorScheme="light"
      style={[styles.card, !LIQUID_GLASS && styles.cardFallback]}
    >
      <View style={styles.head}>
        <Text style={styles.kicker}>TODAY&apos;S LOOK</Text>
        <Text style={styles.date}>{TODAY_LABEL}</Text>
      </View>

      {loading ? (
        <View style={styles.stateRow}>
          <ActivityIndicator color={theme.colors.text} />
          <Text style={styles.stateText}>Checking today&apos;s plan…</Text>
        </View>
      ) : error ? (
        <View style={styles.stateRow}>
          <Ionicons name="cloud-offline-outline" size={20} color={theme.colors.accent} />
          <View style={styles.body}>
            <Text style={styles.title}>Today&apos;s plan is unavailable</Text>
            <Text style={styles.meta}>{error}</Text>
          </View>
        </View>
      ) : !planned ? (
        <>
          <View style={styles.row}>
            <View style={styles.thumbEmpty}>
              <Ionicons name="calendar-outline" size={22} color={theme.colors.textMuted} />
            </View>
            <View style={styles.body}>
              <Text style={styles.title}>Nothing planned for today</Text>
              <Text style={styles.meta}>
                Pick one of your saved looks on the calendar and it will show up
                here each morning.
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onPlanLook}
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          >
            <Ionicons name="calendar-outline" size={16} color={theme.colors.onPrimary} />
            <Text style={styles.ctaText}>Plan a look</Text>
          </Pressable>
        </>
      ) : (
        <>
          <View style={styles.row}>
            <OutfitThumb outfit={outfit} />
            <View style={styles.body}>
              <Text style={styles.title} numberOfLines={1}>
                {outfit?.name || "Planned look"}
              </Text>
              <Text style={styles.meta} numberOfLines={2}>
                {outfit
                  ? [outfit.occasion, itemCount(outfit)]
                      .filter(Boolean)
                      .join(" · ")
                  : "This plan points at an outfit that is no longer saved."}
              </Text>
            </View>
          </View>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={onPlanLook}
              style={({ pressed }) => [styles.ghost, pressed && styles.ctaPressed]}
            >
              <Text style={styles.ghostText}>Calendar</Text>
            </Pressable>
            {outfit ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => onOpenOutfit(outfit.id)}
                style={({ pressed }) => [styles.cta, styles.ctaFlex, pressed && styles.ctaPressed]}
              >
                <Ionicons name="shirt-outline" size={16} color={theme.colors.onPrimary} />
                <Text style={styles.ctaText}>Open outfit</Text>
              </Pressable>
            ) : null}
          </View>
        </>
      )}
    </GlassView>
  );
}

function itemCount(outfit: SavedOutfit): string {
  const n = outfit.clothing_ids?.length ?? 0;
  return `${n} item${n === 1 ? "" : "s"}`;
}

/** First piece of the look as a square thumbnail; placeholder while it loads. */
function OutfitThumb({ outfit }: { outfit: SavedOutfit | undefined }) {
  const firstId = outfit?.clothing_ids?.find(Boolean) ?? null;
  const [resolved, setResolved] = useState<{ id: string; uri: string | null } | null>(null);

  useEffect(() => {
    if (!firstId) return;
    let alive = true;
    fetchClothingImageRefs([firstId])
      .then((map) => resolveMediaUrl(map[firstId] ?? null, 900))
      .then((uri) => {
        if (alive) setResolved({ id: firstId, uri });
      })
      .catch(() => {
        if (alive) setResolved({ id: firstId, uri: null });
      });
    return () => {
      alive = false;
    };
  }, [firstId]);

  const uri = resolved && resolved.id === firstId ? resolved.uri : null;

  if (uri) {
    return <Image source={{ uri }} style={styles.thumb} contentFit="cover" transition={150} />;
  }
  return (
    <View style={[styles.thumb, styles.thumbEmpty]}>
      <Ionicons name="shirt-outline" size={26} color={theme.colors.textMuted} />
    </View>
  );
}

const TODAY_LABEL = new Date().toLocaleDateString(undefined, {
  weekday: "long",
  month: "short",
  day: "numeric",
});

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    // Sits just below the light hero, which now carries the mascot along its
    // bottom edge — a negative offset would crop the penguin's feet.
    marginTop: 12,
    overflow: "hidden",
  },
  // Off-iOS (and whenever Liquid Glass isn't in the build) GlassView is a plain
  // View, so the card supplies its own opaque surface + hairline.
  cardFallback: {
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  kicker: {
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: theme.colors.textMuted,
  },
  date: { fontSize: 11.5, fontWeight: "600", color: theme.colors.textMuted },
  stateRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  stateText: { fontSize: 13, color: theme.colors.textMuted },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceAlt,
  },
  thumbEmpty: {
    width: 64,
    height: 64,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: "800", color: theme.colors.text, letterSpacing: -0.2 },
  meta: { fontSize: 12.5, lineHeight: 18, color: theme.colors.textMuted, marginTop: 3 },
  actions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
    marginTop: 14,
  },
  ctaFlex: { flex: 1, marginTop: 0 },
  ctaPressed: { opacity: 0.85 },
  ctaText: { fontSize: 13.5, fontWeight: "700", color: theme.colors.onPrimary },
  ghost: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: theme.borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: "transparent",
  },
  ghostText: { fontSize: 13.5, fontWeight: "700", color: theme.colors.text },
});
