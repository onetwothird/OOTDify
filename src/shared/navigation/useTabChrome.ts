// C:\OOTDify\src\shared\navigation\useTabChrome.ts
// Hooks for tab screens: report scrolling so the tab bar can slide away, and
// pad content so its end clears the floating tab bar and Create (+) stack.
import { useCallback, useRef } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { nextChromeHidden, useTabChromeStore } from "./scrollChrome";

/** Icon (24) + label + gaps. */
export const TAB_BAR_CONTENT = 52;
/** Room the Create (+) button needs above the tab bar. */
const FAB_LANE = 84;

/** Full tab bar height, home-indicator inset included. */
export function useTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  // Phones without a home indicator still get a little breathing room.
  return TAB_BAR_CONTENT + 6 + Math.max(insets.bottom, 8);
}

/** Bottom padding for a tab screen's scroll content. */
export function useTabBarSpace(): number {
  return useTabBarHeight() + FAB_LANE;
}

/** Spread onto a tab screen's main ScrollView / FlatList. */
export function useHideOnScroll() {
  const setHidden = useTabChromeStore((s) => s.setHidden);
  // Read and written only inside the scroll handler, never during render.
  const lastY = useRef(0);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      setHidden(nextChromeHidden(lastY.current, y, useTabChromeStore.getState().hidden));
      lastY.current = y;
    },
    [setHidden],
  );
  return { onScroll, scrollEventThrottle: 16 } as const;
}
