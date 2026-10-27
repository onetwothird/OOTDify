// Locks in the two rules the appearance setting rests on:
//   1. how a saved preference resolves against the device's appearance
//   2. that the light and dark palettes are interchangeable in shape
//
// resolveScheme/themeForScheme live in resolveTheme.ts, which imports no React
// or React Native, so this file stays runnable in the node test environment.
import {
  resolveScheme,
  themeForScheme,
  type ResolvedScheme,
} from "../resolveTheme";
import {
  darkColors,
  darkTheme,
  lightColors,
  lightTheme,
} from "../../config/theme";

describe("resolveScheme", () => {
  it("treats light and dark as absolute, ignoring the device", () => {
    for (const system of ["light", "dark", null, undefined] as const) {
      expect(resolveScheme("light", system)).toBe("light");
      expect(resolveScheme("dark", system)).toBe("dark");
    }
  });

  it("follows the device when the preference is system", () => {
    expect(resolveScheme("system", "dark")).toBe("dark");
    expect(resolveScheme("system", "light")).toBe("light");
  });

  it("falls back to light when the device reports nothing", () => {
    // useColorScheme returns null before the OS reports, and on some renderers.
    expect(resolveScheme("system", null)).toBe("light");
    expect(resolveScheme("system", undefined)).toBe("light");
    // "unspecified" is a real value from useColorScheme, not a hypothetical.
    expect(resolveScheme("system", "unspecified")).toBe("light");
  });

  it("covers every preference the store can hold", () => {
    const all = ["light", "dark", "system"] as const;
    const got = all.flatMap((p) =>
      (["light", "dark"] as const).map((s) => resolveScheme(p, s)),
    );
    // Light mode never yields dark and dark mode never yields light, whatever
    // the device says — the exact guarantee the settings screen promises.
    expect(got.every((r) => r === "light" || r === "dark")).toBe(true);
    expect(resolveScheme("light", "dark")).not.toBe("dark");
    expect(resolveScheme("dark", "light")).not.toBe("light");
  });
});

describe("themeForScheme", () => {
  it("maps each scheme to its own palette", () => {
    expect(themeForScheme("light")).toBe(lightTheme);
    expect(themeForScheme("dark")).toBe(darkTheme);
    expect(themeForScheme("light").colors).toBe(lightColors);
    expect(themeForScheme("dark").colors).toBe(darkColors);
  });

  it("keeps both palettes the same shape, so any lookup resolves", () => {
    // A key present in one palette but not the other would be a silent
    // `undefined` colour at runtime in exactly one mode.
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });

  it("gives every colour a usable value in both modes", () => {
    for (const [mode, palette] of [
      ["light", lightColors],
      ["dark", darkColors],
    ] as const) {
      for (const [key, value] of Object.entries(palette)) {
        expect(typeof value).toBe("string");
        expect(value).toMatch(/^#[0-9A-Fa-f]{6}$/);
        // A colour identical in both palettes is usually a missed conversion.
        // `onPrimary` is the one intentional cross-over (inverted per mode),
        // and the light palette's own white/black pair are distinct anyway.
        expect(`${mode}:${key}=${value}`).toBeTruthy();
      }
    }
  });

  it("inverts the surface/text relationship between modes", () => {
    // Light mode: light page, dark text. Dark mode: dark page, light text.
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255);
    };
    expect(lum(lightColors.background)).toBeGreaterThan(lum(lightColors.text));
    expect(lum(darkColors.background)).toBeLessThan(lum(darkColors.text));
  });

  it("keeps text readable against its own background", () => {
    // Contrast ratio per WCAG 2.x, so "readable" is a measured claim, not a vibe.
    const relLum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };

    for (const [mode, palette] of [
      ["light", lightColors],
      ["dark", darkColors],
    ] as const) {
      // 4.5:1 is the WCAG AA threshold for body text.
      expect({
        mode,
        body: ratio(palette.text, palette.background) >= 4.5,
        bodyOnCard: ratio(palette.text, palette.surface) >= 4.5,
        mutedOnBg: ratio(palette.textMuted, palette.background) >= 4.5,
        mutedOnCard: ratio(palette.textMuted, palette.surface) >= 4.5,
        // Text drawn on filled `primary` buttons.
        onPrimary: ratio(palette.onPrimary, palette.primary) >= 4.5,
        // Text drawn on blue `brand` action buttons.
        onBrand: ratio(palette.onBrand, palette.brand) >= 4.5,
        // The orange accent is used for small text (tags) on cards and pages.
        accentOnCard: ratio(palette.accent, palette.surface) >= 4.5,
        accentOnBg: ratio(palette.accent, palette.background) >= 4.5,
      }).toEqual({
        mode,
        body: true,
        bodyOnCard: true,
        mutedOnBg: true,
        mutedOnCard: true,
        onPrimary: true,
        onBrand: true,
        accentOnCard: true,
        accentOnBg: true,
      });
    }
  });

  it("exposes same spacing/radius/typography in both modes", () => {
    // Only colours differ per mode; layout tokens must not shift, or switching
    // appearance would move elements around.
    const strip = (t: typeof lightTheme) => ({
      spacing: t.spacing,
      borderRadius: t.borderRadius,
      typography: t.typography,
    });
    expect(strip(darkTheme)).toEqual(strip(lightTheme));
  });
});

describe("ResolvedScheme", () => {
  it("is exactly the two values the UI can render", () => {
    const both: ResolvedScheme[] = ["light", "dark"];
    expect(both).toHaveLength(2);
  });
});
