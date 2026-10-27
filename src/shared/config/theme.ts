// C:\OOTDify\src\shared\config\theme.ts
// OOTDify design tokens, drawn from the mascot penguin: royal blue body, sky
// blue cape, white belly, navy outline. Light mode is the penguin by day (icy
// page, royal blue emphasis, navy type); dark mode is the penguin at night.
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
  // Icy page, the white of the penguin's belly with a breath of blue.
  background: "#EEF4FB",
  // Cards / sheets.
  surface: "#FFFFFF",
  // Raised-but-quiet fills (chips, icon tiles).
  surfaceAlt: "#E1EBF7",
  border: "#D3E0F0",
  // Penguin royal blue: buttons, active states, the tab bar's selected item.
  primary: "#2F5BC4",
  primaryMuted: "#E4ECFA",
  // Navy ink instead of black, so type sits in the same family as the blues.
  text: "#14213F",
  textMuted: "#52617F",
  // The cape's deeper blue: favourites, tags, small highlights.
  accent: "#1F6FB8",
  success: "#2E8A57",
  warning: "#B5641F",
  danger: "#C8402F",
  onPrimary: "#FFFFFF",
  // White blended onto `primary` at 68% / 20% / 9%.
  onPrimaryMuted: "#BCCBEC",
  onPrimarySubtle: "#597CD0",
  onPrimaryFaint: "#426AC9",
  textFaint: "#E6EEF8",
};

// Dark palette: the penguin at night. Navy layers that step lighter as they
// come forward, and the cape's sky blue as the emphasis colour, bright enough
// to carry buttons against the dark page.
export const darkColors: ThemeColors = {
  // Deepest layer: the page behind everything.
  background: "#0B1633",
  // Cards / sheets — one step forward from the page.
  surface: "#14224A",
  // Raised-but-quiet fills (chips, icon tiles).
  surfaceAlt: "#1C2D5E",
  border: "#2A3D73",
  // Sky blue from the cape: buttons, active states.
  primary: "#5BB8EE",
  primaryMuted: "#182A59",
  text: "#EAF1FB",
  textMuted: "#9FB2D6",
  accent: "#8ACFF5",
  success: "#5FCB8E",
  warning: "#F0A35E",
  danger: "#F07A68",
  // Navy ink on the light sky-blue `primary`.
  onPrimary: "#0B1633",
  // Navy blended onto `primary` at 62% / 20% / 9%.
  onPrimaryMuted: "#29547A",
  onPrimarySubtle: "#4B98C9",
  onPrimaryFaint: "#54A9DD",
  textFaint: "#16244F",
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
