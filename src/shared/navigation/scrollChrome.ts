// C:\OOTDify\src\shared\navigation\scrollChrome.ts
// When the tab bar and floating buttons ("chrome") hide while a list scrolls.
// Pure, so it runs in the node Jest environment; useTabChrome wires it up.
import { create } from "zustand";

/** Within this many points of the top, the chrome always shows. */
export const SCROLL_TOP_ZONE = 24;
/** Movements smaller than this are ignored, so the bar doesn't flicker. */
export const SCROLL_DEADBAND = 8;

/** Scrolling down hides the chrome, scrolling up or reaching the top shows it. */
export function nextChromeHidden(prevY: number, y: number, hidden: boolean): boolean {
  if (y <= SCROLL_TOP_ZONE) return false;
  const dy = y - prevY;
  if (dy > SCROLL_DEADBAND) return true;
  if (dy < -SCROLL_DEADBAND) return false;
  return hidden;
}

interface TabChromeState {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
}

export const useTabChromeStore = create<TabChromeState>((set) => ({
  hidden: false,
  setHidden: (hidden) => set((s) => (s.hidden === hidden ? s : { hidden })),
}));
