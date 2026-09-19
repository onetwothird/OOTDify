import { Image, StyleSheet, Text, View } from "react-native";
import { Outfit } from "../types";

type Props = {
  outfit: Outfit;
};

export default function OutfitCard({ outfit }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Outfit</Text>
      <Text style={styles.meta}>Items: {outfit.items.length}</Text>
      <Text style={styles.meta}>Occasion: {outfit.occasion || "any"}</Text>
      <View style={styles.row}>
        {outfit.items.slice(0, 4).map((it) => (
          <Image
            key={it.id}
            source={{ uri: it.images?.[0] || (it as any).image_url || "" }}
            style={styles.thumb}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, backgroundColor: "#fff" },
  title: { fontWeight: "800", fontSize: 16, marginBottom: 6 },
  meta: { color: "#444" },
  row: { flexDirection: "row", marginTop: 8 },
  thumb: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: "#f3f3f3",
    marginRight: 8,
  },
});