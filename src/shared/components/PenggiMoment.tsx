// C:\OOTDify\src\shared\components\PenggiMoment.tsx
// Penggi reacting to what just happened: happy Penggi celebrates with
// confetti when you sign in, hops in when clothes are added, and sad Penggi
// sways when a piece is deleted. Mounted
// once at the root (next to ToastHost) and shown through the tiny store
// below, so any screen can call penggi.show(...). It never blocks taps and
// leaves on its own; with "reduce motion" on it only fades.
import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { create } from "zustand";

import { useReduceMotion } from "../hooks/useReduceMotion";
import { makeStyles } from "../theme/makeStyles";
import { useAppTheme } from "../theme/ThemeProvider";
import { Mascot } from "./Mascot";

type Kind = "welcome" | "added" | "deleted";

interface Moment {
  id: number;
  kind: Kind;
  title: string;
  message?: string;
}

const useMomentStore = create<{ moment: Moment | null; show: (m: Omit<Moment, "id">) => void; clear: () => void }>(
  (set) => ({
    moment: null,
    show: (m) => set({ moment: { ...m, id: Date.now() } }),
    clear: () => set({ moment: null }),
  }),
);

export const penggi = {
  show: (kind: Kind, title: string, message?: string) => useMomentStore.getState().show({ kind, title, message }),
};

const HOLD_MS = 1700;
const SIZE = 132;
/** Confetti for the welcome: angle (deg) and distance of each piece's flight. */
const CONFETTI = Array.from({ length: 14 }, (_, i) => ({
  angle: -165 + (i * 150) / 13,
  distance: 90 + (i % 3) * 22,
  spin: (i % 2 ? 1 : -1) * (180 + i * 25),
}));

export function PenggiMomentHost() {
  const moment = useMomentStore((s) => s.moment);
  if (!moment) return null;
  // Keyed by id so a new moment restarts the animation from the top.
  return <PenggiMomentCard key={moment.id} moment={moment} />;
}

function PenggiMomentCard({ moment }: { moment: Moment }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [enter] = useState(() => new Animated.Value(0));
  const [play] = useState(() => new Animated.Value(0));
  const [burst] = useState(() => new Animated.Value(0));
  const theme = useAppTheme();
  const happy = moment.kind !== "deleted";
  const celebrate = moment.kind === "welcome";
  const confettiColors = [theme.colors.brand, theme.colors.accent, theme.colors.success, theme.colors.warning];

  useEffect(() => {
    const clear = () => useMomentStore.getState().clear();
    if (reduceMotion) {
      const fade = Animated.sequence([
        Animated.timing(enter, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.delay(HOLD_MS),
        Animated.timing(enter, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]);
      fade.start(({ finished }) => finished && clear());
      return () => fade.stop();
    }
    const run = Animated.sequence([
      Animated.spring(enter, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
      // Welcome: confetti bursts while Penggi hops three times. Added: two
      // hops. Deleted: a slow sway.
      Animated.parallel([
        Animated.timing(burst, {
          toValue: celebrate ? 1 : 0,
          duration: celebrate ? 1100 : 0,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.loop(
          Animated.sequence([
            Animated.timing(play, { toValue: 1, duration: happy ? 220 : 520, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(play, { toValue: 0, duration: happy ? 260 : 520, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          ]),
          { iterations: celebrate ? 3 : happy ? 2 : 1 },
        ),
      ]),
      Animated.delay(celebrate ? 900 : happy ? 600 : 500),
      Animated.timing(enter, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]);
    run.start(({ finished }) => finished && clear());
    return () => run.stop();
  }, [enter, play, burst, happy, celebrate, reduceMotion]);

  const motion = reduceMotion
    ? []
    : celebrate
      ? [
          { translateY: play.interpolate({ inputRange: [0, 1], outputRange: [0, -22] }) },
          { rotate: play.interpolate({ inputRange: [0, 1], outputRange: ["-6deg", "6deg"] }) },
        ]
      : happy
        ? [{ translateY: play.interpolate({ inputRange: [0, 1], outputRange: [0, -18] }) }]
        : [{ rotate: play.interpolate({ inputRange: [0, 1], outputRange: ["-5deg", "5deg"] }) }];

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.layer, { paddingBottom: insets.bottom + 96 }]}>
      <Animated.View
        accessibilityLiveRegion="polite"
        accessibilityLabel={moment.message ? `${moment.title}. ${moment.message}` : moment.title}
        style={[
          styles.card,
          {
            opacity: enter,
            transform: reduceMotion
              ? []
              : [
                  { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [happy ? 40 : -30, 0] }) },
                  { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
                ],
          },
        ]}
      >
        <View style={styles.stage}>
          {celebrate && !reduceMotion
            ? CONFETTI.map((c, i) => {
                const rad = (c.angle * Math.PI) / 180;
                return (
                  <Animated.View
                    key={i}
                    style={[
                      styles.confetti,
                      i % 3 === 0 && styles.confettiRound,
                      {
                        backgroundColor: confettiColors[i % confettiColors.length],
                        opacity: burst.interpolate({ inputRange: [0, 0.1, 0.75, 1], outputRange: [0, 1, 1, 0] }),
                        transform: [
                          { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(rad) * c.distance] }) },
                          // Out and up, then drifting down a little as it falls.
                          {
                            translateY: burst.interpolate({
                              inputRange: [0, 0.6, 1],
                              outputRange: [0, Math.sin(rad) * c.distance, Math.sin(rad) * c.distance + 26],
                            }),
                          },
                          { rotate: burst.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${c.spin}deg`] }) },
                        ],
                      },
                    ]}
                  />
                );
              })
            : null}
          <Animated.View style={{ transform: motion }}>
            <Mascot size={SIZE} mood={happy ? "happy" : "sad"} />
          </Animated.View>
        </View>
        <Text style={styles.title}>{moment.title}</Text>
        {moment.message ? <Text style={styles.message}>{moment.message}</Text> : null}
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  layer: { alignItems: "center", justifyContent: "flex-end", zIndex: 1000, elevation: 1000 },
  card: {
    alignItems: "center",
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 16,
    maxWidth: 280,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  stage: { alignItems: "center", justifyContent: "center" },
  confetti: { position: "absolute", width: 8, height: 12, borderRadius: 2 },
  confettiRound: { width: 9, height: 9, borderRadius: 5 },
  title: { fontSize: 16, fontWeight: "800", color: theme.colors.text, textAlign: "center", marginTop: 2 },
  message: { fontSize: 13, color: theme.colors.textMuted, textAlign: "center", marginTop: 3, lineHeight: 18 },
}));
