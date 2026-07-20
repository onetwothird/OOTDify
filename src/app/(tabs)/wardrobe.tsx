import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { searchCloset } from "../../features/search/search";
import { theme } from "../../shared/config/theme";
import { supabase } from "../../shared/lib/supabase";
import { useCaptureModalStore } from "../../store/captureModalStore";
import { useWardrobeStore, WardrobeStore } from "../../store/wardrobeStore";

const filters = ["All", "Headwear", "Tops", "Outerwear", "Bottoms", "Shoes"];

export default function WardrobeScreen() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [hydrating, setHydrating] = useState(true);

  // Reactive - this list updates instantly whenever new clothes are
  // captured via the (+) button, from anywhere in the app.
  const wardrobeItems = useWardrobeStore((s) => s.items);
  const openCapture = useCaptureModalStore((s) => s.open);

  useEffect(() => {
    hydrateFromCloud();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pull any previously saved items from Supabase once on mount, but never
  // stomp on items that were just captured locally in this session.
  const hydrateFromCloud = async () => {
    try {
      if (wardrobeItems.length > 0) {
        setHydrating(false);
        return;
      }
      if (!supabase || typeof supabase.from !== "function") {
        setHydrating(false);
        return;
      }

      const { data, error } = await supabase.from("clothing_items").select("*");
      if (error) {
        console.warn("Error fetching wardrobe from Supabase:", error.message);
      } else if (data?.length) {
        const normalized = data.map((row: any) => ({
          id: String(row.id),
          name: row.name || row.category || "Item",
          category: row.category || "unknown",
          images: [row.image_url].filter(Boolean),
          tags: row.tags || [],
          wearCount: row.wear_count || 0,
        }));
        WardrobeStore.save(normalized);
      }
    } catch (e) {
      console.warn("Unexpected error hydrating wardrobe:", e);
    } finally {
      setHydrating(false);
    }
  };

  const searched = searchQuery
    ? searchCloset(wardrobeItems || [], searchQuery)
    : wardrobeItems;
  const filteredItems =
    activeFilter === "All"
      ? searched
      : (searched || []).filter(
          (item) =>
            (item.category || "").toLowerCase() === activeFilter.toLowerCase(),
        );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>My Wardrobe</Text>
          <Text style={styles.headerSubtitle}>
            {wardrobeItems.length} item{wardrobeItems.length === 1 ? "" : "s"}
          </Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={openCapture}>
          <Ionicons name="add" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons
          name="search-outline"
          size={20}
          color="#A1A1AA"
          style={styles.searchIcon}
        />
        <TextInput
          placeholder="What are you looking for..."
          placeholderTextColor="#A1A1AA"
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <View style={styles.filterWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {filters.map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[
                styles.filterPill,
                activeFilter === filter
                  ? styles.activeFilterPill
                  : styles.inactiveFilterPill,
              ]}
              onPress={() => setActiveFilter(filter)}
            >
              <Text
                style={[
                  styles.filterText,
                  activeFilter === filter
                    ? styles.activeFilterText
                    : styles.inactiveFilterText,
                ]}
              >
                {filter}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {hydrating && wardrobeItems.length === 0 ? (
        <ActivityIndicator
          size="large"
          color={theme.colors.primary}
          style={{ marginTop: 40 }}
        />
      ) : (
        <FlatList
          data={filteredItems}
          numColumns={2}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          columnWrapperStyle={styles.row}
          contentContainerStyle={{ paddingBottom: 120 }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="shirt-outline" size={36} color="#D4D4D8" />
              <Text style={styles.emptyText}>
                No items yet. Tap the + button to snap photos of your clothes.
              </Text>
              <TouchableOpacity style={styles.emptyCta} onPress={openCapture}>
                <Text style={styles.emptyCtaText}>Add Your First Item</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.cardContainer}>
              <View style={styles.cardInner}>
                <Image
                  source={{ uri: item.images?.[0] || "" }}
                  style={styles.cardImage}
                />
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>
                    {item.name || item.category}
                  </Text>
                  <Text style={styles.cardSubtitle}>
                    {item.category || "Unknown"}
                  </Text>
                </View>
                <View style={styles.cardRight}>
                  <Text style={styles.wearCount}>
                    {(item.wearCount || 0) + ""}x
                  </Text>
                </View>
              </View>
            </View>
          )}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push("/(tabs)/settings")}
      >
        <View style={styles.fabIcon}>
          <Ionicons name="settings" size={20} color="#fff" />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.background,
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 60,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  headerTitle: { fontSize: 32, fontWeight: "900", color: "#18181B" },
  headerSubtitle: {
    fontSize: 13,
    color: "#71717A",
    fontWeight: "600",
    marginTop: 2,
  },
  addButton: {
    backgroundColor: "#18181B",
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F4F4F5",
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: "#18181B" },
  filterWrapper: { marginBottom: 24 },
  filterScroll: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  filterPill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    marginRight: 10,
    backgroundColor: "#F4F4F5",
  },
  activeFilterPill: { backgroundColor: "#18181B" },
  inactiveFilterPill: { backgroundColor: "#F4F4F5" },
  filterText: { fontSize: 14, fontWeight: "600" },
  activeFilterText: { color: "#FFFFFF" },
  inactiveFilterText: { color: "#71717A" },
  row: { justifyContent: "space-between", marginBottom: 24 },
  cardContainer: { width: "48%" },
  cardImage: {
    width: "100%",
    height: 140,
    borderRadius: 16,
    backgroundColor: "#F4F4F5",
    resizeMode: "cover",
    marginBottom: 10,
  },
  cardInner: {
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
    elevation: 2,
  },
  cardBody: { padding: 8, flex: 1 },
  cardRight: { padding: 8, justifyContent: "center", alignItems: "flex-end" },
  cardSubtitle: { color: "#777", fontSize: 12 },
  wearCount: { fontWeight: "700", color: theme.colors.primary },
  fab: {
    position: "absolute",
    right: 18,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.surface,
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
  },
  fabIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#18181B",
    textTransform: "capitalize",
  },
  emptyState: { paddingVertical: 60, alignItems: "center", paddingHorizontal: 32 },
  emptyText: {
    textAlign: "center",
    color: "#71717A",
    marginTop: 12,
    marginBottom: 20,
    fontSize: 14,
    lineHeight: 20,
  },
  emptyCta: {
    backgroundColor: "#18181B",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
  },
  emptyCtaText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
});