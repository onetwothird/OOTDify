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
import { scanImages } from "../closet/scanner";
import { WardrobeStore } from "../wardrobe/store";
import { supabase } from "../../shared/lib/supabase";
import { useCaptureModalStore } from "./captureModalStore";

const CATEGORIES = ["Tops", "Bottoms", "Outerwear", "Shoes", "Headwear"];

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
    // category starts unset ("") - if the user doesn't tag it, we fall back
    // to whatever the scanner/API returns instead of guessing wrong.
    setEntries((prev) => [...prev, ...uris.map((uri) => ({ uri, category: "" }))]);
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Camera access needed",
        "Please enable camera access to capture your clothes.",
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
      aspect: [3, 4],
    });
    if (!result.canceled && result.assets?.length) {
      addUris(result.assets.map((a: { uri: string }) => a.uri));
    }
  };

  const pickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Photo access needed",
        "Please enable photo library access to import your clothes.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: 10,
    });
    if (!result.canceled && result.assets?.length) {
      addUris(result.assets.map((a: { uri: string }) => a.uri));
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

  const finishAndScan = async () => {
    if (!entries.length) {
      handleClose();
      return;
    }
    setProcessing(true);
    try {
      const scanned = await scanImages(entries.map((e) => e.uri));
      const finalItems = scanned.map((item, idx) => ({
        ...item,
        // user's tag wins; otherwise fall back to whatever scanImages returned
        category: entries[idx]?.category || item.category,
      }));

      WardrobeStore.addItems(finalItems);

      // best-effort cloud sync - never blocks the local add
      try {
        if (supabase && typeof supabase.from === "function") {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) {
            await supabase.from("clothing_items").insert(
              finalItems.map((item) => ({
                user_id: user.id,
                name: item.name,
                category: item.category,
                image_url: item.images[0],
                tags: item.tags,
              })),
            );
          }
        }
      } catch (e) {
        console.warn("Supabase sync of scanned items failed (kept locally):", e);
      }

      Alert.alert(
        "Added to your wardrobe",
        `${finalItems.length} item${finalItems.length > 1 ? "s" : ""} added. Check the AI Outfits tab for new pairings.`,
      );
      handleClose();
    } catch (e) {
      console.warn("Scanning captured clothes failed:", e);
      Alert.alert(
        "Something went wrong",
        "We couldn't process those photos. Please try again.",
      );
      setProcessing(false);
    }
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
            <Text style={styles.title}>Add to Wardrobe</Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close-outline" size={26} color="#18181B" />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            Snap a photo of each item and we'll add it to your wardrobe so
            the AI Outfits tab can start pairing it right away.
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
            onPress={finishAndScan}
            disabled={processing}
          >
            {processing ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.doneBtnText}>
                {entries.length
                  ? `Add ${entries.length} Item${entries.length > 1 ? "s" : ""} to Wardrobe`
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