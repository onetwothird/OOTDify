// C:\OOTDify\src\shared\components\Mascot.tsx
// "Penny" — the Penggi penguin mascot. Shipped as a transparent PNG so it
// keeps its crisp, no-background look at any size.
import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

const PENGUIN = require("../../../assets/images/mascot-penggi.png");

export function Mascot({ size = 44 }: { size?: number }) {
  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      <Image
        source={PENGUIN}
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
