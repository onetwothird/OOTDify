// C:\OOTDify\src\shared\components\PenggiMoment.tsx
// Penggi reacting to what just happened. Two sizes of moment:
//
//   Screens (welcome, farewell): the whole app goes white, Penggi plays out
//   the moment with no card behind it, then the white lifts to reveal the
//   screen underneath. Welcome celebrates with confetti and hops and then
//   zooms through to Home; farewell cries and then sinks away to sign-in.
//   Cards (added, deleted): a small card near the bottom that never blocks
//   taps; happy Penggi hops in, sad Penggi sways.
//
// Mounted once at the root (next to ToastHost) and shown through the tiny
// store below, so any screen can call penggi.show(...). It survives
// navigation, so a screen moment can cover a route change. A tap anywhere
// on a screen moment skips straight to its transition. With "reduce motion"
// on, everything only fades.
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { create } from "zustand";

import { useReduceMotion } from "../hooks/useReduceMotion";
import { holdPermissions, releasePermissions } from "../lib/permissionGate";
import { useT } from "../i18n/useT";
import { makeStyles } from "../theme/makeStyles";
import { useAppTheme } from "../theme/ThemeProvider";
import { Mascot } from "./Mascot";

type Kind = "welcome" | "farewell" | "added" | "deleted";

interface Moment {
  id: number;
  kind: Kind;
  title: string;
  message?: string;
}

const useMomentStore = create<{ moment: Moment | null; show: (m: Omit<Moment, "id">) => void; clear: () => void }>(
  (set) => ({
    moment: null,
    show: (m) => {
      // A screen moment covers the app: system permission prompts wait for it.
      if (isScreen(m.kind)) holdPermissions(PERMISSION_HOLD, PERMISSION_HOLD_MAX_MS);
      set({ moment: { ...m, id: Date.now() } });
    },
    clear: () => {
      set({ moment: null });
      releasePermissions(PERMISSION_HOLD);
    },
  }),
);

function isScreen(kind: Kind): boolean {
  return kind === "welcome" || kind === "farewell";
}

const PERMISSION_HOLD = "penggi";
/** Longer than any screen moment runs, so a lost clear can't block prompts. */
const PERMISSION_HOLD_MAX_MS = 8000;

export const penggi = {
  show: (kind: Kind, title: string, message?: string) => useMomentStore.getState().show({ kind, title, message }),
  /** A screen moment is about to show: hold permission prompts until it is done. */
  expect: () => holdPermissions(PERMISSION_HOLD, PERMISSION_HOLD_MAX_MS),
};

const HOLD_MS = 1700;
const CARD_SIZE = 132;
const SCREEN_SIZE = 210;
/** Confetti for the welcome: angle (deg) and distance of each piece's flight. */
const CONFETTI = Array.from({ length: 22 }, (_, i) => ({
  angle: -175 + (i * 170) / 21,
  distance: 130 + (i % 4) * 26,
  spin: (i % 2 ? 1 : -1) * (200 + i * 23),
}));
/** Where the farewell tears start, as fractions of Penggi's box (under each eye). */
const TEARS = [
  { x: 0.477, y: 0.463, delay: 0 },
  { x: 0.685, y: 0.403, delay: 420 },
];

export function PenggiMomentHost() {
  const moment = useMomentStore((s) => s.moment);
  if (!moment) return null;
  // Keyed by id so a new moment restarts the animation from the top.
  return isScreen(moment.kind) ? (
    <PenggiScreen key={moment.id} moment={moment} />
  ) : (
    <PenggiMomentCard key={moment.id} moment={moment} />
  );
}

function PenggiScreen({ moment }: { moment: Moment }) {
  const styles = useStyles();
  const theme = useAppTheme();
  const reduceMotion = useReduceMotion();
  const [cover] = useState(() => new Animated.Value(0));
  const [enter] = useState(() => new Animated.Value(0));
  const [leave] = useState(() => new Animated.Value(0));
  const [play] = useState(() => new Animated.Value(0));
  const [burst] = useState(() => new Animated.Value(0));
  const [words] = useState(() => new Animated.Value(0));
  const [tears] = useState(() => TEARS.map(() => new Animated.Value(0)));
  const { t } = useT();
  // Set by the effect: jumps to the transition when the screen is tapped.
  const skipRef = useRef<(() => void) | null>(null);
  const celebrate = moment.kind === "welcome";
  const confettiColors = [theme.colors.brand, theme.colors.accentBright, theme.colors.success, theme.colors.warning];

  useEffect(() => {
    const clear = () => useMomentStore.getState().clear();
    if (reduceMotion) {
      const fade = Animated.sequence([
        Animated.parallel([
          Animated.timing(cover, { toValue: 1, duration: 160, useNativeDriver: true }),
          Animated.timing(enter, { toValue: 1, duration: 160, useNativeDriver: true }),
          Animated.timing(words, { toValue: 1, duration: 160, useNativeDriver: true }),
        ]),
        Animated.delay(HOLD_MS),
        Animated.timing(cover, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]);
      fade.start(({ finished }) => finished && clear());
      skipRef.current = () => {
        skipRef.current = null;
        fade.stop();
        Animated.timing(cover, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => clear());
      };
      return () => fade.stop();
    }

    const intro = Animated.parallel([
      Animated.timing(cover, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(enter, { toValue: 1, friction: 6, tension: 70, delay: 120, useNativeDriver: true }),
      Animated.timing(words, { toValue: 1, duration: 380, delay: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]);

    // Welcome: confetti bursts while Penggi jumps for joy three times.
    // Farewell: Penggi sobs (small quick shakes) while two tears roll down.
    const act = celebrate
      ? Animated.parallel([
          Animated.timing(burst, { toValue: 1, duration: 1300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.loop(
            Animated.sequence([
              Animated.timing(play, { toValue: 1, duration: 210, easing: Easing.out(Easing.quad), useNativeDriver: true }),
              Animated.timing(play, { toValue: 0, duration: 250, easing: Easing.in(Easing.quad), useNativeDriver: true }),
            ]),
            { iterations: 3 },
          ),
        ])
      : Animated.parallel([
          Animated.loop(
            Animated.sequence([
              Animated.timing(play, { toValue: 1, duration: 110, useNativeDriver: true }),
              Animated.timing(play, { toValue: 0, duration: 110, useNativeDriver: true }),
              Animated.timing(play, { toValue: 1, duration: 110, useNativeDriver: true }),
              Animated.timing(play, { toValue: 0, duration: 260, useNativeDriver: true }),
              Animated.delay(240),
            ]),
            { iterations: 3 },
          ),
          ...tears.map((tear, i) =>
            Animated.sequence([
              Animated.delay(TEARS[i].delay),
              Animated.loop(
                Animated.sequence([
                  Animated.timing(tear, { toValue: 1, duration: 950, easing: Easing.in(Easing.quad), useNativeDriver: true }),
                  Animated.timing(tear, { toValue: 0, duration: 0, useNativeDriver: true }),
                ]),
                { iterations: 2 },
              ),
            ]),
          ),
        ]);

    // The white lifts to show the screen underneath: welcome zooms through
    // towards Home, farewell sinks away.
    const outro = () =>
      Animated.parallel([
        Animated.timing(leave, { toValue: 1, duration: 480, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(cover, { toValue: 0, duration: 520, delay: 80, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]);

    const run = Animated.sequence([intro, act, Animated.delay(celebrate ? 650 : 350), outro()]);
    let skipped: Animated.CompositeAnimation | null = null;
    run.start(({ finished }) => finished && clear());
    skipRef.current = () => {
      skipRef.current = null;
      run.stop();
      // Words and Penggi settle where they are, then the usual exit plays.
      skipped = Animated.parallel([
        Animated.timing(words, { toValue: 1, duration: 120, useNativeDriver: true }),
        outro(),
      ]);
      skipped.start(() => clear());
    };
    return () => {
      run.stop();
      skipped?.stop();
    };
  }, [cover, enter, leave, play, burst, words, tears, celebrate, reduceMotion]);

  const mascotMotion = reduceMotion
    ? []
    : [
        { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [celebrate ? 60 : -40, 0] }) },
        { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
        ...(celebrate
          ? [
              { translateY: play.interpolate({ inputRange: [0, 1], outputRange: [0, -34] }) },
              { rotate: play.interpolate({ inputRange: [0, 1], outputRange: ["-7deg", "7deg"] }) },
            ]
          : [
              { translateY: play.interpolate({ inputRange: [0, 1], outputRange: [0, 3] }) },
              { translateX: play.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) },
            ]),
      ];

  const contentLeave = reduceMotion
    ? []
    : celebrate
      ? [{ scale: leave.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }]
      : [
          { translateY: leave.interpolate({ inputRange: [0, 1], outputRange: [0, 40] }) },
          { scale: leave.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] }) },
        ];

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.screen, { opacity: cover }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLiveRegion="polite"
        accessibilityLabel={moment.message ? `${moment.title}. ${moment.message}` : moment.title}
        accessibilityHint={t("penggi.tap_continue")}
        onPress={() => skipRef.current?.()}
        style={styles.screenTap}
      >
        <Animated.View
          style={[
            styles.screenContent,
            { opacity: leave.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.4, 0] }), transform: contentLeave },
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
                          opacity: burst.interpolate({ inputRange: [0, 0.08, 0.75, 1], outputRange: [0, 1, 1, 0] }),
                          transform: [
                            { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(rad) * c.distance] }) },
                            // Out and up, then drifting down as it falls.
                            {
                              translateY: burst.interpolate({
                                inputRange: [0, 0.55, 1],
                                outputRange: [0, Math.sin(rad) * c.distance, Math.sin(rad) * c.distance + 60],
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
            <Animated.View style={{ width: SCREEN_SIZE, height: SCREEN_SIZE, transform: mascotMotion }}>
              <Mascot size={SCREEN_SIZE} mood={celebrate ? "happy" : "sad"} />
              {!celebrate && !reduceMotion
                ? tears.map((tear, i) => (
                    <Animated.View
                      key={i}
                      style={[
                        styles.tear,
                        {
                          left: TEARS[i].x * SCREEN_SIZE,
                          top: TEARS[i].y * SCREEN_SIZE,
                          opacity: tear.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 0.85, 0.85, 0] }),
                          transform: [
                            { translateY: tear.interpolate({ inputRange: [0, 1], outputRange: [0, SCREEN_SIZE * 0.3] }) },
                            { scale: tear.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 1, 0.9] }) },
                            { rotate: "45deg" },
                          ],
                        },
                      ]}
                    />
                  ))
                : null}
            </Animated.View>
          </View>
          {/* A soft floor shadow keeps Penggi standing on something without a card. */}
          <View style={styles.floor} />
          <Animated.View
            style={{
              alignItems: "center",
              opacity: words,
              transform: reduceMotion ? [] : [{ translateY: words.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
            }}
          >
            <Text style={styles.screenTitle}>{moment.title}</Text>
            {moment.message ? <Text style={styles.screenMessage}>{moment.message}</Text> : null}
          </Animated.View>
        </Animated.View>
        <Animated.Text
          style={[
            styles.screenHint,
            { opacity: words.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0, 1] }) },
          ]}
        >
          {t("penggi.tap_continue")}
        </Animated.Text>
      </Pressable>
    </Animated.View>
  );
}

function PenggiMomentCard({ moment }: { moment: Moment }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [enter] = useState(() => new Animated.Value(0));
  const [play] = useState(() => new Animated.Value(0));
  const happy = moment.kind === "added";

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
      // Added: two hops. Deleted: a slow sway.
      Animated.loop(
        Animated.sequence([
          Animated.timing(play, { toValue: 1, duration: happy ? 220 : 520, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(play, { toValue: 0, duration: happy ? 260 : 520, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
        { iterations: happy ? 2 : 1 },
      ),
      Animated.delay(happy ? 600 : 500),
      Animated.timing(enter, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]);
    run.start(({ finished }) => finished && clear());
    return () => run.stop();
  }, [enter, play, happy, reduceMotion]);

  const motion = reduceMotion
    ? []
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
        <Animated.View style={{ transform: motion }}>
          <Mascot size={CARD_SIZE} mood={happy ? "happy" : "sad"} />
        </Animated.View>
        <Text style={styles.title}>{moment.title}</Text>
        {moment.message ? <Text style={styles.message}>{moment.message}</Text> : null}
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  // Screen moments: plain white (the surface colour) over everything.
  screen: {
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  screenTap: { flex: 1, alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
  screenHint: { position: "absolute", bottom: 56, fontSize: 13, fontWeight: "600", color: theme.colors.textMuted },
  screenContent: { alignItems: "center", paddingHorizontal: 32 },
  floor: {
    width: SCREEN_SIZE * 0.5,
    height: 10,
    marginTop: -6,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceAlt,
  },
  screenTitle: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "700",
    letterSpacing: -0.8,
    color: theme.colors.text,
    textAlign: "center",
    marginTop: 22,
  },
  screenMessage: {
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.textMuted,
    textAlign: "center",
    marginTop: 8,
    maxWidth: 300,
  },
  tear: {
    position: "absolute",
    width: SCREEN_SIZE * 0.045,
    height: SCREEN_SIZE * 0.045,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 999,
    borderBottomLeftRadius: 999,
    borderBottomRightRadius: 999,
    backgroundColor: theme.colors.brand,
  },
  // Card moments.
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
  confetti: { position: "absolute", width: 9, height: 14, borderRadius: 2 },
  confettiRound: { width: 10, height: 10, borderRadius: 5 },
  title: { fontSize: 16, fontWeight: "800", color: theme.colors.text, textAlign: "center", marginTop: 2 },
  message: { fontSize: 13, color: theme.colors.textMuted, textAlign: "center", marginTop: 3, lineHeight: 18 },
}));
