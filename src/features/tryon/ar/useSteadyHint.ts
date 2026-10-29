// React wrapper over the pure steadiness reducer: the shown hint changes only
// after a new one has held, and `readyToShoot` waits for a steady "good".
import { useEffect, useState } from "react";

import type { FramingHint } from "./framing";
import { INITIAL_STEADY, READY_MS, SWITCH_MS, isReadyToShoot, nextSteadyHint } from "./steadyHint";

export function useSteadyHint(hint: FramingHint): { shown: FramingHint; readyToShoot: boolean } {
  const [state, setState] = useState(INITIAL_STEADY);
  // The reducer state for which the ready timer confirmed READY_MS of steady
  // "good". Any new state object (a changed candidate) invalidates it.
  const [readyState, setReadyState] = useState<typeof INITIAL_STEADY | null>(null);

  // Feed each new hint in (from a timer: effects don't set state directly).
  useEffect(() => {
    const id = setTimeout(() => setState((prev) => nextSteadyHint(prev, hint, Date.now())), 0);
    return () => clearTimeout(id);
  }, [hint]);

  // Re-check once the switch delay has elapsed, timed from the state's own
  // `since`, so a late timer can never leave a held hint unswitched.
  useEffect(() => {
    if (state.candidate === state.shown) return;
    const wait = Math.max(0, state.since + SWITCH_MS + 5 - Date.now());
    const id = setTimeout(() => setState((prev) => nextSteadyHint(prev, hint, Date.now())), wait);
    return () => clearTimeout(id);
  }, [state, hint]);

  useEffect(() => {
    if (state.shown !== "good") return;
    const wait = Math.max(0, state.since + READY_MS + 5 - Date.now());
    const id = setTimeout(() => {
      if (isReadyToShoot(state, Date.now())) setReadyState(state);
    }, wait);
    return () => clearTimeout(id);
  }, [state]);

  return { shown: state.shown, readyToShoot: readyState === state };
}
