// C:\OOTDify\src\features\capture\CaptureClothesModal.tsx
// Capture flow: take/choose photos → upload to the PRIVATE `wardrobe` bucket →
// insert real rows into public.clothing_items. No scanner stub, no local-only
// items, no fake detection. The user picks the category; we never guess.
//
// PRIVACY: the camera permission is requested only when the user taps
// "Camera" (with the context copy below). Library picks use the system photo
// picker — no broad gallery permission is requested on Android.
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton } from "../../shared/components/AppButton";
import { theme } from "../../shared/config/theme";
import { insertClothingItem, uploadToWardrobeBucket } from "../clothing/service";
import { ClothingItem } from "../clothing/types";
import { WardrobeStore } from "../wardrobe/store";
import { useCaptureModalStore } from "./captureModalStore";

const CATEGORIES = ["Tops", "Bottoms", "Outerwear", "Shoes", "Dresses", "Bags", "Accessories"];

type CapturedEntry = { uri: string; category: string };

export default function CaptureClothesModal() {
  const insets = useSafeAreaInsets();
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
    setEntries((prev) => [...prev, ...uris.map((uri) => ({ uri, category: "" }))]);
  };

  const takePhoto = async () => {
    // Camera permission is only requested here — after the user deliberately
    // taps "Camera" and has read the context copy above.
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Camera access needed",
        "We only use the camera to photograph the clothes you choose to add to your wardrobe.",
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
          throw new Error("Pick a category first.");
        }
        const storageRef = await uploadToWardrobeBucket(entry.uri, `item-${Date.now()}.jpg`, "image/jpeg");
        const row = await insertClothingItem({
          name: entry.category,
          category: entry.category,
          image_url: storageRef,
          tags: [],
        });
        saved.push(row);
      } catch (e) {
        console.warn("Failed to save captured item:", e);
        failed += 1;
      }
    }

    if (saved.length) {
      WardrobeStore.addItems(saved);
    }

    setProcessing(false);

    if (saved.length === 0) {
      Alert.alert(
        "Nothing saved",
        failed > 0
          ? "We couldn't upload those photos. Check your connection and try again."
          : "Pick a category for each photo, then save.",
      );
      return;
    }

    Alert.alert(
      "Added to your wardrobe",
      `${saved.length} item${saved.length > 1 ? "s" : ""} saved to your closet` +
        (failed ? ` (${failed} failed).` : "."),
    );
    handleClose();
  };

  return (
    <Modal visible={isOpen} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Add to Closet</Text>
              <Text style={styles.headerSub}>
                Photos stay private — only ever shown to you.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
              onPress={handleClose}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={22} color={theme.colors.text} />
            </Pressable>
          </View>

          {entries.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="images-outline" size={26} color={theme.colors.text} />
              </View>
              <Text style={styles.emptyTitle}>No photos yet</Text>
              <Text style={styles.emptyText}>
                Take a photo or pick from your library, then tag each piece with a
                category. We never guess what it is.
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.itemsList}
              contentContainerStyle={styles.itemsListContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {entries.map((entry, idx) => {
                const chosen = Boolean(entry.category);
                return (
                  <View key={`${entry.uri}-${idx}`} style={styles.itemCard}>
                    <View style={styles.itemImageWrap}>
                      <Image source={{ uri: entry.uri }} style={styles.itemImage} />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Remove photo"
                        hitSlop={6}
                        style={styles.removeBadge}
                        onPress={() => removeEntry(idx)}
                      >
                        <Ionicons name="close" size={12} color={theme.colors.onPrimary} />
                      </Pressable>
                    </View>
                    <View style={styles.itemBody}>
                      <Text style={[styles.itemLabel, !chosen && styles.itemLabelMuted]}>
                        {chosen ? entry.category : "Choose a category"}
                      </Text>
                      <View style={styles.chipWrap}>
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
                              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                                {cat}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.actionsRow}>
            <AppButton
              label="Camera"
              icon="camera-outline"
              variant="secondary"
              size="md"
              onPress={takePhoto}
              style={styles.actionBtn}
            />
            <AppButton
              label="Library"
              icon="images-outline"
              variant="secondary"
              size="md"
              onPress={pickFromLibrary}
              style={styles.actionBtn}
            />
          </View>

          {entries.length === 0 ? (
            <AppButton label="Done" onPress={handleClose} />
          ) : (
            <>
              <AppButton
                label={`Save ${entries.length} item${entries.length > 1 ? "s" : ""}`}
                icon="checkmark"
                loading={processing}
                disabled={!allCategorized}
                onPress={saveEntries}
              />
              {!allCategorized ? (
                <Text style={styles.hint}>Pick a category for every photo to save.</Text>
              ) : null}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
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
    width: 62,
    height: 76,
    borderRadius: 12,
    backgroundColor: theme.colors.border,
  },
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
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
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

  actionsRow: { flexDirection: "row", gap: 10, marginTop: 16, marginBottom: 12 },
  actionBtn: { flex: 1 },
  hint: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: "center",
    marginTop: 10,
  },
});
