import AsyncStorage from "@react-native-async-storage/async-storage";
import { WardrobeStore } from "../wardrobe/store";
import { Outfit } from "../outfit/types";

const KEY = "ootd_outfit_history_v1";

export async function recordOutfit(outfit: Outfit) {
  const cur = await getHistory();
  cur.unshift(outfit);

  // Update wardrobe wear counts and lastWorn
  try {
    const storeItems = WardrobeStore.list();
    const now = new Date().toISOString();
    const ids = new Set(outfit.items.map((i) => i.id));
    const updated = storeItems.map((it) => {
      if (ids.has(it.id)) {
        return {
          ...it,
          wearCount: (it.wearCount || 0) + 1,
          lastWorn: now,
        };
      }
      return it;
    });
    WardrobeStore.save(updated);
  } catch (e) {
    // ignore
  }

  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(cur));
  } catch (e) {
    console.warn("Failed to persist outfit history:", e);
  }
}

export async function getHistory(): Promise<Outfit[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Outfit[];
  } catch (e) {
    return [];
  }
}