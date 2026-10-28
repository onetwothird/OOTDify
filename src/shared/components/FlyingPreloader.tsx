// C:\OOTDify\src\shared\components\FlyingPreloader.tsx
// Penggi flying: the app's launch screen and its page-level loading indicator.
// It bobs and tilts as if riding air, three speed streaks trail behind (its fist
// points up and to the right), and a faint shadow below shrinks as it rises. No
// spinner, no text: the motion is the "working" signal. Uses React Native
// `Animated` on the native driver only (transform + opacity). With the phone's
// reduce-motion setting on, Penggi is drawn still.
//
// `size` scales everything (launch ~168, a list or sheet ~88). Tiny spinners
// inside buttons and avatars stay ActivityIndicator: the penguin is too big for
// them.
import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Image, type StyleProp, View, type ViewStyle } from "react-native";

import { makeStyles } from "../theme/makeStyles";

const ART = require("../../../assets/images/preloader.png");

const STREAKS = [
  { top: 0.58, width: 0.2, delay: 0 },
  { top: 0.7, width: 0.14, delay: 260 },
  { top: 0.46, width: 0.12, delay: 520 },
] as const;

function loop(value: Animated.Value, duration: number) {
  const ease = Easing.inOut(Easing.sin);
  return Animated.loop(
    Animated.sequence([
      Animated.timing(value, { toValue: 1, duration, easing: ease, useNativeDriver: true }),
      Animated.timing(value, { toValue: 0, duration, easing: ease, useNativeDriver: true }),
    ]),
  );
}

export function FlyingPreloader({
  size = 168,
  label = "Loading",
  style,
}: {
  size?: number;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const [still, setStill] = useState(false);
  // Hover height (0 = low, 1 = high) and tilt phase run at different periods so
  // the flight never looks mechanical.
  const [lift] = useState(() => new Animated.Value(0));
  const [tilt] = useState(() => new Animated.Value(0));
  const [streakValues] = useState(() => STREAKS.map(() => new Animated.Value(0)));

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => mounted && setStill(on))
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (still) return;
    const running = [
      loop(lift, 1000),
      loop(tilt, 1350),
      ...streakValues.map((v, i) =>
        Animated.sequence([
          Animated.delay(STREAKS[i].delay),
          Animated.loop(
            Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          ),
        ]),
      ),
    ];
    running.forEach((a) => a.start());
    return () => running.forEach((a) => a.stop());
  }, [still, lift, tilt, streakValues]);

  const bob = size * 0.07;
  const translateY = lift.interpolate({ inputRange: [0, 1], outputRange: [bob, -bob] });
  const rotate = tilt.interpolate({ inputRange: [0, 1], outputRange: ["-4deg", "4deg"] });
  const shadowScale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] });
  const shadowOpacity = lift.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.22] });

  return (
    <View style={[styles.stage, style]} accessible accessibilityRole="progressbar" accessibilityLabel={label}>
      <View style={{ width: size, height: size }}>
        {STREAKS.map((s, i) => (
          <Animated.View
            key={i}
            style={[
              styles.streak,
              {
                left: size * 0.08,
                top: size * s.top,
                width: size * s.width,
                height: Math.max(2, Math.round(size * 0.024)),
                opacity: still
                  ? 0
                  : streakValues[i].interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.7, 0] }),
                transform: [
                  { translateX: streakValues[i].interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.27] }) },
                ],
              },
            ]}
          />
        ))}
        <Animated.View style={{ transform: [{ translateY: still ? 0 : translateY }, { rotate: still ? "0deg" : rotate }] }}>
          <Image source={ART} style={{ width: size, height: size }} resizeMode="contain" accessibilityIgnoresInvertColors />
        </Animated.View>
      </View>
      <Animated.View
        style={[
          styles.shadow,
          {
            width: size * 0.5,
            height: Math.max(6, Math.round(size * 0.07)),
            marginTop: size * 0.1,
            opacity: still ? 0.35 : shadowOpacity,
            transform: [{ scaleX: still ? 1 : shadowScale }],
          },
        ]}
      />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  stage: { alignItems: "center", justifyContent: "center" },
  streak: { position: "absolute", borderRadius: 2, backgroundColor: theme.colors.brand },
  shadow: { borderRadius: 6, backgroundColor: theme.colors.border },
}));
