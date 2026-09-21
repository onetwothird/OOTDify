// C:\OOTDify\src\features\capture\CaptureClothesModal.tsx
// Capture flow: take/choose photos → upload to the PRIVATE `wardrobe` bucket →
// insert real rows into public.clothing_items. No scanner stub, no local-only
// items, no fake detection. The user picks the category; we never guess.
//
// PRIVACY: the camera permission is requested only when the user taps
// "Take Photo" (with the context copy below). Library picks use the system
// photo picker — no broad gallery permission is requested on Android.
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { insertClothingItem, uploadToWardrobeBucket } from "../clothing/service";
import { ClothingItem } from "../clothing/types";
import { WardrobeStore } from "../wardrobe/store";
import { useCaptureModalStore } from "./captureModalStore";

const CATEGORIES = ["Tops", "Bottoms", "Outerwear", "Shoes", "Dresses", "Bags", "Accessories"];

type CapturedEntry = { uri: string; category: string };

export default function CaptureClothesModal() {
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
    // taps "Take Photo" and has read the context copy below.
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
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, category } : e)),
    );
  };

  const removeEntry = (uri: string) => {
    setEntries((prev) => prev.filter((e) => e.uri !== uri));
  };

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
    <Modal
      visible={isOpen}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Add to Closet</Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close-outline" size={26} color="#18181B" />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            Photos are stored privately and only ever shown to you. Pick a
            category for each item — we never guess what it is.
          </Text>

          {entries.length > 0 && (
            <ScrollView style={styles.itemsList} showsVerticalScrollIndicator={false}>
              {entries.map((entry, idx) => (
                <View key={entry.uri} style={styles.itemRow}>
                  <View style={styles.itemImageWrap}>
                    <Image source={{ uri: entry.uri }} style={styles.itemImage} />
                    <TouchableOpacity
                      style={styles.removeBadge}
                      onPress={() => removeEntry(entry.uri)}
                    >
                      <Ionicons name="close" size={12} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.chipWrap}>
                    {CATEGORIES.map((cat) => (
                      <TouchableOpacity
                        key={cat}
                        style={[
                          styles.chip,
                          entry.category === cat && styles.chipActive,
                        ]}
                        onPress={() => setCategory(idx, cat)}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            entry.category === cat && styles.chipTextActive,
                          ]}
                        >
                          {cat}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.captureBtn} onPress={takePhoto}>
              <Ionicons name="camera" size={20} color="#FFF" />
              <Text style={styles.captureBtnText}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.libraryBtn} onPress={pickFromLibrary}>
              <Ionicons name="images-outline" size={20} color="#18181B" />
              <Text style={styles.libraryBtnText}>Choose Photos</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.doneBtn}
            onPress={saveEntries}
            disabled={processing}
          >
            {processing ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.doneBtnText}>
                {entries.length
                  ? `Save ${entries.length} Item${entries.length > 1 ? "s" : ""} to Closet`
                  : "Skip for now"}
              </Text>
            )}
          </TouchableOpacity>
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
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: { fontSize: 20, fontWeight: "800", color: "#18181B" },
  subtitle: {
    fontSize: 13,
    color: "#71717A",
    lineHeight: 19,
    marginBottom: 16,
  },
  itemsList: { maxHeight: 260, marginBottom: 12 },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  itemImageWrap: { marginRight: 12, position: "relative" },
  itemImage: {
    width: 64,
    height: 76,
    borderRadius: 12,
    backgroundColor: "#F4F4F5",
  },
  removeBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#18181B",
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  chipWrap: { flex: 1, flexDirection: "row", flexWrap: "wrap" },
  chip: {
    backgroundColor: "#F4F4F5",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginRight: 6,
    marginBottom: 6,
  },
  chipActive: { backgroundColor: "#18181B" },
  chipText: { fontSize: 11, fontWeight: "600", color: "#71717A" },
  chipTextActive: { color: "#FFF" },
  actionsRow: { flexDirection: "row", marginBottom: 16 },
  captureBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#18181B",
    paddingVertical: 14,
    borderRadius: 16,
    marginRight: 10,
  },
  captureBtnText: { color: "#FFF", fontWeight: "700", marginLeft: 8, fontSize: 14 },
  libraryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F4F5",
    paddingVertical: 14,
    borderRadius: 16,
  },
  libraryBtnText: { color: "#18181B", fontWeight: "700", marginLeft: 8, fontSize: 14 },
  doneBtn: {
    backgroundColor: "#18181B",
    paddingVertical: 16,
    borderRadius: 100,
    alignItems: "center",
  },
  doneBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
});