// Corner brackets on the preview's safe-zone corners plus one hint line that
// tells the user how to stand. Drawn with plain views over the camera feed;
// the colour fades between white (adjusting) and green (good).
import { useEffect, useState } from "react";
import { Animated, View } from "react-native";

import { useT } from "../../../shared/i18n/useT";
import { makeStyles } from "../../../shared/theme/makeStyles";
import { CAMERA_BG, ON_CAMERA } from "./cameraChrome";
import { SAFE_X, SAFE_Y, type FramingHint } from "./framing";

const GOOD = "#3DDC84";
const BRACKET_LENGTH = 28;
const BRACKET_THICKNESS = 3;
const FADE_MS = 200;

const pct = (n: number) => `${n * 100}%` as const;

export function FramingGuide({ hint, topOffset }: { hint: FramingHint; topOffset: number }) {
  const styles = useStyles();
  const { t } = useT();
  const [tone] = useState(() => new Animated.Value(hint === "good" ? 1 : 0));
  useEffect(() => {
    Animated.timing(tone, { toValue: hint === "good" ? 1 : 0, duration: FADE_MS, useNativeDriver: false }).start();
  }, [hint, tone]);
  const color = tone.interpolate({ inputRange: [0, 1], outputRange: [ON_CAMERA, GOOD] });

  const bracket = (corner: "tl" | "tr" | "bl" | "br") => {
    const top = corner[0] === "t";
    const left = corner[1] === "l";
    return (
      <Animated.View
        key={corner}
        style={[
          styles.bracket,
          top ? { top: pct(SAFE_Y) } : { bottom: pct(SAFE_Y) },
          left ? { left: pct(SAFE_X) } : { right: pct(SAFE_X) },
          {
            borderColor: color,
            borderTopWidth: top ? BRACKET_THICKNESS : 0,
            borderBottomWidth: top ? 0 : BRACKET_THICKNESS,
            borderLeftWidth: left ? BRACKET_THICKNESS : 0,
            borderRightWidth: left ? 0 : BRACKET_THICKNESS,
          },
        ]}
      />
    );
  };

  return (
    <View style={styles.fill} pointerEvents="none">
      {(["tl", "tr", "bl", "br"] as const).map(bracket)}
      <View style={[styles.hintWrap, { top: topOffset }]}>
        <View style={styles.hintPill}>
          <View style={styles.hintScrim} />
          <Animated.Text style={[styles.hintText, { color }]} accessibilityLiveRegion="polite">
            {t(`tryon.live.frame.${hint}`)}
          </Animated.Text>
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  bracket: { position: "absolute", width: BRACKET_LENGTH, height: BRACKET_LENGTH },
  hintWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  hintPill: { borderRadius: 16, overflow: "hidden" },
  hintScrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: CAMERA_BG, opacity: 0.45 },
  hintText: { fontSize: 15, fontWeight: "600", paddingHorizontal: 14, paddingVertical: 6, textAlign: "center" },
}));
