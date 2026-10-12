// C:\OOTDify\src\shared\components\Mascot.tsx
// "Hangers" — the OOTDify mascot: a friendly hanger-hook character built from
// plain Views (no extra dependencies), drawn at any size via the `size` prop.
import { StyleSheet, View } from "react-native";

import { theme } from "../config/theme";

export function Mascot({ size = 44 }: { size?: number }) {
  const head = Math.round(size * 0.72);
  const eye = Math.round(size * 0.14);
  const pupil = Math.round(eye * 0.5);
  const mouthW = Math.round(size * 0.3);
  const blushW = Math.round(size * 0.09);

  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      {/* Hanger hook */}
      <View
        style={[
          styles.hook,
          {
            width: Math.round(size * 0.18),
            height: Math.round(size * 0.16),
            borderTopLeftRadius: Math.round(size * 0.09),
            borderTopRightRadius: Math.round(size * 0.09),
          },
        ]}
      />
      {/* Face */}
      <View
        style={[
          styles.head,
          {
            top: Math.round(size * 0.1),
            width: head,
            height: head,
            borderRadius: head / 2,
          },
        ]}
      >
        <View
          style={[
            styles.eyes,
            { gap: Math.round(size * 0.16), marginTop: Math.round(size * 0.24) },
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
        {/* Smile */}
        <View
          style={[
            styles.smile,
            {
              width: mouthW,
              height: Math.round(size * 0.1),
              marginTop: Math.round(size * 0.08),
              borderBottomWidth: Math.round(size * 0.045),
              borderBottomLeftRadius: mouthW / 2,
              borderBottomRightRadius: mouthW / 2,
            },
          ]}
        />
        {/* Blush */}
        <View
          style={[
            styles.blush,
            styles.blushL,
            { left: Math.round(size * 0.12), bottom: Math.round(size * 0.12), width: blushW, height: Math.round(blushW * 0.6), borderRadius: blushW },
          ]}
        />
        <View
          style={[
            styles.blush,
            styles.blushR,
            { right: Math.round(size * 0.12), bottom: Math.round(size * 0.12), width: blushW, height: Math.round(blushW * 0.6), borderRadius: blushW },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: "center",
    justifyContent: "flex-start",
  },
  hook: {
    position: "absolute",
    top: 0,
    backgroundColor: theme.colors.primary,
  },
  head: {
    position: "absolute",
    backgroundColor: theme.colors.primary,
    alignItems: "center",
  },
  eyes: {
    flexDirection: "row",
  },
  eye: {
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  smile: {
    borderBottomColor: theme.colors.surface,
  },
  blush: {
    position: "absolute",
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  blushL: {},
  blushR: {},
});