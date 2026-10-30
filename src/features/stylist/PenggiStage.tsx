// C:\OOTDify\src\features\stylist\PenggiStage.tsx
// The top of Ask Penggi: Penggi acting out the conversation. Three poses, each
// with its own motion:
//   greeting   thumbs-up Penggi waves (a tilt back and forth) and hops
//   thinking   chin-on-hand Penggi sways slowly; three dots pulse
//   explaining finger-up Penggi bobs while his answer types out, then breathes
// A new pose pops in, so the change reads as Penggi reacting. With Reduce
// Motion on he only changes pose.
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";

import type { Theme } from "../../shared/config/theme";
import { useReduceMotion } from "../../shared/hooks/useReduceMotion";
import { makeStyles } from "../../shared/theme/makeStyles";
import type { PenggiPose } from "./chat";

const POSES: Record<PenggiPose, number> = {
  greeting: require("../../../assets/images/penggi-chat-greeting.png"),
  thinking: require("../../../assets/images/penggi-chat-thinking.png"),
  explaining: require("../../../assets/images/penggi-chat-explaining.png"),
};

const PENGGI = 128;

export function PenggiStage({ pose, typing, line }: { pose: PenggiPose; typing: boolean; line: string }) {
  const styles = useStyles();
  const reduceMotion = useReduceMotion();
  const [pop] = useState(() => new Animated.Value(1));
  const [act] = useState(() => new Animated.Value(0));
  const [dots] = useState(() => [0, 1, 2].map(() => new Animated.Value(0.3)));

  // A new pose pops in.
  useEffect(() => {
    if (reduceMotion) return;
    pop.setValue(0);
    const anim = Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [pose, pop, reduceMotion]);

  // Each pose's own motion.
  useEffect(() => {
    act.setValue(0);
    if (reduceMotion) return;
    const to = (value: number, duration: number, easing = Easing.inOut(Easing.quad)) =>
      Animated.timing(act, { toValue: value, duration, easing, useNativeDriver: true });
    let anim: Animated.CompositeAnimation;
    if (pose === "greeting") {
      // Wave twice, rest, again.
      anim = Animated.loop(
        Animated.sequence([to(1, 180), to(-1, 260), to(1, 260), to(0, 180), Animated.delay(1600)]),
      );
    } else if (pose === "thinking") {
      anim = Animated.loop(Animated.sequence([to(1, 1100), to(-1, 1100)]));
    } else if (typing) {
      // Talking: quick bobs.
      anim = Animated.loop(Animated.sequence([to(1, 150, Easing.out(Easing.quad)), to(0, 170, Easing.in(Easing.quad))]));
    } else {
      anim = Animated.loop(Animated.sequence([to(1, 1600), to(0, 1600)]));
    }
    anim.start();
    return () => anim.stop();
  }, [pose, typing, act, reduceMotion]);

  // Thinking dots, one after another.
  useEffect(() => {
    if (pose !== "thinking" || reduceMotion) return;
    const anim = Animated.loop(
      Animated.stagger(
        180,
        dots.map((d) =>
          Animated.sequence([
            Animated.timing(d, { toValue: 1, duration: 260, useNativeDriver: true }),
            Animated.timing(d, { toValue: 0.3, duration: 260, useNativeDriver: true }),
          ]),
        ),
      ),
    );
    anim.start();
    return () => anim.stop();
  }, [pose, dots, reduceMotion]);

  const motion =
    pose === "greeting"
      ? [
          { rotate: act.interpolate({ inputRange: [-1, 1], outputRange: ["-7deg", "7deg"] }) },
          { translateY: act.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 0, -8] }) },
        ]
      : pose === "thinking"
        ? [{ rotate: act.interpolate({ inputRange: [-1, 1], outputRange: ["-3deg", "3deg"] }) }]
        : typing
          ? [
              { translateY: act.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) },
              { scaleY: act.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) },
            ]
          : [{ scale: act.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] }) }];

  return (
    <View style={styles.stage}>
      <View style={styles.floor} pointerEvents="none" />
      <Animated.View
        style={{
          transform: [
            { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) },
            ...motion,
          ],
        }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Image source={POSES[pose]} style={styles.penggi} contentFit="contain" />
      </Animated.View>
      <View style={styles.speech} accessibilityLiveRegion="polite">
        <View style={styles.speechTail} />
        <Text style={styles.speechText}>{line}</Text>
        {pose === "thinking" ? (
          <View style={styles.dots}>
            {dots.map((d, i) => (
              <Animated.View key={i} style={[styles.dot, { opacity: d }]} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme: Theme) => ({
  stage: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: theme.spacing.page,
    paddingTop: 4,
    gap: 4,
  },
  // Where Penggi stands: a soft shadow line under his feet.
  floor: {
    position: "absolute",
    left: theme.spacing.page + 18,
    bottom: 4,
    width: PENGGI - 36,
    height: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.primaryMuted,
  },
  penggi: { width: PENGGI, height: PENGGI },
  speech: {
    flex: 1,
    marginBottom: PENGGI * 0.42,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    backgroundColor: theme.colors.primaryMuted,
  },
  speechTail: {
    position: "absolute",
    left: -6,
    bottom: 8,
    width: 14,
    height: 14,
    borderRadius: 3,
    transform: [{ rotate: "45deg" }],
    backgroundColor: theme.colors.primaryMuted,
  },
  speechText: { ...theme.typography.body, color: theme.colors.text, fontWeight: "600" },
  dots: { flexDirection: "row", gap: 5, marginTop: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.accentBright },
}));
