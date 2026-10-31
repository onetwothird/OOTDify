// C:\OOTDify\src\features\outfit\components\ManualOutfitBuilder.tsx
// Build an outfit yourself: tap a slot (Top, Bottom, Shoes, Layer…) and pick
// one of your own pieces for it. The screen keeps a live tally of what the
// look still needs, flags concrete issues (more than two bold colours, a piece
// tagged for another occasion) and shows the compatibility score. Nothing is
// chosen for the user. Logic lives in ../manualOutfit.ts.
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { OCCASIONS, type ClothingItem } from "../../clothing/types";
import { insertSavedOutfit } from "../../clothing/service";
import { useCaptureModalStore } from "../../capture/captureModalStore";
import { useWardrobeStore } from "../../wardrobe/store";
import { AppButton } from "../../../shared/components/AppButton";
import { Chip } from "../../../shared/components/Chip";
import { Sheet } from "../../../shared/components/Sheet";
import { SmartImage } from "../../../shared/components/SmartImage";
import { useT } from "../../../shared/i18n/useT";
import type { TranslationKey } from "../../../shared/i18n/translate";
import { toast } from "../../../shared/lib/toast";
import { makeStyles } from "../../../shared/theme/makeStyles";
import { useAppTheme } from "../../../shared/theme/ThemeProvider";
import {
  clearSlot,
  hintsFor,
  missingSlots,
  pick,
  piecesFor,
  SLOTS,
  toOutfit,
  visibleSlots,
  type Hint,
  type Picks,
  type SlotKey,
} from "../manualOutfit";

type IconName = keyof typeof Ionicons.glyphMap;

const SLOT_ICON: Record<SlotKey, IconName> = {
  top: "shirt-outline",
  bottom: "reorder-four-outline",
  dress: "woman-outline",
  shoes: "footsteps-outline",
  layer: "layers-outline",
  accessory: "glasses-outline",
  bag: "bag-handle-outline",
};

const slotLabel = (slot: SlotKey) => `outfits.manual.slot.${slot}` as TranslationKey;

export function ManualOutfitBuilder({ onSaved }: { onSaved: (savedId: string) => void }) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t, tl } = useT();
  const items = useWardrobeStore((s) => s.items);
  const loading = useWardrobeStore((s) => s.loading);
  const loadFromServer = useWardrobeStore((s) => s.loadFromServer);
  const openCapture = useCaptureModalStore((s) => s.open);

  const [occasion, setOccasion] = useState<string>("Casual");
  const [picks, setPicks] = useState<Picks>({});
  const [choosing, setChoosing] = useState<SlotKey | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!items.length) void loadFromServer().catch(() => {});
  }, [items.length, loadFromServer]);

  const byId = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);
  const slots = visibleSlots(picks);
  const missing = missingSlots(picks);
  const hints = hintsFor(picks, items, occasion);
  const outfit = toOutfit(picks, items, occasion);
  const chosenCount = outfit.items.length;

  const openSlot = (slot: SlotKey) => {
    setShowAll(false);
    setChoosing(slot);
  };

  const choose = (piece: ClothingItem) => {
    if (!choosing) return;
    setPicks((p) => pick(p, choosing, piece.id));
    setChoosing(null);
  };

  const save = async () => {
    if (missing.length || saving) return;
    setSaving(true);
    try {
      const saved = await insertSavedOutfit({
        name: t("home.looks.occasion_look", { occasion: tl("occasion", occasion) }),
        occasion,
        clothing_ids: outfit.items.map((e) => e.id),
        try_on_id: null,
      });
      setPicks({});
      onSaved(saved.id);
    } catch (e) {
      toast.error(
        t("outfits.toast.save_error.title"),
        e instanceof Error ? e.message : t("outfits.toast.save_error.message"),
      );
    } finally {
      setSaving(false);
    }
  };

  const hintText = (hint: Hint): string => {
    switch (hint.kind) {
      case "missing":
        return t("outfits.manual.hint.missing", { slots: hint.slots.map((s) => t(slotLabel(s))).join(", ") });
      case "too_many_colors":
        return t("outfits.manual.hint.colors", { colors: hint.colors.join(", ") });
      case "occasion":
        return t("outfits.manual.hint.occasion", {
          name: hint.pieceName || t("scan.item_fallback"),
          occasions: hint.occasions.map((o) => tl("occasion", o)).join(", "),
          occasion: tl("occasion", occasion),
        });
      case "complete":
        return t("outfits.manual.hint.complete");
    }
  };

  // Nothing to build with yet: say so and offer the capture flow.
  if (!loading && !items.length) {
    return (
      <View style={styles.empty}>
        <Ionicons name="shirt-outline" size={34} color={theme.colors.textMuted} />
        <Text style={styles.emptyTitle}>{t("outfits.builder.need_clothes.title")}</Text>
        <Text style={styles.emptyBody}>{t("outfits.manual.empty")}</Text>
        <AppButton label={t("home.action.capture")} icon="camera-outline" onPress={openCapture} />
      </View>
    );
  }

  const choices = choosing ? piecesFor(choosing, items, showAll) : [];
  const currentInSlot = choosing ? picks[choosing] : undefined;

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionLabel}>{t("outfits.builder.occasion")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {OCCASIONS.map((occ) => (
          <Chip key={occ} label={tl("occasion", occ)} active={occ === occasion} onPress={() => setOccasion(occ)} />
        ))}
      </ScrollView>

      <View style={styles.labelRow}>
        <Text style={styles.sectionLabel}>{t("outfits.manual.pieces")}</Text>
        <Text style={styles.count}>{t("outfits.manual.count", { count: chosenCount })}</Text>
      </View>
      <View style={styles.grid}>
        {slots.map((slot) => {
          const id = picks[slot];
          const piece = id ? byId.get(id) : undefined;
          const optional = SLOTS.find((s) => s.key === slot)?.optional;
          return (
            <Pressable
              key={slot}
              accessibilityRole="button"
              accessibilityLabel={
                piece
                  ? t("outfits.manual.slot_filled_a11y", { slot: t(slotLabel(slot)), name: piece.name ?? "" })
                  : t("outfits.manual.slot_empty_a11y", { slot: t(slotLabel(slot)) })
              }
              onPress={() => openSlot(slot)}
              style={({ pressed }) => [styles.slot, !piece && styles.slotEmpty, pressed && styles.pressed]}
            >
              {piece ? (
                <>
                  <SmartImage source={piece.image_url} style={styles.slotImage} contentFit="contain" fallbackIcon={SLOT_ICON[slot]} />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("outfits.manual.remove_a11y", { slot: t(slotLabel(slot)) })}
                    hitSlop={8}
                    onPress={() => setPicks((p) => clearSlot(p, slot))}
                    style={styles.remove}
                  >
                    <Ionicons name="close" size={14} color={theme.colors.text} />
                  </Pressable>
                </>
              ) : (
                <Ionicons name="add" size={26} color={theme.colors.textMuted} />
              )}
              <View style={styles.slotFoot}>
                <Ionicons name={SLOT_ICON[slot]} size={13} color={piece ? theme.colors.brand : theme.colors.textMuted} />
                <Text style={styles.slotName} numberOfLines={1}>
                  {piece?.name || t(slotLabel(slot))}
                </Text>
              </View>
              {!piece && optional ? <Text style={styles.optional}>{t("outfits.manual.optional")}</Text> : null}
            </Pressable>
          );
        })}
      </View>

      {/* Live notes on the look so far. */}
      {chosenCount ? (
        <View style={styles.notes}>
          <View style={styles.scoreRow}>
            <Ionicons name="pulse-outline" size={16} color={theme.colors.brand} />
            <Text style={styles.scoreText}>{t("outfits.builder.compatibility", { score: outfit.score })}</Text>
          </View>
          {hints.map((hint, i) => (
            <View key={i} style={styles.hintRow}>
              <Ionicons
                name={hint.kind === "complete" ? "checkmark-circle" : hint.kind === "missing" ? "ellipse-outline" : "alert-circle-outline"}
                size={16}
                color={hint.kind === "complete" ? theme.colors.success : theme.colors.accent}
              />
              <Text style={styles.hintText}>{hintText(hint)}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.start}>{t("outfits.manual.start")}</Text>
      )}

      <AppButton
        label={missing.length ? t("outfits.manual.save_needs", { count: missing.length }) : t("outfits.builder.save")}
        icon="bookmark-outline"
        loading={saving}
        onPress={() => void save()}
        style={missing.length ? styles.disabled : undefined}
      />
      {chosenCount ? (
        <Pressable accessibilityRole="button" onPress={() => setPicks({})} style={styles.clearAll} hitSlop={6}>
          <Text style={styles.clearAllText}>{t("outfits.manual.clear")}</Text>
        </Pressable>
      ) : null}

      {/* Pick a piece for the tapped slot. */}
      <Sheet
        visible={choosing !== null}
        onClose={() => setChoosing(null)}
        icon={choosing ? SLOT_ICON[choosing] : "shirt-outline"}
        title={choosing ? t("outfits.manual.choose_title", { slot: t(slotLabel(choosing)) }) : ""}
        subtitle={showAll ? t("outfits.manual.showing_all") : t("outfits.manual.showing_slot")}
      >
        {choices.length ? (
          <View style={styles.choiceGrid}>
            {choices.map((piece) => {
              const selected = piece.id === currentInSlot;
              return (
                <Pressable
                  key={piece.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={piece.name ?? t("scan.item_fallback")}
                  onPress={() => choose(piece)}
                  style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, pressed && styles.pressed]}
                >
                  <SmartImage source={piece.image_url} style={styles.choiceImage} contentFit="contain" fallbackIcon="shirt-outline" />
                  <Text style={styles.choiceName} numberOfLines={1}>
                    {piece.name || t("scan.item_fallback")}
                  </Text>
                  {piece.color ? (
                    <Text style={styles.choiceMeta} numberOfLines={1}>
                      {piece.color}
                    </Text>
                  ) : null}
                  {selected ? (
                    <View style={styles.check}>
                      <Ionicons name="checkmark" size={12} color={theme.colors.onBrand} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.noneBox}>
            <Text style={styles.noneText}>
              {choosing ? t("outfits.manual.none", { slot: t(slotLabel(choosing)) }) : ""}
            </Text>
            <AppButton
              label={t("home.action.capture")}
              icon="camera-outline"
              variant="secondary"
              onPress={() => {
                setChoosing(null);
                openCapture();
              }}
            />
          </View>
        )}
        <Pressable accessibilityRole="button" onPress={() => setShowAll((v) => !v)} style={styles.showAll} hitSlop={6}>
          <Text style={styles.showAllText}>
            {showAll ? t("outfits.manual.show_slot") : t("outfits.manual.show_all")}
          </Text>
        </Pressable>
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  wrap: { gap: 12 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: theme.colors.textMuted,
  },
  chips: { gap: 8, paddingRight: 8 },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  count: { fontSize: 12, fontWeight: "600", color: theme.colors.textMuted },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  slot: {
    width: "31%",
    flexGrow: 1,
    aspectRatio: 0.8,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
  },
  slotEmpty: { borderStyle: "dashed", borderColor: theme.colors.textMuted },
  pressed: { opacity: 0.75 },
  slotImage: { width: "100%", flex: 1 },
  slotFoot: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, maxWidth: "100%" },
  slotName: { flexShrink: 1, fontSize: 12, fontWeight: "600", color: theme.colors.text },
  optional: { fontSize: 10, color: theme.colors.textMuted, marginTop: 2 },
  remove: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  notes: {
    gap: 8,
    padding: 12,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  scoreText: { fontSize: 13.5, fontWeight: "700", color: theme.colors.text },
  hintRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  hintText: { flex: 1, fontSize: 13, lineHeight: 19, color: theme.colors.text },
  start: { fontSize: 13, lineHeight: 19, color: theme.colors.textMuted },
  disabled: { opacity: 0.55 },
  clearAll: { alignSelf: "center", paddingVertical: 4 },
  clearAllText: { fontSize: 13, fontWeight: "600", color: theme.colors.textMuted },
  choiceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  choice: {
    width: "31%",
    flexGrow: 0,
    padding: 6,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  choiceSelected: { borderColor: theme.colors.brand, borderWidth: 2 },
  choiceImage: { width: "100%", aspectRatio: 1 },
  choiceName: { marginTop: 4, fontSize: 12, fontWeight: "600", color: theme.colors.text },
  choiceMeta: { fontSize: 11, color: theme.colors.textMuted },
  check: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.brand,
  },
  noneBox: { gap: 10, alignItems: "stretch" },
  noneText: { fontSize: 13.5, lineHeight: 20, color: theme.colors.textMuted },
  showAll: { alignSelf: "center", paddingVertical: 12 },
  showAllText: { fontSize: 13.5, fontWeight: "700", color: theme.colors.brand },
  empty: { alignItems: "center", gap: 10, paddingVertical: 24 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: theme.colors.text },
  emptyBody: { fontSize: 13.5, lineHeight: 20, textAlign: "center", color: theme.colors.textMuted },
}));
