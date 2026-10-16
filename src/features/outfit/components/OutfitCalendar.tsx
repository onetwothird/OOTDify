// C:\OOTDify\src\features\outfit\components\OutfitCalendar.tsx
// Interactive style calendar: browse months, tap a day, and pick which saved
// outfit to wear that day. Planned days show a mini outfit thumbnail. Backed by
// public.outfit_plans (owner-only via RLS) — no mock data.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { resolveMediaUrl } from "../../../shared/lib/storageUrl";
import { theme } from "../../../shared/config/theme";
import { SavedOutfit } from "../../clothing/service";
import {
  clearOutfitPlan,
  fetchClothingImageRefs,
  fetchOutfitPlans,
  monthBounds,
  OutfitPlan,
  setOutfitPlan,
  toISODate,
} from "../planner";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Props {
  outfits: SavedOutfit[];
  onOpenOutfit: (id: string) => void;
}

export function OutfitCalendar({ outfits, onOpenOutfit }: Props) {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [plans, setPlans] = useState<Record<string, OutfitPlan>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickerDate, setPickerDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // outfitId → representative image ref (first catalog item of the look)
  const [thumbRefs, setThumbRefs] = useState<Record<string, string>>({});

  const outfitById = useMemo(() => {
    const map: Record<string, SavedOutfit> = {};
    for (const o of outfits) map[o.id] = o;
    return map;
  }, [outfits]);

  const outfitThumbRef = useCallback(
    (outfit: SavedOutfit | undefined): string | null => {
      if (!outfit) return null;
      const first = outfit.clothing_ids?.find(Boolean);
      return first ? thumbRefs[first] ?? null : null;
    },
    [thumbRefs],
  );

  const loadPlans = useCallback(async (year: number, month: number) => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = monthBounds(year, month);
      const rows = await fetchOutfitPlans(start, end);
      const map: Record<string, OutfitPlan> = {};
      for (const r of rows) map[r.plan_date] = r;
      setPlans(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your calendar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlans(cursor.getFullYear(), cursor.getMonth());
  }, [cursor, loadPlans]);

  // Load one thumbnail ref per saved outfit (first item) whenever they change.
  useEffect(() => {
    let alive = true;
    const ids = outfits.map((o) => o.clothing_ids?.find(Boolean)).filter(Boolean) as string[];
    if (!ids.length) {
      setThumbRefs({});
      return;
    }
    fetchClothingImageRefs(ids)
      .then((map) => {
        if (alive) setThumbRefs(map);
      })
      .catch(() => {
        if (alive) setThumbRefs({});
      });
    return () => {
      alive = false;
    };
  }, [outfits]);

  // ---- Month grid -----------------------------------------------------------
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = new Date(year, month, 1).getDay();
  const cells: Array<number | null> = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const todayISO = toISODate(today);
  const plannedCount = Object.keys(plans).length;

  const shiftMonth = (delta: number) => {
    setCursor(new Date(year, month + delta, 1));
  };

  // ---- Assignment -----------------------------------------------------------
  const assign = async (outfitId: string | null) => {
    if (!pickerDate) return;
    setSaving(true);
    try {
      if (outfitId === null) {
        await clearOutfitPlan(pickerDate);
        setPlans((prev) => {
          const next = { ...prev };
          delete next[pickerDate];
          return next;
        });
      } else {
        const row = await setOutfitPlan(pickerDate, outfitId);
        setPlans((prev) => ({ ...prev, [row.plan_date]: row }));
      }
      setPickerDate(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that plan.");
    } finally {
      setSaving(false);
    }
  };

  const pickerOutfit = pickerDate ? plans[pickerDate] : undefined;

  return (
    <View style={styles.card}>
      {/* Month header */}
      <View style={styles.monthBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          hitSlop={8}
          style={styles.navBtn}
          onPress={() => shiftMonth(-1)}
        >
          <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
        </Pressable>
        <View style={styles.monthCenter}>
          <Text style={styles.monthLabel}>
            {MONTHS[month]} {year}
          </Text>
          <Text style={styles.monthMeta}>
            {plannedCount
              ? `${plannedCount} day${plannedCount === 1 ? "" : "s"} planned`
              : "No looks planned yet"}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          hitSlop={8}
          style={styles.navBtn}
          onPress={() => shiftMonth(1)}
        >
          <Ionicons name="chevron-forward" size={18} color={theme.colors.text} />
        </Pressable>
      </View>

      {/* Weekday labels */}
      <View style={styles.weekRow}>
        {WEEKDAYS.map((d, i) => (
          <Text key={`${d}-${i}`} style={styles.weekLabel}>
            {d}
          </Text>
        ))}
      </View>

      {/* Day grid */}
      {loading ? (
        <View style={styles.gridLoading}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : (
        <View style={styles.grid}>
          {cells.map((day, i) => {
            if (day === null) return <View key={`blank-${i}`} style={styles.cell} />;
            const iso = toISODate(new Date(year, month, day));
            const plan = plans[iso];
            const isToday = iso === todayISO;
            const planned = Boolean(plan?.outfit_id);
            return (
              <View key={iso} style={styles.cell}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Plan for ${MONTHS[month]} ${day}`}
                  onPress={() => setPickerDate(iso)}
                  style={({ pressed }) => [
                    styles.day,
                    isToday && styles.dayToday,
                    planned && styles.dayPlanned,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={[styles.dayNum, planned && styles.dayNumPlanned]}>{day}</Text>
                  {planned ? (
                    <MiniThumb
                      imageRef={outfitThumbRef(outfitById[plan!.outfit_id!])}
                      size={30}
                    />
                  ) : null}
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {/* Today shortcut + hint */}
      <View style={styles.footer}>
        <Text style={styles.hint}>Tap a day to plan a look.</Text>
        <Pressable
          accessibilityRole="button"
          style={styles.todayBtn}
          onPress={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
        >
          <Text style={styles.todayBtnText}>Today</Text>
        </Pressable>
      </View>

      {/* Outfit picker sheet */}
      <Modal
        visible={pickerDate !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerDate(null)}
      >
        <Pressable style={styles.pickerOverlay} onPress={() => setPickerDate(null)}>
          <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.pickerHandle} />
            <View style={styles.pickerHeader}>
              <View>
                <Text style={styles.pickerTitle}>Plan a look</Text>
                <Text style={styles.pickerSub}>
                  {pickerDate ? fromISOToLabel(pickerDate) : ""}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setPickerDate(null)}
              >
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </Pressable>
            </View>

            {outfits.length === 0 ? (
              <View style={styles.pickerEmpty}>
                <Ionicons name="shirt-outline" size={26} color={theme.colors.textMuted} />
                <Text style={styles.pickerEmptyText}>
                  No saved outfits yet. Build a look first, then plan it here.
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.pickerList}
                showsVerticalScrollIndicator={false}
              >
                {outfits.map((o) => {
                  const active = pickerOutfit?.outfit_id === o.id;
                  const count = o.clothing_ids?.length ?? 0;
                  return (
                    <Pressable
                      key={o.id}
                      accessibilityRole="button"
                      disabled={saving}
                      onPress={() => void assign(o.id)}
                      style={({ pressed }) => [
                        styles.pickerRow,
                        active && styles.pickerRowActive,
                        pressed && { opacity: 0.9 },
                      ]}
                    >
                      <MiniThumb imageRef={outfitThumbRef(o)} size={44} />
                      <View style={styles.pickerRowBody}>
                        <Text style={styles.pickerRowName} numberOfLines={1}>
                          {o.name || "Untitled outfit"}
                        </Text>
                        <Text style={styles.pickerRowMeta} numberOfLines={1}>
                          {[o.occasion, `${count} item${count === 1 ? "" : "s"}`]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                      </View>
                      {active ? (
                        <Ionicons name="checkmark-circle" size={22} color={theme.colors.primary} />
                      ) : (
                        <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            <View style={styles.pickerActions}>
              {pickerOutfit?.outfit_id ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={saving}
                  style={styles.clearBtn}
                  onPress={() => void assign(null)}
                >
                  <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
                  <Text style={styles.clearBtnText}>Clear this day</Text>
                </Pressable>
              ) : null}
              {pickerOutfit?.outfit_id ? (
                <Pressable
                  accessibilityRole="button"
                  style={styles.openBtn}
                  onPress={() => {
                    const id = pickerOutfit.outfit_id!;
                    setPickerDate(null);
                    onOpenOutfit(id);
                  }}
                >
                  <Text style={styles.openBtnText}>Open outfit</Text>
                </Pressable>
              ) : null}
              {saving ? <ActivityIndicator color={theme.colors.primary} /> : null}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/** "2026-10-12" → "Mon, Oct 12" (local). */
function fromISOToLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Small square outfit thumbnail with a graceful placeholder. */
function MiniThumb({ imageRef, size }: { imageRef: string | null; size: number }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!imageRef) {
      setUri(null);
      return;
    }
    resolveMediaUrl(imageRef, 900).then((u) => {
      if (alive) setUri(u);
    });
    return () => {
      alive = false;
    };
  }, [imageRef]);

  const box = { width: size, height: size, borderRadius: size / 4 };
  if (uri) {
    return <Image source={{ uri }} style={box} contentFit="cover" transition={120} />;
  }
  return (
    <View style={[box, styles.thumbPlaceholder]}>
      <Ionicons name="shirt-outline" size={size * 0.5} color={theme.colors.textMuted} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 12,
  },
  monthBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  monthCenter: { alignItems: "center", flex: 1 },
  monthLabel: { fontSize: 16, fontWeight: "800", color: theme.colors.text },
  monthMeta: { fontSize: 11, color: theme.colors.textMuted, marginTop: 1 },

  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekLabel: {
    width: "14.2857%",
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textMuted,
  },

  grid: { flexDirection: "row", flexWrap: "wrap" },
  gridLoading: { paddingVertical: 40, alignItems: "center" },
  cell: { width: "14.2857%", padding: 2 },
  day: {
    height: 58,
    borderRadius: theme.borderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    backgroundColor: theme.colors.surfaceAlt,
  },
  dayToday: {
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
  },
  dayPlanned: { backgroundColor: theme.colors.primary },
  dayNum: { fontSize: 12, fontWeight: "700", color: theme.colors.text },
  dayNumPlanned: { color: theme.colors.onPrimary },

  thumbPlaceholder: {
    backgroundColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },

  errorText: { color: theme.colors.danger, fontSize: 12, marginTop: 8 },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  hint: { fontSize: 11.5, color: theme.colors.textMuted },
  todayBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.surfaceAlt,
  },
  todayBtnText: { fontSize: 12, fontWeight: "700", color: theme.colors.text },

  // Picker sheet
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  pickerSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 28,
    maxHeight: "78%",
  },
  pickerHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginBottom: 12,
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  pickerTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  pickerSub: { fontSize: 12.5, color: theme.colors.textMuted, marginTop: 2 },
  pickerList: { flexGrow: 0 },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: theme.borderRadius.md,
  },
  pickerRowActive: { backgroundColor: theme.colors.surfaceAlt },
  pickerRowBody: { flex: 1, minWidth: 0 },
  pickerRowName: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  pickerRowMeta: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  pickerEmpty: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 28,
    paddingHorizontal: 20,
  },
  pickerEmptyText: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: "center",
    lineHeight: 19,
  },
  pickerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  clearBtnText: { fontSize: 13, fontWeight: "700", color: theme.colors.danger },
  openBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
  },
  openBtnText: { fontSize: 14, fontWeight: "700", color: theme.colors.onPrimary },
});
