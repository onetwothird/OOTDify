import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SwipeableLook } from "../../features/wardrobe/components/SwipeableLook";
import { recordOutfit } from "../../features/history/history";
import { scoreOutfit } from "../../features/outfit/compatibility";
import { generateOutfits } from "../../features/outfit/generator";
import { Outfit } from "../../features/outfit/types";
import { theme } from "../../shared/config/theme";
import { supabase } from "../../shared/lib/supabase";
import { useCaptureModalStore } from "../../features/capture/captureModalStore";
import { useWardrobeStore } from "../../features/wardrobe/store";

export default function AIOutfitsScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [candidateOutfits, setCandidateOutfits] = useState<Outfit[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Form States
  const [selectedOccasion, setSelectedOccasion] = useState("Casual");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [selectedDate, setSelectedDate] = useState("2026-02-10"); // Can hook this up to a real date picker later
  const [optimizePlan, setOptimizePlan] = useState(false);

  const wardrobeItems = useWardrobeStore((s) => s.items);
  const openCapture = useCaptureModalStore((s) => s.open);

  const occasions = [
    { name: "Casual", icon: "shirt-outline" },
    { name: "Work", icon: "briefcase-outline" },
    { name: "Dinner", icon: "wine-outline" },
    { name: "Evening", icon: "moon-outline" },
  ];

  // Builds a small pool of candidate outfits from whatever's in the
  // wardrobe right now, so this screen updates automatically as clothes
  // get captured via the (+) button.
  const refillOutfits = async (occasion?: string) => {
    if (!wardrobeItems.length) {
      setCandidateOutfits([]);
      return;
    }
    setIsGenerating(true);
    try {
      const batch: Outfit[] = [];
      for (let i = 0; i < 5; i++) {
        const generated = await generateOutfits(wardrobeItems, { occasion });
        if (generated[0]) batch.push(generated[0]);
      }
      setCandidateOutfits(batch);
      setCurrentIndex(0);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    refillOutfits(selectedOccasion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wardrobeItems.length, selectedOccasion]);

  const currentOutfit = candidateOutfits[currentIndex];

  const advance = () => {
    if (currentIndex < candidateOutfits.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      refillOutfits(selectedOccasion);
    }
  };

  const handleSwipeRight = async () => {
    if (currentOutfit) {
      try {
        await recordOutfit(currentOutfit);
      } catch (e) {
        console.warn("Failed to record outfit:", e);
      }
    }
    advance();
  };

  const handleSwipeLeft = () => {
    advance();
  };

  const handleCreatePlan = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      Alert.alert("Error", "You must be logged in to create a plan.");
      return;
    }

    const { error } = await supabase.from("itinerary_plans").insert({
      user_id: user.id,
      occasion: selectedOccasion,
      city: city,
      country: country,
      is_optimized: optimizePlan,
      scheduled_date: selectedDate,
    });

    if (error) {
      Alert.alert("Error saving plan", error.message);
    } else {
      Alert.alert("Success", "Outfit plan created!");
      setModalVisible(false);
      // Reset form
      setCity("");
      setCountry("");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity>
          <Ionicons name="menu-outline" size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <Text style={styles.dateText}>Mon, Jan 5th</Text>
          <TouchableOpacity
            style={styles.dropdownTrigger}
            onPress={() => setModalVisible(true)}
          >
            <Text style={styles.dropdownText}>Occasion?</Text>
            <Ionicons name="chevron-down" size={14} color={theme.colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={styles.subHeaderLink}
        onPress={() => setModalVisible(true)}
      >
        <Ionicons name="grid-outline" size={20} color={theme.colors.text} />
        <Text style={styles.subHeaderText}>Plan Set of Outfits</Text>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.text} />
      </TouchableOpacity>

      <View style={styles.canvasContainer}>
        {wardrobeItems.length === 0 ? (
          <View style={styles.emptyWardrobeState}>
            <Ionicons
              name="camera-outline"
              size={40}
              color={theme.colors.textMuted}
            />
            <Text style={styles.emptyWardrobeTitle}>No clothes yet</Text>
            <Text style={styles.emptyWardrobeText}>
              Capture a few pieces from your closet and we'll start pairing
              them into outfit ideas right here.
            </Text>
            <TouchableOpacity style={styles.emptyWardrobeCta} onPress={openCapture}>
              <Ionicons name="add" size={16} color="#FFF" />
              <Text style={styles.emptyWardrobeCtaText}>Add Clothes</Text>
            </TouchableOpacity>
          </View>
        ) : isGenerating || !currentOutfit ? (
          <ActivityIndicator
            size="large"
            color={theme.colors.primary}
            style={{ marginTop: 60 }}
          />
        ) : (
          <>
            <SwipeableLook
              items={currentOutfit.items}
              onSwipeLeft={handleSwipeLeft}
              onSwipeRight={handleSwipeRight}
            />
            <View style={styles.compatBadge}>
              <Ionicons name="sparkles" size={12} color="#3F3F46" />
              <Text style={styles.compatBadgeText}>
                {scoreOutfit(currentOutfit)}% match
              </Text>
            </View>
          </>
        )}
      </View>

      {wardrobeItems.length > 0 && (
        <View style={styles.actionButtonGroup}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleSwipeRight}>
            <Text style={styles.primaryButtonText}>Save This Look</Text>
            <Ionicons
              name="checkmark"
              size={18}
              color="#FFF"
              style={{ marginLeft: 4 }}
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleSwipeLeft}>
            <Text style={styles.secondaryButtonText}>Not a Match</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Outfit Itinerary Plan</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons
                  name="close-outline"
                  size={24}
                  color={theme.colors.text}
                />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.inputHeading}>Occasions</Text>
              <View style={styles.occasionsRow}>
                {occasions.map((o) => (
                  <TouchableOpacity
                    key={o.name}
                    style={[
                      styles.occasionChip,
                      selectedOccasion === o.name && styles.activeChip,
                    ]}
                    onPress={() => setSelectedOccasion(o.name)}
                  >
                    <Ionicons
                      name={o.icon as any}
                      size={14}
                      color={
                        selectedOccasion === o.name ? "#FFF" : theme.colors.text
                      }
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[
                        styles.occasionChipText,
                        selectedOccasion === o.name && { color: "#FFF" },
                      ]}
                    >
                      {o.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputHeading}>Where to?</Text>
              <View style={styles.inputRow}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={styles.subLabel}>City</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Manila"
                    placeholderTextColor="#A1A1AA"
                    value={city}
                    onChangeText={setCity}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subLabel}>Country</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Philippines"
                    placeholderTextColor="#A1A1AA"
                    value={country}
                    onChangeText={setCountry}
                  />
                </View>
              </View>

              <Text style={styles.inputHeading}>Select your dates</Text>
              <View style={styles.pickerRow}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Ionicons
                    name="calendar-outline"
                    size={20}
                    color={theme.colors.text}
                    style={{ marginRight: 12 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerMainText}>
                      Plan your schedule
                    </Text>
                    <TextInput
                      style={[
                        styles.pickerSubText,
                        { padding: 0, margin: 0, height: 20 },
                      ]}
                      value={selectedDate}
                      onChangeText={setSelectedDate}
                      placeholder="YYYY-MM-DD"
                    />
                  </View>
                </View>
                <Ionicons
                  name="pencil"
                  size={16}
                  color={theme.colors.textMuted}
                />
              </View>

              <View
                style={[styles.pickerRow, { marginTop: 16, marginBottom: 24 }]}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Ionicons
                    name="git-branch-outline"
                    size={20}
                    color={theme.colors.text}
                    style={{ marginRight: 12 }}
                  />
                  <View>
                    <Text style={styles.pickerMainText}>Optimize Plan?</Text>
                    <Text style={styles.pickerSubText}>Quick Plan</Text>
                  </View>
                </View>
                <Switch
                  value={optimizePlan}
                  onValueChange={setOptimizePlan}
                  trackColor={{ false: "#E4E4E7", true: theme.colors.primary }}
                  thumbColor="#FFF"
                />
              </View>

              <TouchableOpacity
                style={styles.modalSubmitButton}
                onPress={handleCreatePlan}
              >
                <Text style={styles.modalSubmitText}>Create Outfit Plan</Text>
                <Ionicons
                  name="add"
                  size={18}
                  color="#FFF"
                  style={{ marginLeft: 4 }}
                />
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: 55,
    paddingBottom: 120,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
    marginBottom: 20,
  },
  headerRight: { alignItems: "flex-end" },
  dateText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    fontWeight: "600",
  },
  dropdownTrigger: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  dropdownText: {
    fontSize: 18,
    fontWeight: "900",
    color: theme.colors.text,
    marginRight: 4,
  },
  subHeaderLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: theme.spacing.lg,
    marginTop: 10,
  },
  subHeaderText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.text,
    marginLeft: 12,
  },
  canvasContainer: {
    flex: 1,
    marginVertical: 20,
    marginHorizontal: theme.spacing.lg,
    position: "relative",
  },
  compatBadge: {
    position: "absolute",
    top: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    zIndex: 20,
  },
  compatBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#18181B",
    marginLeft: 4,
  },
  emptyWardrobeState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyWardrobeTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.text,
    marginTop: 12,
    marginBottom: 6,
  },
  emptyWardrobeText: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 20,
  },
  emptyWardrobeCta: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
  },
  emptyWardrobeCtaText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 14,
    marginLeft: 6,
  },
  actionButtonGroup: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: 10,
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: theme.borderRadius.md,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  primaryButtonText: { color: "#FFF", fontSize: 15, fontWeight: "600" },
  secondaryButton: {
    backgroundColor: "transparent",
    paddingVertical: 16,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D4D4D8",
  },
  secondaryButtonText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: 40,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
  },
  modalTitle: { fontSize: 20, fontWeight: "800", color: theme.colors.text },
  inputHeading: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.text,
    marginTop: 20,
    marginBottom: 12,
  },
  occasionsRow: { flexDirection: "row", flexWrap: "wrap", marginVertical: 6 },
  occasionChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.primaryMuted,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.sm,
  },
  activeChip: { backgroundColor: theme.colors.primary },
  occasionChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.text,
  },
  inputRow: { flexDirection: "row" },
  subLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginBottom: 6,
    fontWeight: "500",
  },
  textInput: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: theme.colors.text,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.primaryMuted,
    padding: 14,
    borderRadius: theme.borderRadius.md,
  },
  pickerMainText: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
  pickerSubText: { fontSize: 12, color: theme.colors.textMuted, marginTop: 1 },
  modalSubmitButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: theme.borderRadius.md,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  modalSubmitText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
});