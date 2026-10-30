// Accessibility choices from Settings applied to the theme: a bigger or
// smaller text size, bold text, and higher contrast. The theme carries the
// text choices and makeStyles applies them to every style it builds, so
// screens need no changes. Pure, so tested.
import type * as ReactNative from "react-native";

import type { Theme } from "../config/theme";
import { mixHex } from "../lib/mixHex";

export type TextSize = "small" | "default" | "large" | "xlarge";

export const TEXT_SIZE_SCALE: Record<TextSize, number> = {
  small: 0.9,
  default: 1,
  large: 1.15,
  xlarge: 1.3,
};

export interface AccessibilityChoices {
  textSize: TextSize;
  boldText: boolean;
  highContrast: boolean;
}

// One object per (theme, choices), so makeStyles' per-theme cache keeps working.
const cache = new WeakMap<Theme, Map<string, Theme>>();

export function accessibleTheme(base: Theme, choices: AccessibilityChoices): Theme {
  const { textSize, boldText, highContrast } = choices;
  if (textSize === "default" && !boldText && !highContrast) return base;
  const key = `${textSize}|${boldText}|${highContrast}`;
  let perBase = cache.get(base);
  if (!perBase) {
    perBase = new Map();
    cache.set(base, perBase);
  }
  const hit = perBase.get(key);
  if (hit) return hit;
  const colors = highContrast
    ? {
        ...base.colors,
        textMuted: mixHex(base.colors.textMuted, base.colors.text, 0.55),
        border: mixHex(base.colors.border, base.colors.text, 0.35),
      }
    : base.colors;
  const made: Theme = { ...base, colors, text: { scale: TEXT_SIZE_SCALE[textSize], bold: boldText } };
  perBase.set(key, made);
  return made;
}

type AnyStyle = ReactNative.ViewStyle | ReactNative.TextStyle | ReactNative.ImageStyle;

/** Heavier by one step, so emphasis survives: regular to semibold, medium/semibold to bold. */
function bolder(weight: ReactNative.TextStyle["fontWeight"]): ReactNative.TextStyle["fontWeight"] {
  const n = weight === undefined || weight === "normal" ? 400 : weight === "bold" ? 700 : Number(weight);
  if (n >= 700) return weight;
  return n >= 500 ? "700" : "600";
}

/** Applies the theme's text size and bold choice to a set of named styles. */
export function adjustTextStyles<S extends Record<string, AnyStyle>>(styles: S, text: Theme["text"]): S {
  if (text.scale === 1 && !text.bold) return styles;
  const out: Record<string, AnyStyle> = {};
  for (const [name, style] of Object.entries(styles)) {
    const s = style as ReactNative.TextStyle;
    if (typeof s.fontSize !== "number") {
      out[name] = style;
      continue;
    }
    out[name] = {
      ...s,
      fontSize: Math.round(s.fontSize * text.scale * 2) / 2,
      ...(typeof s.lineHeight === "number" ? { lineHeight: Math.round(s.lineHeight * text.scale) } : {}),
      ...(text.bold ? { fontWeight: bolder(s.fontWeight) } : {}),
    };
  }
  return out as S;
}
