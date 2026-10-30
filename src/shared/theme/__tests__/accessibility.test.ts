import { lightTheme } from "../../config/theme";
import { accessibleTheme, adjustTextStyles, TEXT_SIZE_SCALE } from "../accessibility";

describe("accessibleTheme", () => {
  it("returns the plain theme when nothing is turned on", () => {
    expect(accessibleTheme(lightTheme, { textSize: "default", boldText: false, highContrast: false })).toBe(lightTheme);
  });

  it("carries the text size and bold choice", () => {
    const t = accessibleTheme(lightTheme, { textSize: "large", boldText: true, highContrast: false });
    expect(t.text).toEqual({ scale: TEXT_SIZE_SCALE.large, bold: true });
    expect(t.colors).toBe(lightTheme.colors);
  });

  it("pulls secondary text and borders towards the main text colour for contrast", () => {
    const t = accessibleTheme(lightTheme, { textSize: "default", boldText: false, highContrast: true });
    expect(t.colors.textMuted).not.toBe(lightTheme.colors.textMuted);
    expect(t.colors.border).not.toBe(lightTheme.colors.border);
    expect(t.colors.textMuted).toMatch(/^#[0-9A-F]{6}$/);
    expect(t.colors.text).toBe(lightTheme.colors.text);
  });

  it("gives the same object for the same choices, so styles stay cached", () => {
    const opts = { textSize: "xlarge", boldText: false, highContrast: true } as const;
    expect(accessibleTheme(lightTheme, opts)).toBe(accessibleTheme(lightTheme, { ...opts }));
  });
});

describe("adjustTextStyles", () => {
  it("leaves styles alone at the default size without bold", () => {
    const styles = { a: { fontSize: 14 } };
    expect(adjustTextStyles(styles, { scale: 1, bold: false })).toBe(styles);
  });

  it("scales font size and line height, not other numbers", () => {
    const out = adjustTextStyles({ a: { fontSize: 20, lineHeight: 26, padding: 8 } }, { scale: 1.3, bold: false });
    expect(out).toEqual({ a: { fontSize: 26, lineHeight: 34, padding: 8 } });
  });

  it("makes text heavier when bold text is on, and leaves non-text styles alone", () => {
    const out = adjustTextStyles(
      {
        body: { fontSize: 15 },
        mid: { fontSize: 15, fontWeight: "500" as const },
        strong: { fontSize: 15, fontWeight: "800" as const },
        box: { padding: 4 },
      },
      { scale: 1, bold: true },
    );
    expect(out.body).toEqual({ fontSize: 15, fontWeight: "600" });
    expect(out.mid).toEqual({ fontSize: 15, fontWeight: "700" });
    expect(out.strong).toEqual({ fontSize: 15, fontWeight: "800" });
    expect(out.box).toEqual({ padding: 4 });
  });
});
