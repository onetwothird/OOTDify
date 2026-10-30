// C:\OOTDify\src\shared\theme\makeStyles.ts
// Bridges the old module-scope `StyleSheet.create({...theme.colors})` pattern to
// a runtime theme without repeating memoisation in 51 files.
//
// BEFORE (frozen at import — cannot react to a theme change):
//
//     const styles = StyleSheet.create({
//       screen: { backgroundColor: theme.colors.background },
//     });
//
// AFTER (rebuilt only when the palette changes):
//
//     const useStyles = makeStyles((t) => ({
//       screen: { backgroundColor: t.colors.background },
//     }));
//
//     function Screen() {
//       const styles = useStyles();
//       ...
//     }
//
// The factory is called once per (hook, theme) pair and cached in a WeakMap, so
// switching themes does not thrash `StyleSheet.create` on every render, and
// switching back reuses the previous result.
import { useMemo } from "react";
import { StyleSheet } from "react-native";
import type * as ReactNative from "react-native";

import { adjustTextStyles } from "./accessibility";
import { useAppTheme } from "./ThemeProvider";
import type { Theme } from "../config/theme";

// `StyleSheet.create` is declared as `create<T extends NamedStyles<T> |
// NamedStyles<any>>(styles: T & NamedStyles<any>): T`, and `NamedStyles` is not
// exported from react-native. Mirror its definition so the type argument here
// satisfies the same constraint the library enforces.
type RNStyle = ReactNative.ViewStyle | ReactNative.TextStyle | ReactNative.ImageStyle;
type NamedStyles<T> = { [P in keyof T]: RNStyle };
type Factory<S extends NamedStyles<S>> = (theme: Theme) => S;

// theme -> (factory -> created styles). WeakMap keyed on the theme object means
// a palette that is garbage collected takes its derived styles with it.
const cache = new WeakMap<Theme, Map<unknown, unknown>>();

export function makeStyles<S extends NamedStyles<S> | NamedStyles<any>>(
  factory: Factory<S>,
): () => S {
  return function useStyles() {
    const theme = useAppTheme();
    return useMemo(() => {
      let perTheme = cache.get(theme);
      if (!perTheme) {
        perTheme = new Map();
        cache.set(theme, perTheme);
      }
      const existing = perTheme.get(factory);
      if (existing) return existing as S;
      // Text size and bold text (Settings > Accessibility) apply here, once.
      const created = StyleSheet.create<S>(adjustTextStyles(factory(theme) as S, theme.text));
      perTheme.set(factory, created);
      return created;
    }, [theme]);
  };
}
