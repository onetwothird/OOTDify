// C:\OOTDify\src\shared\config\theme.ts
// OOTDify design tokens — warm editorial neutrals (ivory/zinc/ink) with a
// single terracotta accent used sparingly. Typography-led, generous spacing,
// intentional radii. Keep new screens on these tokens instead of one-off hexes.

export const theme = {
  colors: {
    // Warm off-white page background (fashion-editorial, not cold gray).
    background: "#F6F4F0",
    // Cards / sheets.
    surface: "#FFFFFF",
    // Raised-but-quiet fills (chips, icon tiles).
    surfaceAlt: "#EFECE6",
    border: "#E5E1D8",
    // Primary ink (buttons, active states, headings).
    primary: "#141414",
    primaryMuted: "#F1EFEA",
    text: "#17150F",
    textMuted: "#6E6A60",
    // Single expressive accent — used only as a highlight, never for large fills.
    accent: "#C4653F",
    success: "#2E7D4F",
    warning: "#A35C2A",
    danger: "#B23A2E",
    onPrimary: "#FFFFFF",
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    page: 16,
    section: 28,
  },
  borderRadius: {
    sm: 10,
    md: 16,
    lg: 24,
    xl: 32,
    pill: 999,
  },
  typography: {
    display: { fontSize: 34, lineHeight: 38, fontWeight: "800", letterSpacing: -1 },
    hero: { fontSize: 26, lineHeight: 32, fontWeight: "800", letterSpacing: -0.5 },
    heading: { fontSize: 20, lineHeight: 26, fontWeight: "800", letterSpacing: -0.3 },
    subheading: { fontSize: 16, lineHeight: 22, fontWeight: "700" },
    body: { fontSize: 14, lineHeight: 20, fontWeight: "400" },
    caption: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
    micro: { fontSize: 10.5, lineHeight: 14, fontWeight: "700", letterSpacing: 1 },
  },
} as const;

export type Theme = typeof theme;