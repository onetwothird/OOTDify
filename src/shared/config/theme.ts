// C:\OOTDify\src\shared\config\theme.ts
// OOTDify design tokens, drawn from the mascot penguin: navy outline, royal
// blue body, sky blue cape, white belly, orange beak.
//
// Blue is for ACTIONS only (`brand`: main buttons, the + button, the selected
// tab), so it stays meaningful. Structure (avatars, tags, chips, toasts) uses
// navy `primary`; pages and cards stay neutral; the beak's orange is the
// accent for favourites and tags.
//
// There are TWO palettes: light and dark. Both keep the same key set, so any
// `theme.colors.X` reference resolves in either mode.
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
  // The beak's full orange, for icons drawn over photos or dark chips, where
  // the deepened text `accent` would look muddy.
  accentBright: string;
  success: string;
  warning: string;
  danger: string;
  // Royal blue for actions; `onBrand` is the text/icon drawn on it.
  brand: string;
  onBrand: string;
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
  // Neutral off-white page; the blues read as colour against it.
  background: "#F5F6F8",
  // Cards / sheets.
  surface: "#FFFFFF",
  // Raised-but-quiet fills (chips, icon tiles).
  surfaceAlt: "#ECEEF2",
  border: "#E1E4EA",
  // The penguin's navy outline: structural fills (avatars, tags, chips).
  primary: "#1B2A4E",
  primaryMuted: "#EDF0F6",
  text: "#171E2E",
  textMuted: "#5D6575",
  // The beak's orange, deepened so small text stays readable.
  accent: "#A64F08",
  accentBright: "#F28C28",
  success: "#2E8A57",
  warning: "#B5641F",
  danger: "#C8402F",
  brand: "#2F5BC4",
  onBrand: "#FFFFFF",
  onPrimary: "#FFFFFF",
  // White blended onto `primary` at 68% / 20% / 9%.
  onPrimaryMuted: "#B6BBC6",
  onPrimarySubtle: "#495571",
  onPrimaryFaint: "#303D5E",
  textFaint: "#EEF0F4",
};

// Dark palette: neutral near-black layers that step lighter as they come
// forward, a soft white-blue for structure, and the cape's sky blue for actions.
export const darkColors: ThemeColors = {
  // Deepest layer: the page behind everything.
  background: "#0F131C",
  // Cards / sheets — one step forward from the page.
  surface: "#171C2C",
  // Raised-but-quiet fills (chips, icon tiles).
  surfaceAlt: "#20273A",
  border: "#2B3348",
  primary: "#E6ECF7",
  primaryMuted: "#1E2537",
  text: "#EDF1F8",
  textMuted: "#A3ABBD",
  accent: "#F2A25C",
  accentBright: "#F7A65A",
  success: "#5FCB8E",
  warning: "#F0A35E",
  danger: "#F07A68",
  brand: "#5BB8EE",
  onBrand: "#0F131C",
  // Navy ink on the light `primary`.
  onPrimary: "#14203D",
  // Navy blended onto `primary` at 62% / 20% / 9%.
  onPrimaryMuted: "#646E84",
  onPrimarySubtle: "#BCC3D2",
  onPrimaryFaint: "#D3DAE6",
  textFaint: "#1C2232",
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
    display: { fontSize: 34, lineHeight: 38, fontWeight: "700", letterSpacing: -1 },
    hero: { fontSize: 26, lineHeight: 32, fontWeight: "700", letterSpacing: -0.5 },
    heading: { fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.2 },
    subheading: { fontSize: 16, lineHeight: 22, fontWeight: "600", letterSpacing: -0.1 },
    body: { fontSize: 15, lineHeight: 22, fontWeight: "400", letterSpacing: -0.05 },
    caption: { fontSize: 12.5, lineHeight: 17, fontWeight: "500" },
    micro: { fontSize: 10.5, lineHeight: 14, fontWeight: "600", letterSpacing: 1 },
  },
} as const;

export type Theme = typeof theme;

/** A full theme object for a given mode — same shape, mode-specific colours. */
export const lightTheme: Theme = { ...theme, colors: lightColors };
export const darkTheme: Theme = { ...theme, colors: darkColors };
