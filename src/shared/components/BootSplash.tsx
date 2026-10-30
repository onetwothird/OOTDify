// C:\OOTDify\src\shared\components\BootSplash.tsx
// The app's own loading view right after the native splash, drawn to match it
// exactly: the same brand blue (app.json's expo-splash-screen backgroundColor)
// and the same sticker Penggi, the same size, in the same place. So the
// launch reads as one blue screen instead of blue → white. Penggi breathes
// gently while the session loads (still under Reduce Motion).
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

import { useReduceMotion } from "../hooks/useReduceMotion";

/** Must equal app.json's expo-splash-screen backgroundColor and imageWidth. */
export const SPLASH_BLUE = "#3A5A96";
const SPLASH_IMAGE_WIDTH = 220;

export function BootSplash() {
  const reduceMotion = useReduceMotion();
  const [breathe] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe, reduceMotion]);

  return (
    <View style={styles.screen} accessibilityLabel="Penggi">
      <Animated.View
        style={{
          transform: reduceMotion ? [] : [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }],
        }}
      >
        <Image
          source={require("../../../assets/images/splash-icon.png")}
          style={styles.image}
          contentFit="contain"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: SPLASH_BLUE },
  image: { width: SPLASH_IMAGE_WIDTH, height: SPLASH_IMAGE_WIDTH },
});
