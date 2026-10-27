// C:\OOTDify\src\shared\config\theme.ts
// OOTDify design tokens: denim and copper. One blue only, a calm,
// low-saturation denim (`brand`) that never glares, reserved for ACTIONS: main
// buttons, the + button, the selected tab, links. Structure (avatars, tags,
// selected chips) is a very light denim tint `primary` with denim ink, and
// icons, toggles and selection marks use `brand` itself; pages and cards are
// neutral; copper, like the rivets on a pair of jeans, is the accent for
// favourites and tags. The mascot's colours follow `brand`.
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
  // Deep denim for the one dark feature card (Outfits "Build"), dark in both
  // modes, with white type and its tints.
  feature: string;
  onFeature: string;
  onFeatureMuted: string;
  onFeatureSubtle: string;
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
  // Neutral off-white page; denim reads as the one colour against it.
  background: "#F5F6F8",
  // Cards / sheets.
  surface: "#FFFFFF",
  // Raised-but-quiet fills (chips, icon tiles).
  surfaceAlt: "#ECEEF1",
  border: "#E1E3E8",
  // A very light denim tint: structural fills (avatars, tags, selected
  // chips), drawn with denim ink (`onPrimary`) on top.
  primary: "#E5EAF1",
  primaryMuted: "#EEF0F3",
  text: "#1B1F27",
  textMuted: "#5E636D",
  // Copper, deepened so small text stays readable.
  accent: "#A64F08",
  accentBright: "#E8892E",
  success: "#2E8A57",
  warning: "#B5641F",
  danger: "#C8402F",
  // Denim.
  brand: "#3A5A96",
  onBrand: "#FFFFFF",
  feature: "#22355C",
  onFeature: "#FFFFFF",
  onFeatureMuted: "#C1C6D1",
  onFeatureSubtle: "#455576",
  onPrimary: "#2F4C82",
  // Denim ink blended onto `primary`: secondary text / hairlines / glows.
  onPrimaryMuted: "#506896",
  onPrimarySubtle: "#C8D1DF",
  onPrimaryFaint: "#D8DFE9",
  textFaint: "#EEF0F3",
};

// Dark palette: neutral charcoal layers that step lighter as they come forward,
// soft light grey for structure, and washed denim for actions.
export const darkColors: ThemeColors = {
  // Deepest layer: the page behind everything.
  background: "#111418",
  // Cards / sheets — one step forward from the page.
  surface: "#1A1D23",
  // Raised-but-quiet fills (chips, icon tiles).
  surfaceAlt: "#23272E",
  border: "#2E333B",
  // A dim denim tint, the dark-mode counterpart of the light tint.
  primary: "#303947",
  primaryMuted: "#22262D",
  text: "#EDEFF2",
  textMuted: "#A5ABB5",
  accent: "#F2A25C",
  accentBright: "#F2A25C",
  success: "#5FCB8E",
  warning: "#F0A35E",
  danger: "#F07A68",
  // Washed denim.
  brand: "#7F9CC8",
  onBrand: "#11141A",
  feature: "#263B66",
  onFeature: "#FFFFFF",
  onFeatureMuted: "#C2C8D4",
  onFeatureSubtle: "#495A7E",
  // Pale denim ink on the dim tint.
  onPrimary: "#C3D3EC",
  // Ink blended onto `primary`: secondary text / hairlines / glows.
  onPrimaryMuted: "#9AA8BE",
  onPrimarySubtle: "#485261",
  onPrimaryFaint: "#3A4453",
  textFaint: "#1E2228",
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
