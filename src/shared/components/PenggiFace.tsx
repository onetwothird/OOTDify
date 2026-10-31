// C:\OOTDify\src\shared\components\PenggiFace.tsx
// Penggi's face, alive: drops in with a little spin, tilts his head every few
// seconds, and on a tap does a full spin with a pop. `onPress` (optional) runs
// once the spin has mostly played, so the reaction is seen before anything
// opens. Used in place of a wordmark (welcome screen) and on Home's header.
import { Image, type ImageSource } from "expo-image";
import { useEffect, useState } from "react";
import { Animated, Easing, Pressable, type StyleProp, type ViewStyle } from "react-native";

import { useReduceMotion } from "../hooks/useReduceMotion";

/** Pause between Penggi's idle head tilts. */
const TILT_EVERY_MS = 3600;
const SPIN_MS = 720;
/** When onPress fires, part-way through the spin. */
const PRESS_AFTER_MS = 420;

export function PenggiFace({
  size = 64,
  accessibilityLabel,
  onPress,
  style,
  source,
}: {
  size?: number;
  /** Another Penggi picture; his round face by default. */
  source?: ImageSource | number;
  accessibilityLabel: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useReduceMotion();
  const [drop] = useState(() => new Animated.Value(0));
  const [tilt] = useState(() => new Animated.Value(0));
  const [spin] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) return;
    const intro = Animated.spring(drop, { toValue: 1, friction: 5, tension: 70, delay: 120, useNativeDriver: true });
    const idle = Animated.loop(
      Animated.sequence([
        Animated.delay(TILT_EVERY_MS),
        Animated.timing(tilt, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(tilt, { toValue: -0.6, duration: 300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.spring(tilt, { toValue: 0, friction: 4, tension: 90, useNativeDriver: true }),
      ]),
    );
    intro.start();
    idle.start();
    return () => {
      intro.stop();
      idle.stop();
    };
  }, [drop, tilt, reduceMotion]);

  // A pending onPress from a spin that's still playing.
  const [pending, setPending] = useState(0);
  useEffect(() => {
    if (!pending || !onPress) return;
    const id = setTimeout(onPress, reduceMotion ? 0 : PRESS_AFTER_MS);
    return () => clearTimeout(id);
    // Only a new tap schedules a new press.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const tap = () => {
    if (!reduceMotion) {
      spin.setValue(0);
      Animated.timing(spin, { toValue: 1, duration: SPIN_MS, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }).start();
    }
    if (onPress) setPending((n) => n + 1);
  };

  const transform = reduceMotion
    ? []
    : [
        { translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) },
        { rotate: drop.interpolate({ inputRange: [0, 1], outputRange: ["-25deg", "0deg"] }) },
        { rotate: tilt.interpolate({ inputRange: [-1, 1], outputRange: ["-10deg", "10deg"] }) },
        { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) },
        { scale: spin.interpolate({ inputRange: [0, 0.4, 1], outputRange: [1, 1.22, 1] }) },
      ];

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={tap} hitSlop={8} style={style}>
      <Animated.View style={{ width: size, height: size, opacity: reduceMotion ? 1 : drop, transform }}>
        <Image
          source={source ?? require("../../../assets/images/front-penggi.png")}
          style={{ width: size, height: size }}
          contentFit="contain"
        />
      </Animated.View>
    </Pressable>
  );
}
