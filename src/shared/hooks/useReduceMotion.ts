// True when the OS "reduce motion" setting is on, or the app's own Reduce
// motion (Settings > Accessibility); animations should jump.
import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

import { useSettingsStore } from "../../features/settings/settingsStore";

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  const appReduce = useSettingsStore((s) => s.reduceMotion);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => alive && setReduce(on))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce || appReduce;
}
