// C:\OOTDify\src\shared\config\theme.ts
// OOTDify design tokens — strict black / white / gray (editorial monochrome).
// One near-black ink, one muted gray, one light gray surface, nothing warm.

export const theme = {
  colors: {
    // Light gray page background (needle-point white, not cream).
    background: "#F5F5F5",
    // Cards / sheets.
    surface: "#FFFFFF",
    // Raised-but-quiet fills (chips, icon tiles).
    surfaceAlt: "#EDEDED",
    border: "#E3E3E3",
    // Primary ink (buttons, active states, headings).
    primary: "#111111",
    primaryMuted: "#F0F0F0",
    text: "#161616",
    textMuted: "#6E6E6E",
    // Single expressive accent — charcoal, used only as a highlight.
    accent: "#3A3A3A",
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