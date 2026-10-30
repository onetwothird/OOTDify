// C:\OOTDify\src\shared\components\Mascot.tsx
// "Penny" — the Penggi penguin mascot. Shipped as a transparent PNG so it
// keeps its crisp, no-background look at any size. Moods: happy (welcomes,
// clothes added) and sad (pieces deleted, logging out).
import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

const PENGUIN = {
  default: require("../../../assets/images/mascot-penggi.png"),
  happy: require("../../../assets/images/add-clothes-penggi.png"),
  sad: require("../../../assets/images/deleted-penggi.png"),
};

export type MascotMood = keyof typeof PENGUIN;

export function Mascot({ size = 44, mood = "default" }: { size?: number; mood?: MascotMood }) {
  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      <Image
        source={PENGUIN[mood]}
        style={{ width: size, height: size }}
        contentFit="contain"
        transition={120}
        accessibilityLabel="Penggi penguin mascot"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: "center", justifyContent: "center" },
});
