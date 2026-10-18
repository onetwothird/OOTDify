// C:\OOTDify\src\shared\components\Mascot.tsx
// "Penny" — the OOTDify penguin mascot. Built from plain Views so it scales
// cleanly at any `size`, matches the editorial monochrome palette, and needs
// no image assets or extra dependencies.
import { StyleSheet, View } from "react-native";

import { theme } from "../config/theme";

export function Mascot({ size = 44 }: { size?: number }) {
  // Proportional sizing so it looks sharp at any scale.
  const bodyW = Math.round(size * 0.66);
  const bodyH = Math.round(size * 0.7);
  const headR = Math.round(bodyW * 0.45);
  const eye = Math.round(headR * 0.18);
  const pupil = Math.round(eye * 0.45);
  const beakW = Math.round(headR * 0.3);
  const foot = Math.round(size * 0.1);
  const wingW = Math.round(bodyW * 0.18);
  const bellyW = Math.round(bodyW * 0.35);
  const bellyH = Math.round(bodyH * 0.45);

  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      {/* Feet (two little orange-ish ovals) */}
      <View style={styles.feetRow}>
        <View style={[styles.foot, { width: foot, height: Math.round(foot * 0.6) }]} />
        <View style={[styles.foot, { width: foot, height: Math.round(foot * 0.6) }]} />
      </View>

      {/* Body (black rounded rectangle) */}
      <View
        style={[
          styles.body,
          { width: bodyW, height: bodyH, borderRadius: Math.round(bodyW * 0.45) },
        ]}
      >
        {/* White belly */}
        <View
          style={[
            styles.belly,
            {
              width: bellyW,
              height: bellyH,
              borderRadius: Math.round(bellyW * 0.5),
              bottom: Math.round(bodyH * 0.08),
            },
          ]}
        />

        {/* Left wing (flap) */}
        <View
          style={[
            styles.wing,
            styles.wingL,
            { width: wingW, height: Math.round(bodyH * 0.55), borderRadius: wingW },
          ]}
        />

        {/* Right wing (flap) */}
        <View
          style={[
            styles.wing,
            styles.wingR,
            { width: wingW, height: Math.round(bodyH * 0.55), borderRadius: wingW },
          ]}
        />

        {/* Head circle */}
        <View
          style={[
            styles.head,
            { width: headR * 2, height: headR * 2, borderRadius: headR, top: -headR * 0.4 },
          ]}
        >
          {/* Eyes */}
          <View
            style={[
              styles.eyes,
              { gap: Math.round(headR * 0.55), marginTop: Math.round(headR * 0.25) },
            ]}
          >
            {[0, 1].map((i) => (
              <View key={i} style={[styles.eye, { width: eye, height: eye, borderRadius: eye / 2 }]}>
                <View
                  style={{
                    width: pupil,
                    height: pupil,
                    borderRadius: pupil / 2,
                    backgroundColor: theme.colors.text,
                  }}
                />
              </View>
            ))}
          </View>

          {/* Beak (tiny triangle via border trick) */}
          <View style={styles.beak} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: "center",
    justifyContent: "flex-end",
  },
  feetRow: {
    position: "absolute",
    bottom: 0,
    flexDirection: "row",
    gap: Math.round(44 * 0.09), // scales at base 44
  },
  foot: {
    backgroundColor: theme.colors.warning, // warm amber for feet/beak
    borderRadius: 999,
    alignSelf: "center",
  },
  body: {
    position: "absolute",
    backgroundColor: theme.colors.primary, // near-black
    alignItems: "center",
    justifyContent: "flex-start",
  },
  belly: {
    position: "absolute",
    backgroundColor: theme.colors.surface, // white
    alignSelf: "center",
  },
  wing: {
    position: "absolute",
    backgroundColor: theme.colors.primary,
    top: Math.round(44 * 0.12),
  },
  wingL: {
    left: -Math.round(44 * 0.06),
    transform: [{ rotate: "-12deg" }],
  },
  wingR: {
    right: -Math.round(44 * 0.06),
    transform: [{ rotate: "12deg" }],
  },
  head: {
    position: "absolute",
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  eyes: {
    flexDirection: "row",
  },
  eye: {
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  beak: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: theme.colors.warning,
    marginTop: 2,
  },
});