// C:\OOTDify\src\shared\components\Mascot.tsx
// "Penny" — the OOTDify penguin mascot. Shipped as a transparent PNG so it
// keeps its crisp, no-background look at any size. A pre-scaled 512px copy is
// used in the UI (the 2048px master lives at assets/images/mascott.png).
import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

const PENGUIN = require("../../../assets/images/mascot-penguin.png");

export function Mascot({ size = 44 }: { size?: number }) {
  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      <Image
        source={PENGUIN}
        style={{ width: size, height: size }}
        contentFit="contain"
        transition={120}
        accessibilityLabel="OOTDify penguin mascot"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: "center", justifyContent: "center" },
});
