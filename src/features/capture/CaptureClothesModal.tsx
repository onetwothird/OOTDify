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
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton } from "../../shared/components/AppButton";
import { makeStyles } from "../../shared/theme/makeStyles";
import { useAppTheme } from "../../shared/theme/ThemeProvider";
import { useT } from "../../shared/i18n/useT";
import { uuid } from "../../shared/lib/uuid";
import { insertClothingItem, uploadToWardrobeBucket } from "../clothing/service";
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
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const theme = useAppTheme();
  const { t, tl } = useT();
  const isOpen = useCaptureModalStore((s) => s.isOpen);
  const close = useCaptureModalStore((s) => s.close);

  const [entries, setEntries] = useState<CapturedEntry[]>([]);
  const [processing, setProcessing] = useState(false);

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
      Alert.alert(
        t("capture.camera.permission.title"),
        t("capture.camera.permission.message"),
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: true,
      aspect: [3, 4],
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
      allowsMultipleSelection: true,
      selectionLimit: 10,
    });
    if (!result.canceled && result.assets?.length) {
      addUris(result.assets.map((a) => a.uri));
    }
  };

  const setCategory = (index: number, category: string) => {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, category } : e)));
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
          category: entry.category,
          color: garment?.color ?? undefined,
          image_url: storageRef,
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
      Alert.alert(
        t("capture.alert.nothing_saved.title"),
        failed > 0
          ? t("capture.alert.nothing_saved.upload_failed")
          : t("capture.alert.nothing_saved.pick_category"),
      );
      return;
    }

    Alert.alert(
      t("capture.alert.added.title"),
      t("capture.alert.added.message", { count: saved.length }) +
        (failed ? t("capture.alert.added.failed_suffix", { count: failed }) : ""),
    );
    handleClose();
  };

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="camera" size={20} color={theme.colors.onPrimary} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>{t("capture.title")}</Text>
              <Text style={styles.headerSub}>
                {t("capture.subtitle")}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("capture.close_a11y")}
              hitSlop={8}
              onPress={handleClose}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={20} color={theme.colors.text} />
            </Pressable>
          </View>

          <View style={styles.actionsRow}>
            <Pressable
              accessibilityRole="button"
              onPress={takePhoto}
              style={({ pressed }) => [styles.captureBtn, pressed && styles.pressed]}
            >
              <Ionicons name="camera-outline" size={18} color={theme.colors.onPrimary} />
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
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="shirt-outline" size={24} color={theme.colors.text} />
              </View>
              <Text style={styles.emptyTitle}>{t("capture.empty.title")}</Text>
              <Text style={styles.emptyText}>
                {t("capture.empty.message")}
              </Text>
            </View>
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
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            </>
          )}

          {entries.length === 0 ? null : (
            <>
              <AppButton
                label={t("capture.save", { count: entries.length })}
                icon="checkmark"
                loading={processing}
                disabled={!allCategorized || isolating}
                onPress={saveEntries}
              />
              <Text style={[styles.hint, { marginBottom: 4 }]}>
                {isolating
                  ? t("capture.hint.isolating")
                  : allCategorized
                    ? t("capture.hint.ready")
                    : t("capture.hint.incomplete")}
              </Text>
            </>
          )}
        </View>
      </View>
    </Modal>
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
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: "88%",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginBottom: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 21, fontWeight: "800", color: theme.colors.text, letterSpacing: -0.3 },
  headerSub: { fontSize: 12.5, color: theme.colors.textMuted, marginTop: 3, lineHeight: 17 },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyState: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 26,
    paddingHorizontal: 16,
    marginBottom: 4,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    marginTop: 14,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: theme.colors.text },
  emptyText: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 280,
  },

  listHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    marginBottom: 8,
  },
  listHeadText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: theme.colors.textMuted,
    textTransform: "uppercase",
  },
  clearAll: { fontSize: 12.5, fontWeight: "700", color: theme.colors.primary },

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
  itemIndexText: { fontSize: 10.5, fontWeight: "800", color: "#FFFFFF" },
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
    fontWeight: "800",
    color: theme.colors.text,
    marginBottom: 8,
  },
  itemLabelMuted: { color: theme.colors.textMuted, fontWeight: "700" },
  isoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  isoText: { flexShrink: 1, fontSize: 11.5, color: theme.colors.textMuted },
  isoLink: {
    fontSize: 11.5,
    fontWeight: "800",
    color: theme.colors.text,
    textDecorationLine: "underline",
  },
  chipRow: { gap: 6, paddingRight: 4 },
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
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 13,
    minHeight: 46,
  },
  captureBtnText: { color: theme.colors.onPrimary, fontWeight: "700", fontSize: 14 },
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
  captureBtnAltText: { color: theme.colors.text, fontWeight: "700", fontSize: 14 },
  pressed: { opacity: 0.85 },
  doneBtn: { marginTop: 14 },
  hint: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: "center",
    marginTop: 10,
  },
}));
