// React wrapper over the pure steadiness reducer: the shown hint changes only
// after a new one has held, and `readyToShoot` waits for a steady "good".
import { useEffect, useState } from "react";

import type { FramingHint } from "./framing";
import { INITIAL_STEADY, READY_MS, SWITCH_MS, nextSteadyHint } from "./steadyHint";

export function useSteadyHint(hint: FramingHint): { shown: FramingHint; readyToShoot: boolean } {
  const [state, setState] = useState(INITIAL_STEADY);
  // The `since` value the ready timer last fired for; ready only while it matches.
  const [readySince, setReadySince] = useState<number | null>(null);

  // Feed each new hint in, and re-evaluate once the switch delay has passed
  // (the hint itself may not change again to trigger it).
  useEffect(() => {
    const feed = () => setState((prev) => nextSteadyHint(prev, hint, Date.now()));
    const first = setTimeout(feed, 0);
    const later = setTimeout(feed, SWITCH_MS);
    return () => {
      clearTimeout(first);
      clearTimeout(later);
    };
  }, [hint]);

  useEffect(() => {
    if (state.shown !== "good") return;
    const wait = Math.max(0, state.since + READY_MS - Date.now());
    const id = setTimeout(() => setReadySince(state.since), wait);
    return () => clearTimeout(id);
  }, [state.shown, state.since]);

  const readyToShoot = state.shown === "good" && readySince === state.since;
  return { shown: state.shown, readyToShoot };
}
