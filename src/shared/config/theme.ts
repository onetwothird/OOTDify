// C:\OOTDify\src\shared\config\theme.ts
// OOTDify design tokens — strict black / white / gray (editorial monochrome).
// One near-black ink, one muted gray, one light gray surface, nothing warm.
//
// There are TWO palettes: light and dark. Both keep the same key set, so any
// `theme.colors.X` reference resolves in either mode. The light palette is the
// original one, byte-identical, so light mode looks exactly as it always has.
//
// Screens must NOT import `theme` directly for colours. They call `useAppTheme()`
// (see src/shared/theme/ThemeProvider.tsx), which returns the palette currently
// in effect and re-renders when it changes. The static `theme` export below is
// kept only for values that are genuinely mode-independent (spacing, radii,
// typography) and for non-React call sites.

// Widened to `string` per key: the two palettes must share one type, and `as
// const` would pin each key to its light literal, rejecting every dark value.
export type ThemeColors = {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  primary: string;
  primaryMuted: string;
  text: string;
  textMuted: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  onPrimary: string;
  // Tints of onPrimary pre-blended onto `primary` (opaque hex, so every token
  // stays a plain colour): secondary type such as emails, labels, timestamps.
  onPrimaryMuted: string;
  // Hairlines and translucent buttons on `primary` fills.
  onPrimarySubtle: string;
  // Barely-there decoration (blobs, glows) on `primary` fills.
  onPrimaryFaint: string;
  // Barely-there decoration (blobs, glows) on `surface` / `background`.
  textFaint: string;
};

export const lightColors: ThemeColors = {
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
  onPrimaryMuted: "#B8B8B8",
  onPrimarySubtle: "#373737",
  onPrimaryFaint: "#1D1D1D",
  textFaint: "#F5F5F5",
};

// Dark palette: the same monochrome editorial system, inverted. Not a naive
// flip — surfaces step *up* in lightness as they come forward, text is softened
// off pure white to reduce halation on OLED, and the semantic colours are
// lightened so they stay legible against a dark background.
export const darkColors: ThemeColors = {
  // Deepest layer: the page behind everything.
  background: "#0F0F0F",
  // Cards / sheets — one step forward from the page.
  surface: "#1A1A1A",
  // Raised-but-quiet fills (chips, icon tiles).
  surfaceAlt: "#262626",
  border: "#333333",
  // In dark mode the "ink" that reads as emphasis is near-white, so buttons and
  // headings stay high-contrast against the dark page.
  primary: "#F2F2F2",
  primaryMuted: "#242424",
  text: "#F2F2F2",
  textMuted: "#A0A0A0",
  // Accent lifts off charcoal so it remains a visible highlight.
  accent: "#C8C8C8",
  success: "#5FBF8A",
  warning: "#D89A5E",
  danger: "#E2725F",
  // Text/iconography drawn ON `primary` fills. In dark mode `primary` is light,
  // so this must be dark to stay readable (it is the inverse of light mode).
  onPrimary: "#111111",
  // Same roles as light mode: dark ink blended onto the light primary.
  onPrimaryMuted: "#595959",
  onPrimarySubtle: "#D3D3D3",
  onPrimaryFaint: "#E7E7E7",
  textFaint: "#252525",
};

export const theme = {
  colors: lightColors,
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
    heading: { fontSize: 20, lineHeight: 26, fontWeight: "800", letterSpacing: -0.2 },
    subheading: { fontSize: 16, lineHeight: 22, fontWeight: "700", letterSpacing: -0.1 },
    body: { fontSize: 15, lineHeight: 22, fontWeight: "400", letterSpacing: -0.05 },
    caption: { fontSize: 12.5, lineHeight: 17, fontWeight: "500" },
    micro: { fontSize: 10.5, lineHeight: 14, fontWeight: "700", letterSpacing: 1 },
  },
} as const;

export type Theme = typeof theme;

/** A full theme object for a given mode — same shape, mode-specific colours. */
export const lightTheme: Theme = { ...theme, colors: lightColors };
export const darkTheme: Theme = { ...theme, colors: darkColors };
