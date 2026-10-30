// C:\OOTDify\src\shared\components\Mascot.tsx
// "Penny" — the Penggi penguin mascot. Shipped as a transparent PNG so it
// keeps its crisp, no-background look at any size. Moods: happy (welcomes,
// clothes added) and sad (pieces deleted, logging out).
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";

import { useReduceMotion } from "../hooks/useReduceMotion";

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

/**
 * Penggi that changes mood with a little turn instead of a hard cut: it
 * squashes and twists away, swaps to the new mood at the narrowest point and
 * springs back. Tapping it squishes and hops, then calls `onPress`.
 */
export function SwappingMascot({
  size,
  mood,
  onPress,
  accessibilityLabel,
}: {
  size: number;
  mood: MascotMood;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const reduceMotion = useReduceMotion();
  const [shown, setShown] = useState(mood);
  const [turn] = useState(() => new Animated.Value(0));
  const [squish] = useState(() => new Animated.Value(0));

  useEffect(() => {
    // With reduce motion the new mood is drawn directly (see below).
    if (mood === shown || reduceMotion) return;
    const away = Animated.timing(turn, { toValue: 1, duration: 150, easing: Easing.in(Easing.quad), useNativeDriver: true });
    away.start(({ finished }) => {
      if (!finished) return;
      setShown(mood);
      Animated.spring(turn, { toValue: 0, friction: 4, tension: 120, useNativeDriver: true }).start();
    });
    return () => away.stop();
  }, [mood, shown, turn, reduceMotion]);

  const press = () => {
    if (!reduceMotion) {
      squish.setValue(0);
      Animated.sequence([
        Animated.timing(squish, { toValue: 1, duration: 90, useNativeDriver: true }),
        Animated.spring(squish, { toValue: 0, friction: 3, tension: 140, useNativeDriver: true }),
      ]).start();
    }
    onPress?.();
  };

  const transform = reduceMotion
    ? []
    : [
        { scaleX: turn.interpolate({ inputRange: [0, 1], outputRange: [1, 0.25] }) },
        { rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-8deg"] }) },
        { scaleY: squish.interpolate({ inputRange: [0, 1], outputRange: [1, 0.86] }) },
        { scaleX: squish.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) },
      ];

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel}
      disabled={!onPress}
      onPress={press}
    >
      {/* Pivot at the feet so the squish reads as Penggi crouching. */}
      <Animated.View style={{ width: size, height: size, transformOrigin: "50% 95%", transform }}>
        <Mascot size={size} mood={reduceMotion ? mood : shown} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: "center", justifyContent: "center" },
});
