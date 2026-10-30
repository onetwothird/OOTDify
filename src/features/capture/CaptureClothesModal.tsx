// C:\OOTDify\src\features\capture\CaptureClothesModal.tsx
// Capture flow: take/choose photos → auto-isolate the garment (backend cut-out,
// reviewed per photo, original kept when the cut-out isn't trustworthy) →
// upload to the PRIVATE `wardrobe` bucket → insert real rows into
// public.clothing_items. No scanner stub, no local-only items, no fake
// detection. The user picks the category; we never guess.
//
// PRIVACY: the camera permission is requested only when the user taps
// "Camera" (with the context copy below). Library picks use the system photo
// picker — no broad gallery permission is requested on Android.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { AppButton } from "../../shared/components/AppButton";
import { Sheet } from "../../shared/components/Sheet";
import { EmptyState } from "../../shared/components/StateViews";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { useT } from "../../shared/i18n/useT";
import { toast } from "../../shared/lib/toast";
import { uuid } from "../../shared/lib/uuid";
import { insertClothingItem, uploadToWardrobeBucket } from "../clothing/service";
import { penggi } from "../../shared/components/PenggiMoment";
import { ClothingItem } from "../clothing/types";
import { WardrobeStore } from "../wardrobe/store";
import { useCaptureModalStore } from "./captureModalStore";
import { isolateCapturedPhoto, type IsolationOutcome } from "./isolate";

const CATEGORIES = ["Tops", "Bottoms", "Outerwear", "Shoes", "Dresses", "Bags", "Accessories"];

type CapturedEntry = {
  /** Stable key: photos can be removed while isolation is still running. */
  id: string;
  /** The photo exactly as the user took/picked it. */
  uri: string;
  category: string;
  /** Typed by the user, or filled from the AI's description until they edit it. */
  description: string;
  isolation: "pending" | IsolationOutcome;
  /** Save the cut-out (when there is one) instead of the original. */
  useCutout: boolean;
};

/** The image that will be saved (and is shown) for this entry. */
const activeUri = (e: CapturedEntry) =>
  e.useCutout && e.isolation !== "pending" && e.isolation.status === "isolated"
    ? e.isolation.uri
    : e.uri;

/** What the AI described for this photo (null while pending, on error, or when it saw nothing). */
const garmentOf = (e: CapturedEntry) =>
  e.isolation === "pending" || e.isolation.status === "error" ? null : e.isolation.garment;

export default function CaptureClothesModal() {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t, tl } = useT();
  const isOpen = useCaptureModalStore((s) => s.isOpen);
  const close = useCaptureModalStore((s) => s.close);

  const [entries, setEntries] = useState<CapturedEntry[]>([]);
  const [processing, setProcessing] = useState(false);
  // New pieces show in Discover unless the owner switches it off here.
  const [showInDiscover, setShowInDiscover] = useState(true);

  const reset = () => {
    setEntries([]);
    setProcessing(false);
  };

  const handleClose = () => {
    reset();
    close();
  };

  const addUris = (uris: string[]) => {
    const added: CapturedEntry[] = uris.map((uri) => ({
      id: uuid(),
      uri,
      category: "",
      description: "",
      isolation: "pending",
      useCutout: true,
    }));
    setEntries((prev) => [...prev, ...added]);
    // Isolate every new photo automatically; the user reviews the result
    // (and can switch back to the original) before anything is saved.
    for (const entry of added) {
      void isolateCapturedPhoto(entry.uri).then((outcome) => {
        // The AI's category is only a suggestion: it fills an empty choice and
        // the user can still change it.
        const suggested = outcome.status === "error" ? null : outcome.garment?.category ?? null;
        setEntries((prev) =>
          prev.map((e) =>
            e.id === entry.id
              ? {
                  ...e,
                  isolation: outcome,
                  category: e.category || (suggested && CATEGORIES.includes(suggested) ? suggested : ""),
                  description: e.description || (outcome.status === "error" ? "" : outcome.garment?.description ?? ""),
                }
              : e,
          ),
        );
      });
    }
  };

  const toggleCutout = (index: number) => {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, useCutout: !e.useCutout } : e)));
  };

  const takePhoto = async () => {
    // Camera permission is only requested here — after the user deliberately
    // taps "Camera" and has read the context copy above.
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      toast.error(
        t("capture.camera.permission.title"),
        t("capture.camera.permission.message"),
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      // Free crop (no fixed ratio): frame just the garment you want to keep.
      allowsEditing: true,
    });
    if (!result.canceled && result.assets?.length) {
      addUris(result.assets.map((a) => a.uri));
    }
  };

  const pickFromLibrary = async () => {
    // Android uses the system photo picker (no broad storage permission);
    // iOS may prompt for limited library access on selection.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      // One photo at a time: the system crop screen only opens for a single pick.
      // Crop to the garment you want; pick again to add more.
      allowsEditing: true,
    });
    if (!result.canceled && result.assets?.length) {
      addUris(result.assets.map((a) => a.uri));
    }
  };

  const setCategory = (index: number, category: string) => {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, category } : e)));
  };

  const setDescription = (index: number, description: string) => {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, description } : e)));
  };

  const removeEntry = (index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const allCategorized = entries.length > 0 && entries.every((e) => e.category);
  const isolating = entries.some((e) => e.isolation === "pending");

  const saveEntries = async () => {
    if (!entries.length) {
      handleClose();
      return;
    }
    setProcessing(true);
    const saved: ClothingItem[] = [];
    let failed = 0;
    for (const entry of entries) {
      try {
        if (!entry.category) {
          throw new Error(t("capture.error.missing_category"));
        }
        const storageRef = await uploadToWardrobeBucket(activeUri(entry), `item-${Date.now()}.jpg`, "image/jpeg");
        const garment = garmentOf(entry);
        const row = await insertClothingItem({
          name: garment?.name || entry.category,
          description: entry.description.trim() || undefined,
          category: entry.category,
          color: garment?.color ?? undefined,
          image_url: storageRef,
          is_public: showInDiscover,
          tags: [garment?.pattern, garment?.fit].filter(
            (tag): tag is string => Boolean(tag) && tag !== "unknown",
          ),
        });
        saved.push(row);
      } catch (e) {
        console.warn("Failed to save captured item:", e instanceof Error ? `${e.name}: ${e.message}` : e);
        failed += 1;
      }
    }

    if (saved.length) {
      WardrobeStore.addItems(saved);
    }

    setProcessing(false);

    if (saved.length === 0) {
      toast.error(
        t("capture.alert.nothing_saved.title"),
        failed > 0
          ? t("capture.alert.nothing_saved.upload_failed")
          : t("capture.alert.nothing_saved.pick_category"),
      );
      return;
    }

    // Some photos failing makes it a heads-up rather than a clean success.
    const message =
      t("capture.alert.added.message", { count: saved.length }) +
      (failed ? t("capture.alert.added.failed_suffix", { count: failed }) : "");
    // Some photos failing makes it a heads-up; a clean save gets happy Penggi.
    if (failed) toast.info(t("capture.alert.added.title"), message);
    else penggi.show("added", t("penggi.added.title", { count: saved.length }), t("penggi.added.message"));
    handleClose();
  };

  return (
    <Sheet
      visible={isOpen}
      onClose={handleClose}
      busy={processing}
      scroll={false}
      icon="camera"
      title={t("capture.title")}
      subtitle={t("capture.subtitle")}
      footer={
        entries.length === 0 ? undefined : (
          <>
            <View style={styles.discoverRow}>
              <Ionicons
                name={showInDiscover ? "compass-outline" : "lock-closed-outline"}
                size={18}
                color={showInDiscover ? theme.colors.brand : theme.colors.textMuted}
              />
              <View style={styles.discoverTexts}>
                <Text style={styles.discoverTitle}>{t("capture.discover.title")}</Text>
                <Text style={styles.discoverHint}>
                  {showInDiscover ? t("capture.discover.on") : t("capture.discover.off")}
                </Text>
              </View>
              <Switch
                value={showInDiscover}
                onValueChange={setShowInDiscover}
                disabled={processing}
                accessibilityLabel={t("capture.discover.title")}
                trackColor={{ true: theme.colors.brand, false: theme.colors.border }}
              />
            </View>
            <AppButton
              label={t("capture.save", { count: entries.length })}
              icon="checkmark"
              loading={processing}
              disabled={!allCategorized || isolating}
              onPress={saveEntries}
            />
            <Text style={styles.hint}>
              {isolating
                ? t("capture.hint.isolating")
                : allCategorized
                  ? t("capture.hint.ready")
                  : t("capture.hint.incomplete")}
            </Text>
          </>
        )
      }
    >
      <View style={styles.actionsRow}>
        <Pressable
          accessibilityRole="button"
          onPress={takePhoto}
          style={({ pressed }) => [styles.captureBtn, pressed && styles.pressed]}
        >
          <Ionicons name="camera-outline" size={18} color={theme.colors.onBrand} />
          <Text style={styles.captureBtnText}>{t("capture.action.camera")}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={pickFromLibrary}
          style={({ pressed }) => [styles.captureBtnAlt, pressed && styles.pressed]}
        >
          <Ionicons name="images-outline" size={18} color={theme.colors.text} />
          <Text style={styles.captureBtnAltText}>{t("capture.action.library")}</Text>
        </Pressable>
      </View>

      {entries.length === 0 ? (
        <EmptyState
          compact
          icon="shirt-outline"
          title={t("capture.empty.title")}
          message={t("capture.empty.message")}
        />
      ) : (
        <>
          <View style={styles.listHead}>
            <Text style={styles.listHeadText}>
              {t("capture.list.header", { count: entries.length })}
            </Text>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={reset}>
              <Text style={styles.clearAll}>{t("capture.clear_all")}</Text>
            </Pressable>
          </View>
          <ScrollView
            style={styles.itemsList}
            contentContainerStyle={styles.itemsListContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {entries.map((entry, idx) => {
              const chosen = Boolean(entry.category);
              return (
                <View key={entry.id} style={styles.itemCard}>
                  <View style={styles.itemImageWrap}>
                    <Image
                      source={{ uri: activeUri(entry) }}
                      style={styles.itemImage}
                      contentFit="cover"
                      transition={150}
                    />
                    <View style={styles.itemIndex}>
                      <Text style={styles.itemIndexText}>{idx + 1}</Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("capture.remove_a11y")}
                      hitSlop={6}
                      style={styles.removeBadge}
                      onPress={() => removeEntry(idx)}
                    >
                      <Ionicons name="close" size={12} color={theme.colors.onPrimary} />
                    </Pressable>
                  </View>
                  <View style={styles.itemBody}>
                    <Text style={[styles.itemLabel, !chosen && styles.itemLabelMuted]}>
                      {chosen ? tl("category", entry.category) : t("capture.choose_category")}
                    </Text>
                    <IsolationStatus entry={entry} onToggle={() => toggleCutout(idx)} />

                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.chipRow}
                      keyboardShouldPersistTaps="handled"
                    >
                      {CATEGORIES.map((cat) => {
                        const active = entry.category === cat;
                        return (
                          <Pressable
                            key={cat}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            style={[styles.chip, active && styles.chipActive]}
                            onPress={() => setCategory(idx, cat)}
                          >
                            {active ? (
                              <Ionicons
                                name="checkmark"
                                size={12}
                                color={theme.colors.onPrimary}
                              />
                            ) : null}
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>
                              {tl("category", cat)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>

                    <TextInput
                      value={entry.description}
                      onChangeText={(text) => setDescription(idx, text)}
                      placeholder={t("capture.description.placeholder")}
                      placeholderTextColor={theme.colors.textMuted}
                      style={styles.descriptionInput}
                      maxLength={300}
                      multiline
                      editable={!processing}
                      accessibilityLabel={t("capture.description.label")}
                    />
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </>
      )}
    </Sheet>
  );
}

/** One line under each photo: isolation progress, result, or why it was skipped. */
function IsolationStatus({ entry, onToggle }: { entry: CapturedEntry; onToggle: () => void }) {
  const styles = useStyles();
  const theme = useAppTheme();
  const { t } = useT();
  const outcome = entry.isolation;

  if (outcome === "pending") {
    return (
      <View style={styles.isoRow}>
        <ActivityIndicator size="small" color={theme.colors.textMuted} />
        <Text style={styles.isoText}>{t("capture.isolate.pending")}</Text>
      </View>
    );
  }
  const garment = outcome.status === "error" ? null : outcome.garment;
  const described = garment?.description ? (
    <View style={styles.isoRow}>
      <Ionicons name="sparkles-outline" size={14} color={theme.colors.text} />
      <Text style={styles.isoText}>
        {[garment.name, garment.description].filter(Boolean).join(" — ")}
      </Text>
    </View>
  ) : null;

  if (outcome.status === "isolated") {
    return (
      <>
      {described}
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: entry.useCutout }}
        hitSlop={6}
        onPress={onToggle}
        style={styles.isoRow}
      >
        <Ionicons
          name={entry.useCutout ? "cut-outline" : "image-outline"}
          size={14}
          color={theme.colors.text}
        />
        <Text style={styles.isoText}>
          {entry.useCutout ? t("capture.isolate.using_cutout") : t("capture.isolate.using_original")}
        </Text>
        <Text style={styles.isoLink}>
          {entry.useCutout ? t("capture.isolate.use_original") : t("capture.isolate.use_cutout")}
        </Text>
      </Pressable>
      </>
    );
  }
  const reason =
    outcome.status === "kept" && outcome.reason
      ? t(`capture.isolate.reason.${outcome.reason}`)
      : t("capture.isolate.reason.unavailable");
  return (
    <>
      {described}
      <View style={styles.isoRow}>
        <Ionicons name="information-circle-outline" size={14} color={theme.colors.textMuted} />
        <Text style={styles.isoText} numberOfLines={2}>
          {t("capture.isolate.kept", { reason })}
        </Text>
      </View>
    </>
  );
}

const useStyles = makeStyles((theme) => ({


  listHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    marginBottom: 8,
  },
  listHeadText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: theme.colors.textMuted,
  },
  clearAll: { fontSize: 12.5, fontWeight: "600", color: theme.colors.brand },

  itemsList: { flexShrink: 1 },
  itemsListContent: { gap: 10, paddingBottom: 4 },

  itemCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.borderRadius.md,
    padding: 10,
  },
  itemImageWrap: { position: "relative" },
  itemImage: {
    width: 68,
    height: 84,
    borderRadius: 12,
    backgroundColor: theme.colors.border,
  },
  itemIndex: {
    position: "absolute",
    bottom: 6,
    left: 6,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: "rgba(20,20,20,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  itemIndexText: { fontSize: 10.5, fontWeight: "700", color: "#FFFFFF" },
  removeBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  itemBody: { flex: 1, minWidth: 0, justifyContent: "center" },
  itemLabel: {
    fontSize: 12.5,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 8,
  },
  itemLabelMuted: { color: theme.colors.textMuted, fontWeight: "600" },
  isoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  isoText: { flexShrink: 1, fontSize: 11.5, color: theme.colors.textMuted },
  isoLink: {
    fontSize: 11.5,
    fontWeight: "700",
    color: theme.colors.text,
    textDecorationLine: "underline",
  },
  chipRow: { gap: 6, paddingRight: 4 },
  descriptionInput: {
    marginTop: 8,
    minHeight: 40,
    maxHeight: 88,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13.5,
    color: theme.colors.text,
    borderRadius: theme.borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    textAlignVertical: "top",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.pill,
  },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 11.5, fontWeight: "600", color: theme.colors.textMuted },
  chipTextActive: { color: theme.colors.onPrimary },

  actionsRow: { flexDirection: "row", gap: 10 },
  captureBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.brand,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 13,
    minHeight: 46,
  },
  captureBtnText: { color: theme.colors.onBrand, fontWeight: "600", fontSize: 14 },
  captureBtnAlt: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 13,
    minHeight: 46,
  },
  captureBtnAltText: { color: theme.colors.text, fontWeight: "600", fontSize: 14 },
  pressed: { opacity: 0.85 },
  doneBtn: { marginTop: 14 },
  discoverRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 10 },
  discoverTexts: { flex: 1, minWidth: 0 },
  discoverTitle: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
  discoverHint: { fontSize: 12, color: theme.colors.textMuted, marginTop: 1 },
  hint: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: "center",
    marginTop: 10,
  },
}));
