// C:\OOTDify\src\features\community\usePresenceHeartbeat.ts
// Checks in while the app is open and in the foreground, so friends see a
// green dot. Stops in the background; friends then see the user go offline
// once ONLINE_WINDOW_MS passes. Failures are silent: presence is a hint, and
// a missed beat only makes the dot go grey a little early.
import { useEffect } from "react";
import { AppState } from "react-native";

import { HEARTBEAT_MS } from "./social";
import { heartbeat } from "./socialService";

export function usePresenceHeartbeat() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const beat = () => void heartbeat().catch(() => {});
    const start = () => {
      if (timer) return;
      beat();
      timer = setInterval(beat, HEARTBEAT_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    if (AppState.currentState === "active") start();
    const sub = AppState.addEventListener("change", (next) => (next === "active" ? start() : stop()));
    return () => {
      stop();
      sub.remove();
    };
  }, []);
}
